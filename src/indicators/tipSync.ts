import type { ChartBar } from '@/types/bar';
import type {
  IndicatorOverlayResult,
  IndicatorPaneResult,
  IndicatorSeries,
} from '@/types/indicator';

/** Trailing bars for tip recompute — enough for long MAs, far cheaper than full 2500. */
export const INDICATOR_TIP_WINDOW = 320;

/**
 * Replay isolation budget:
 * - syncReplayReveal only grows/shifts buffers (O(series), no Worker) so candles never wait.
 * - Tip Worker runs at most every N new bars AND min interval — keeps replay FPS free.
 * Kept tight so hold→stitch jumps stay small (flat tip hold was visible shake).
 */
export const INDICATOR_TIP_EVERY_BARS = 2;
export const INDICATOR_TIP_MIN_MS = 48;
/** Forming tip (same bar count) — refresh a bit faster so overlays track OHLC. */
export const INDICATOR_TIP_FORMING_MIN_MS = 32;

function growValues(prev: Float32Array, len: number): Float32Array {
  if (prev.length === len) return prev;
  if (prev.length > len) return prev.subarray(0, len).slice();
  const next = new Float32Array(len);
  next.set(prev);
  let fill = Number.NaN;
  for (let i = prev.length - 1; i >= 0; i--) {
    const v = prev[i]!;
    if (Number.isFinite(v)) {
      fill = v;
      break;
    }
  }
  for (let i = prev.length; i < len; i++) next[i] = fill;
  return next;
}

/**
 * Warm-cache slide: drop `srcOffset` values from the front, copy the overlap,
 * hold-fill any new tip. Keeps history aligned until the Worker catch-up lands.
 */
function shiftValues(
  prev: Float32Array,
  srcOffset: number,
  newLen: number,
): Float32Array {
  if (newLen <= 0) return new Float32Array(0);
  if (srcOffset <= 0) return growValues(prev, newLen);
  const next = new Float32Array(newLen);
  next.fill(Number.NaN);
  const srcStart = Math.min(srcOffset, prev.length);
  const copyCount = Math.min(prev.length - srcStart, newLen);
  if (copyCount > 0) {
    next.set(prev.subarray(srcStart, srcStart + copyCount), 0);
  }
  let fill = Number.NaN;
  for (let i = copyCount - 1; i >= 0; i--) {
    const v = next[i]!;
    if (Number.isFinite(v)) {
      fill = v;
      break;
    }
  }
  for (let i = Math.max(0, copyCount); i < newLen; i++) next[i] = fill;
  return next;
}

function mapSeries(series: IndicatorSeries[], len: number): IndicatorSeries[] {
  return series.map((s) => ({
    ...s,
    values: growValues(s.values, len),
  }));
}

function shiftSeries(
  series: IndicatorSeries[],
  srcOffset: number,
  len: number,
): IndicatorSeries[] {
  return series.map((s) => ({
    ...s,
    values: shiftValues(s.values, srcOffset, len),
  }));
}

/** Instantly match indicator buffer lengths to bar count (no Worker). Prevents paint hide. */
export function alignIndicatorOverlays(
  overlays: readonly IndicatorOverlayResult[],
  len: number,
): IndicatorOverlayResult[] {
  if (len <= 0) return [];
  return overlays.map((o) => ({
    ...o,
    series: mapSeries(o.series, len),
  }));
}

export function alignIndicatorPanes(
  panes: readonly IndicatorPaneResult[],
  len: number,
): IndicatorPaneResult[] {
  if (len <= 0) return [];
  return panes.map((p) => ({
    ...p,
    series: mapSeries(p.series, len),
  }));
}

/**
 * How many bars dropped from the front of `prev` to reach `next[0]`.
 * Returns 0 when prefixes match (append/patch path).
 */
export function slideOffset(
  prev: readonly ChartBar[],
  next: readonly ChartBar[],
): number {
  if (prev.length === 0 || next.length === 0) return 0;
  if (prev[0]!.time === next[0]!.time) return 0;
  const nextStart = next[0]!.time;
  let i = 0;
  while (i < prev.length && prev[i]!.time < nextStart) i++;
  if (i < prev.length && prev[i]!.time === nextStart) return i;
  // Seek / unrelated window — caller should runFull, not shift.
  return -1;
}

/** Remap overlay series after a warm-cache slide (index space changed). */
export function shiftIndicatorOverlays(
  overlays: readonly IndicatorOverlayResult[],
  srcOffset: number,
  len: number,
): IndicatorOverlayResult[] {
  if (len <= 0) return [];
  if (srcOffset <= 0) return alignIndicatorOverlays(overlays, len);
  return overlays.map((o) => ({
    ...o,
    series: shiftSeries(o.series, srcOffset, len),
  }));
}

export function shiftIndicatorPanes(
  panes: readonly IndicatorPaneResult[],
  srcOffset: number,
  len: number,
): IndicatorPaneResult[] {
  if (len <= 0) return [];
  if (srcOffset <= 0) return alignIndicatorPanes(panes, len);
  return panes.map((p) => ({
    ...p,
    series: shiftSeries(p.series, srcOffset, len),
  }));
}

/**
 * Stitch a trailing-window Worker result into full-length series.
 * Only the overlapping tip is rewritten — history stays untouched.
 *
 * Important: tip windows are computed in isolation, so their leading values are
 * warmup NaNs. Never write those over finite history (that was deleting MAs
 * from older candles during Play).
 */
export function stitchTipSeries(
  full: Float32Array,
  tip: Float32Array,
  barsLen: number,
): Float32Array {
  const tipLen = tip.length;
  if (barsLen <= 0) return new Float32Array(0);

  // Orphan tip-sized buffer must NOT growValues onto the left (that mis-paints
  // recent MA values onto old candles, then a slide wipes them → empty history).
  const orphanTip =
    full.length === 0 ||
    (full.length < barsLen && full.length <= Math.max(tipLen, INDICATOR_TIP_WINDOW));

  let out: Float32Array;
  if (full.length === barsLen) {
    out = full.slice(); // copy-on-write — never mutate a live paint buffer
  } else if (orphanTip) {
    out = new Float32Array(barsLen);
    out.fill(Number.NaN);
  } else {
    out = growValues(full, barsLen);
  }

  if (tipLen === 0) return out;
  const start = Math.max(0, barsLen - tipLen);
  for (let i = 0; i < tipLen; i++) {
    const dest = start + i;
    if (dest >= barsLen) break;
    const v = tip[i]!;
    // Keep known history when tip warmup is NaN.
    if (!Number.isFinite(v) && Number.isFinite(out[dest]!)) continue;
    out[dest] = v;
  }
  return out;
}

function materializeTipAsTrailing(
  tipOverlays: readonly IndicatorOverlayResult[],
  barsLen: number,
): IndicatorOverlayResult[] {
  return tipOverlays.map((o) => ({
    ...o,
    series: o.series.map((s) => {
      const values = new Float32Array(barsLen);
      values.fill(Number.NaN);
      const tip = s.values;
      const start = Math.max(0, barsLen - tip.length);
      for (let i = 0; i < tip.length; i++) {
        const v = tip[i]!;
        if (Number.isFinite(v)) values[start + i] = v;
      }
      return { ...s, values };
    }),
  }));
}

export function stitchTipOverlays(
  current: readonly IndicatorOverlayResult[],
  tipOverlays: readonly IndicatorOverlayResult[],
  barsLen: number,
): IndicatorOverlayResult[] {
  if (barsLen <= 0) return [];
  // Tip landed before the first full compute — park finite tip values on the
  // right edge only (never grow onto the left). Caller should still runFull.
  if (current.length === 0) {
    return materializeTipAsTrailing(tipOverlays, barsLen);
  }
  const byKey = new Map(tipOverlays.map((o) => [o.instanceKey, o]));
  return current.map((o) => {
    const tip = byKey.get(o.instanceKey);
    if (!tip) {
      return { ...o, series: mapSeries(o.series, barsLen) };
    }
    const tipBySeries = new Map(tip.series.map((s) => [s.key, s]));
    return {
      ...o,
      series: o.series.map((s) => {
        const ts = tipBySeries.get(s.key);
        return {
          ...s,
          values: ts
            ? stitchTipSeries(s.values, ts.values, barsLen)
            : growValues(s.values, barsLen),
        };
      }),
    };
  });
}

export function stitchTipPanes(
  current: readonly IndicatorPaneResult[],
  tipPanes: readonly IndicatorPaneResult[],
  barsLen: number,
): IndicatorPaneResult[] {
  if (barsLen <= 0) return [];
  if (current.length === 0) {
    return tipPanes.map((p) => ({
      ...p,
      series: p.series.map((s) => {
        const values = new Float32Array(barsLen);
        values.fill(Number.NaN);
        const tip = s.values;
        const start = Math.max(0, barsLen - tip.length);
        for (let i = 0; i < tip.length; i++) {
          const v = tip[i]!;
          if (Number.isFinite(v)) values[start + i] = v;
        }
        return { ...s, values };
      }),
    }));
  }
  const byKey = new Map(tipPanes.map((p) => [p.instanceKey, p]));
  return current.map((p) => {
    const tip = byKey.get(p.instanceKey);
    if (!tip) {
      return { ...p, series: mapSeries(p.series, barsLen) };
    }
    const tipBySeries = new Map(tip.series.map((s) => [s.key, s]));
    return {
      ...p,
      series: p.series.map((s) => {
        const ts = tipBySeries.get(s.key);
        return {
          ...s,
          values: ts
            ? stitchTipSeries(s.values, ts.values, barsLen)
            : growValues(s.values, barsLen),
        };
      }),
    };
  });
}

/** True when the left half of a series is mostly empty — tip-only corruption. */
export function indicatorHistorySparse(
  overlays: readonly IndicatorOverlayResult[],
  panes: readonly IndicatorPaneResult[],
  barsLen: number,
): boolean {
  if (barsLen < 8) return false;
  const series = [
    ...overlays.flatMap((o) => o.series),
    ...panes.flatMap((p) => p.series),
  ];
  if (series.length === 0) return true;
  const mid = Math.floor(barsLen / 2);
  const sampleTo = Math.min(mid, 96);
  for (const s of series) {
    if (s.values.length < barsLen) return true;
    let finite = 0;
    for (let i = 0; i < sampleTo; i++) {
      if (Number.isFinite(s.values[i]!)) finite++;
    }
    // Legitimate MA warmup can blank a short prefix — not half the buffer.
    if (finite < sampleTo * 0.2) return true;
  }
  return false;
}

/** Slice trailing window for tip recompute. */
export function tipWindowBars(
  bars: readonly ChartBar[],
  window = INDICATOR_TIP_WINDOW,
): readonly ChartBar[] {
  if (bars.length <= window) return bars;
  return bars.slice(bars.length - window);
}

/** True when buffer slid / seeked — history must be fully recomputed. */
export function needsFullIndicatorRecompute(
  prev: readonly ChartBar[] | null,
  next: readonly ChartBar[],
): boolean {
  if (!prev || prev.length === 0) return true;
  if (next.length === 0) return true;
  if (prev[0]!.time !== next[0]!.time) return true;
  if (next.length + 8 < prev.length) return true; // large rewind
  return false;
}
