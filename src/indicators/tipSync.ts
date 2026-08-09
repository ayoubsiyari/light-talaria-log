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
 * - syncReplayReveal only grows buffers (O(series), no Worker) so candles never wait.
 * - Tip Worker runs at most every N new bars OR min interval — keeps replay FPS free.
 * Slightly tighter than 8/150 so hold-fill plateaus don't read as tip shake.
 */
export const INDICATOR_TIP_EVERY_BARS = 4;
export const INDICATOR_TIP_MIN_MS = 100;

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

function mapSeries(series: IndicatorSeries[], len: number): IndicatorSeries[] {
  return series.map((s) => ({
    ...s,
    values: growValues(s.values, len),
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
 * Stitch a trailing-window Worker result into full-length series.
 * Only the overlapping tip is rewritten — history stays untouched.
 *
 * Tip windows are computed in isolation, so their leading samples are warmup
 * NaNs. Never write those over finite history (that erased MAs on older bars).
 */
export function stitchTipSeries(
  full: Float32Array,
  tip: Float32Array,
  barsLen: number,
): Float32Array {
  // Copy-on-write when length already matches — avoid mutating the live buffer.
  const out =
    full.length === barsLen ? full.slice() : growValues(full, barsLen);
  const tipLen = tip.length;
  if (tipLen === 0 || barsLen === 0) return out;
  const start = Math.max(0, barsLen - tipLen);
  for (let i = 0; i < tipLen; i++) {
    const dest = start + i;
    if (dest >= barsLen) break;
    const v = tip[i]!;
    if (!Number.isFinite(v) && Number.isFinite(out[dest]!)) continue;
    out[dest] = v;
  }
  return out;
}

export function stitchTipOverlays(
  current: readonly IndicatorOverlayResult[],
  tipOverlays: readonly IndicatorOverlayResult[],
  barsLen: number,
): IndicatorOverlayResult[] {
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

/**
 * Remap indicator values onto a slid/replaced bar buffer by wall-clock time.
 * Keeps MAs glued to the correct candles until the full Worker catch-up lands.
 * Unknown leading history → NaN; brand-new tip bars → hold last finite.
 */
export function remapValuesByTime(
  values: Float32Array,
  prevBars: readonly ChartBar[],
  nextBars: readonly ChartBar[],
): Float32Array {
  const out = new Float32Array(nextBars.length);
  if (nextBars.length === 0) return out;
  const n = Math.min(values.length, prevBars.length);
  const byTime = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) byTime.set(prevBars[i]!.time, v);
  }
  let last = Number.NaN;
  for (let i = 0; i < nextBars.length; i++) {
    const v = byTime.get(nextBars[i]!.time);
    if (v !== undefined) {
      out[i] = v;
      last = v;
    } else if (Number.isFinite(last)) {
      out[i] = last;
    } else {
      out[i] = Number.NaN;
    }
  }
  return out;
}

export function remapOverlaysByTime(
  overlays: readonly IndicatorOverlayResult[],
  prevBars: readonly ChartBar[],
  nextBars: readonly ChartBar[],
): IndicatorOverlayResult[] {
  return overlays.map((o) => ({
    ...o,
    series: o.series.map((s) => ({
      ...s,
      values: remapValuesByTime(s.values, prevBars, nextBars),
    })),
  }));
}

export function remapPanesByTime(
  panes: readonly IndicatorPaneResult[],
  prevBars: readonly ChartBar[],
  nextBars: readonly ChartBar[],
): IndicatorPaneResult[] {
  return panes.map((p) => ({
    ...p,
    series: p.series.map((s) => ({
      ...s,
      values: remapValuesByTime(s.values, prevBars, nextBars),
    })),
  }));
}
