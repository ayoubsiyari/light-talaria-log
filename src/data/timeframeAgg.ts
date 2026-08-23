import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { MAX_BARS_IN_MEMORY, VISIBLE_BARS_TARGET } from '@/utils/constants';
import { createBarStore, toChartBars, type BinaryBarStore } from './binaryBar';
import { isPositiveOhlc, isValidOhlcBar } from './ohlcGuard';
import {
  inferDailySessionKind,
  sessionDayBucketEnd,
  sessionDayBucketStart,
  type DailySessionKind,
} from '@/data/sessionDay';

/** Bar period in seconds for each UI timeframe. */
export function timeframeSeconds(tf: Timeframe): number {
  switch (tf) {
    case '1m':
      return 60;
    case '5m':
      return 5 * 60;
    case '15m':
      return 15 * 60;
    case '1h':
      return 60 * 60;
    case '4h':
      return 4 * 60 * 60;
    case '1D':
      return 24 * 60 * 60;
  }
}

export function canAggregateFrom(baseTf: Timeframe, targetTf: Timeframe): boolean {
  return timeframeSeconds(targetTf) >= timeframeSeconds(baseTf);
}

/** Timeframes that can be built from a base series (same or coarser). */
export function aggregatableTimeframes(baseTf: Timeframe): Timeframe[] {
  const all: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];
  return all.filter((tf) => canAggregateFrom(baseTf, tf));
}

export function bucketStart(timeSec: number, periodSec: number): number {
  return Math.floor(timeSec / periodSec) * periodSec;
}

export type AggregateBarsOpts = {
  /** Pair / root — selects FX NY / CME CT / UTC crypto daily sessions. */
  symbol?: string | null;
  /** Explicit override; wins over `symbol` when set. */
  dailySession?: DailySessionKind;
};

/**
 * Bucket open for a TF. Intraday stays on the UTC period grid; 1D uses
 * market session days when `symbol` / `dailySession` says so.
 */
export function tfBucketStart(
  timeSec: number,
  tf: Timeframe,
  opts?: AggregateBarsOpts,
): number {
  const period = timeframeSeconds(tf);
  if (tf !== '1D') return bucketStart(timeSec, period);
  const kind = opts?.dailySession ?? inferDailySessionKind(opts?.symbol);
  return sessionDayBucketStart(timeSec, kind);
}

export function tfBucketEnd(
  bucketOpen: number,
  tf: Timeframe,
  opts?: AggregateBarsOpts,
): number {
  const period = timeframeSeconds(tf);
  if (tf !== '1D') return bucketOpen + period;
  const kind = opts?.dailySession ?? inferDailySessionKind(opts?.symbol);
  return sessionDayBucketEnd(bucketOpen, kind);
}

const TF_ORDER: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

/**
 * Adjacent timeframes in the UI ladder (one finer + one coarser when present).
 * Used to warm-cache neighbors on Pause so the next TF click paints instantly.
 */
export function neighborTimeframes(
  current: Timeframe,
  available: readonly Timeframe[] = TF_ORDER,
): Timeframe[] {
  const avail = TF_ORDER.filter((tf) => available.includes(tf));
  const i = avail.indexOf(current);
  if (i < 0) return [];
  const out: Timeframe[] = [];
  if (i > 0) out.push(avail[i - 1]!);
  if (i + 1 < avail.length) out.push(avail[i + 1]!);
  return out;
}

/** Finest (smallest period) timeframe among a set — used as the multi-pane replay clock. */
export function smallestTimeframe(tfs: readonly Timeframe[]): Timeframe {
  if (tfs.length === 0) return '1m';
  let best = tfs[0]!;
  let bestSec = timeframeSeconds(best);
  for (let i = 1; i < tfs.length; i++) {
    const tf = tfs[i]!;
    const sec = timeframeSeconds(tf);
    if (sec < bestSec) {
      best = tf;
      bestSec = sec;
    }
  }
  return best;
}

/**
 * Aggregate ChartBar[] (typically 1m viewport) into a coarser TF.
 * Used for on-demand HTF when packed series is missing from IDB/remote.
 * Pass `opts.symbol` so 1D uses FX NY / CME CT / UTC crypto sessions.
 */
export function aggregateChartBars(
  base: readonly ChartBar[],
  targetTf: Timeframe,
  opts?: AggregateBarsOpts,
): ChartBar[] {
  if (base.length === 0) return [];
  const period = timeframeSeconds(targetTf);
  if (period <= 0) return base.slice() as ChartBar[];

  const out: ChartBar[] = [];
  let started = false;
  let curBucket = 0;
  let o = 0;
  let h = 0;
  let l = 0;
  let c = 0;
  let v = 0;

  for (let i = 0; i < base.length; i++) {
    const bar = base[i]!;
    // Drop zero/corrupt prints so they never become HTF low=0 spikes.
    if (!isValidOhlcBar(bar)) continue;
    const b = tfBucketStart(bar.time, targetTf, opts);
    if (!started) {
      started = true;
      curBucket = b;
      o = bar.open;
      h = bar.high;
      l = bar.low;
      c = bar.close;
      v = bar.volume ?? 0;
      continue;
    }
    if (b !== curBucket) {
      out.push({ time: curBucket, open: o, high: h, low: l, close: c, volume: v });
      curBucket = b;
      o = bar.open;
      h = bar.high;
      l = bar.low;
      c = bar.close;
      v = bar.volume ?? 0;
    } else {
      if (bar.high > h) h = bar.high;
      if (bar.low < l) l = bar.low;
      c = bar.close;
      v += bar.volume ?? 0;
    }
  }
  if (started) {
    out.push({ time: curBucket, open: o, high: h, low: l, close: c, volume: v });
  }
  return out;
}

/**
 * Aggregate a base OHLCV series (typically 1m) into a coarser timeframe.
 * Returns a new BinaryBarStore. Same TF → copy.
 */
export function aggregateBars(base: BinaryBarStore, targetTf: Timeframe): BinaryBarStore {
  const period = timeframeSeconds(targetTf);
  if (base.length === 0) return createBarStore(0);

  // Upper bound: one output bar per period
  const out = createBarStore(base.length);
  let outLen = 0;

  let started = false;
  let curBucket = 0;
  let o = 0;
  let h = 0;
  let l = 0;
  let c = 0;
  let v = 0;
  let bucketTime = 0;

  for (let i = 0; i < base.length; i++) {
    const oi = base.open[i]!;
    const hi = base.high[i]!;
    const li = base.low[i]!;
    const ci = base.close[i]!;
    if (!isPositiveOhlc(oi, hi, li, ci)) continue;
    const t = base.time[i]!;
    const b = bucketStart(t, period);
    if (!started) {
      started = true;
      curBucket = b;
      bucketTime = b;
      o = oi;
      h = hi;
      l = li;
      c = ci;
      v = base.volume[i]!;
      continue;
    }
    if (b !== curBucket) {
      out.time[outLen] = bucketTime;
      out.open[outLen] = o;
      out.high[outLen] = h;
      out.low[outLen] = l;
      out.close[outLen] = c;
      out.volume[outLen] = v;
      outLen++;

      curBucket = b;
      bucketTime = b;
      o = oi;
      h = hi;
      l = li;
      c = ci;
      v = base.volume[i]!;
    } else {
      if (hi > h) h = hi;
      if (li < l) l = li;
      c = ci;
      v += base.volume[i]!;
    }
  }

  if (started) {
    out.time[outLen] = bucketTime;
    out.open[outLen] = o;
    out.high[outLen] = h;
    out.low[outLen] = l;
    out.close[outLen] = c;
    out.volume[outLen] = v;
    outLen++;
  }
  out.length = outLen;

  // Compact if we over-allocated a lot
  if (outLen < base.length * 0.5) {
    const compact = createBarStore(outLen);
    compact.time.set(out.time.subarray(0, outLen));
    compact.open.set(out.open.subarray(0, outLen));
    compact.high.set(out.high.subarray(0, outLen));
    compact.low.set(out.low.subarray(0, outLen));
    compact.close.set(out.close.subarray(0, outLen));
    compact.volume.set(out.volume.subarray(0, outLen));
    compact.length = outLen;
    return compact;
  }
  return out;
}

/** Binary search: last bar with time ≤ target (or 0). */
export function indexAtOrBefore(store: BinaryBarStore, timeSec: number): number {
  let lo = 0;
  let hi = store.length - 1;
  if (hi < 0) return 0;
  if (timeSec <= store.time[0]) return 0;
  if (timeSec >= store.time[hi]) return hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = store.time[mid];
    if (t === timeSec) return mid;
    if (t < timeSec) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, hi);
}

export interface ViewportWindow {
  bars: ChartBar[];
  range: VisibleRange;
  /** Absolute index of anchor in the full aggregated series (before window trim) */
  anchorIndex: number;
}

/**
 * Build a chart viewport (≤ MAX_BARS_IN_MEMORY) around an anchor time,
 * preserving the same relative place in the preview (anchor near the right).
 */
export function viewportAroundTime(
  series: BinaryBarStore,
  anchorTime: number,
  visibleBars = VISIBLE_BARS_TARGET,
): ViewportWindow {
  const n = series.length;
  if (n === 0) {
    return { bars: [], range: { fromIndex: 0, toIndex: 1 }, anchorIndex: 0 };
  }

  const anchorIndex = indexAtOrBefore(series, anchorTime);
  const windowLen = Math.min(MAX_BARS_IN_MEMORY, n);
  // Keep ~90% of the window to the left of the anchor (TradingView-like)
  let toAbs = Math.min(n, anchorIndex + 1 + Math.floor(windowLen * 0.05));
  let fromAbs = Math.max(0, toAbs - windowLen);
  if (toAbs - fromAbs < windowLen && fromAbs === 0) {
    toAbs = Math.min(n, fromAbs + windowLen);
  }

  const bars = toChartBars(series, fromAbs, toAbs);
  const localAnchor = Math.min(bars.length - 1, Math.max(0, anchorIndex - fromAbs));
  const vis = Math.min(visibleBars, bars.length);
  // Place anchor at ~90% into the visible span
  let toIndex = Math.min(bars.length, localAnchor + 1 + Math.floor(vis * 0.1));
  let fromIndex = Math.max(0, toIndex - vis);
  if (toIndex <= fromIndex) {
    fromIndex = Math.max(0, bars.length - vis);
    toIndex = bars.length;
  }

  return {
    bars,
    range: { fromIndex, toIndex },
    anchorIndex,
  };
}

/** Right-edge time of a visible range on chart bars. */
export function anchorTimeFromRange(
  bars: readonly ChartBar[],
  range: VisibleRange,
): number | null {
  if (bars.length === 0) return null;
  const idx = Math.min(bars.length - 1, Math.max(0, Math.floor(range.toIndex) - 1));
  return bars[idx]?.time ?? bars[bars.length - 1]?.time ?? null;
}

/** Typical bar period (median gap) — used to extrapolate past buffer ends. */
function barStepSeconds(bars: readonly ChartBar[]): number {
  if (bars.length < 2) return 60;
  const samples: number[] = [];
  const n = bars.length - 1;
  const start = Math.max(0, n - 50);
  for (let i = start; i < n; i++) {
    const d = bars[i + 1]!.time - bars[i]!.time;
    if (d > 0) samples.push(d);
  }
  if (samples.length === 0) return 60;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]! || 60;
}

/**
 * Continuous unix time at a fractional logical index.
 * Allows negative / past-end indices so TV-style empty pads survive sync.
 */
export function timeAtLogicalIndex(bars: readonly ChartBar[], index: number): number | null {
  if (bars.length === 0) return null;
  const step = barStepSeconds(bars);
  if (index < 0) return bars[0]!.time + index * step;
  const last = bars.length - 1;
  if (index > last) return bars[last]!.time + (index - last) * step;
  const i0 = Math.floor(index);
  const frac = index - i0;
  if (frac === 0 || i0 >= last) return bars[i0]!.time;
  return bars[i0]!.time + frac * (bars[i0 + 1]!.time - bars[i0]!.time);
}

/** Continuous logical index for a unix time (may be < 0 or > last). */
export function logicalIndexAtTime(bars: readonly ChartBar[], time: number): number {
  if (bars.length === 0) return 0;
  const step = barStepSeconds(bars);
  if (time < bars[0]!.time) return (time - bars[0]!.time) / step;
  const last = bars.length - 1;
  if (time > bars[last]!.time) return last + (time - bars[last]!.time) / step;
  const i = indexAtOrBeforeBars(bars, time);
  if (i >= last) return last;
  const t0 = bars[i]!.time;
  const t1 = bars[i + 1]!.time;
  if (t1 <= t0) return i;
  return i + (time - t0) / (t1 - t0);
}

/** Wall-clock window covered by a visible logical range (fractional, pad-safe). */
export function timeRangeFromVisible(
  bars: readonly ChartBar[],
  range: VisibleRange,
): { fromTime: number; toTime: number } | null {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return null;
  const fromTime = timeAtLogicalIndex(bars, range.fromIndex);
  const toTime = timeAtLogicalIndex(bars, range.toIndex);
  if (fromTime == null || toTime == null) return null;
  return { fromTime, toTime: Math.max(fromTime, toTime) };
}

/** Binary search on ChartBar[]: last bar with time ≤ target. */
export function indexAtOrBeforeBars(bars: readonly ChartBar[], timeSec: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  if (hi < 0) return 0;
  if (timeSec <= bars[0]!.time) return 0;
  if (timeSec >= bars[hi]!.time) return hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = bars[mid]!.time;
    if (t === timeSec) return mid;
    if (t < timeSec) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, hi);
}

/**
 * Map a shared wall-clock window onto a pane's bars (logical VisibleRange).
 * Fractional indices + out-of-bounds pads keep multi-chart pan smooth.
 */
export function visibleRangeFromTimeWindow(
  bars: readonly ChartBar[],
  fromTime: number,
  toTime: number,
): VisibleRange {
  if (bars.length === 0) return { fromIndex: 0, toIndex: 1 };

  const fromIndex = logicalIndexAtTime(bars, fromTime);
  let toIndex = logicalIndexAtTime(bars, toTime);
  if (toIndex <= fromIndex) toIndex = fromIndex + 1;
  return { fromIndex, toIndex };
}

/**
 * Replay reveal: right edge = last bar at-or-before cursor.
 * Grows one candle at a time; scrolls once `visibleBars` is filled.
 */
export function revealRangeAtCursor(
  bars: readonly ChartBar[],
  cursorTime: number,
  visibleBars: number,
): VisibleRange {
  if (bars.length === 0) return { fromIndex: 0, toIndex: 1 };
  const cursorIdx = indexAtOrBeforeBars(bars, cursorTime);
  const toIndex = Math.min(bars.length, cursorIdx + 1);
  const span = Math.max(1, visibleBars);
  const fromIndex = Math.max(0, toIndex - span);
  return { fromIndex, toIndex };
}
