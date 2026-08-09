import type { ChartBar, VisibleRange } from '@/types/bar';

/** Nice step: 1 / 2 / 5 × 10^n covering the range with ~approxCount ticks. */
export function nicePriceTicks(min: number, max: number, approxCount = 6): number[] {
  if (!(max > min) || approxCount < 2) return [min, max];

  const span = max - min;
  const raw = span / approxCount;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  let step: number;
  if (frac <= 1) step = 1 * pow;
  else if (frac <= 2) step = 2 * pow;
  else if (frac <= 5) step = 5 * pow;
  else step = 10 * pow;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  const end = max + step * 0.5;
  for (let v = start; v <= end; v += step) {
    const rounded = roundToStep(v, step);
    if (rounded >= min - step * 1e-9 && rounded <= max + step * 1e-9) {
      ticks.push(rounded);
    }
    if (ticks.length > 50) break;
  }
  return ticks.length > 0 ? ticks : [min, max];
}

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  const f = Math.pow(10, Math.min(12, decimals));
  return Math.round(value * f) / f;
}

export interface TimeTick {
  /** Logical index — may be < 0 or ≥ bars.length for empty pad. */
  index: number;
  time: number;
}

/** Per-engine sticky state so zoom density doesn't thrash mid-gesture. */
export interface TimeLatticeSticky {
  step: number;
  /** Span (bars) when `step` was last committed. */
  span: number;
}

export interface NiceTimeTicksOpts {
  /** Declared TF period (seconds). Preferred when it matches the series. */
  barPeriod?: number;
  /** Zoom density hysteresis — one object per chart engine. */
  sticky?: TimeLatticeSticky;
}

/** Nice integer steps for logical bar counts (1 / 2 / 5 × 10^n). */
function niceIndexStep(raw: number): number {
  const n = Math.max(1, raw);
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const frac = n / pow;
  let step: number;
  if (frac <= 1) step = 1 * pow;
  else if (frac <= 2) step = 2 * pow;
  else if (frac <= 5) step = 5 * pow;
  else step = 10 * pow;
  return Math.max(1, Math.round(step));
}

/**
 * Hold lattice density unless zoom moved enough — avoids mid-drag step flips
 * that rephase every vertical line.
 */
function niceIndexStepSticky(
  span: number,
  approxCount: number,
  sticky?: TimeLatticeSticky,
): number {
  const next = niceIndexStep(span / Math.max(2, approxCount));
  if (!sticky || sticky.step <= 0 || sticky.span <= 0) {
    if (sticky) {
      sticky.step = next;
      sticky.span = span;
    }
    return next;
  }
  if (next === sticky.step) {
    sticky.span = span;
    return sticky.step;
  }
  const ratio = span / sticky.span;
  // Require ~30% zoom change before accepting a new density.
  if (ratio > 0.7 && ratio < 1 / 0.7) {
    return sticky.step;
  }
  sticky.step = next;
  sticky.span = span;
  return next;
}

/**
 * Stable bar period from the series itself (not the moving viewport),
 * so panning never rephases the lattice mid-drag.
 *
 * Use the *median* gap (same idea as timeframeAgg.barStepSeconds). Mean of
 * tip gaps on 1D is inflated by weekends (~3×) and drifts as Sat/Sun enter
 * or leave the tip window → grid phase jumps while candles stay put.
 */
export function seriesBarPeriod(bars: readonly ChartBar[]): number {
  if (bars.length < 2) return 60;
  const samples: number[] = [];
  const hi = bars.length - 1;
  const lo = Math.max(0, hi - Math.min(64, hi));
  for (let i = lo; i < hi; i++) {
    const d = bars[i + 1]!.time - bars[i]!.time;
    if (d > 0) samples.push(d);
  }
  if (samples.length === 0) {
    const d0 = bars[1]!.time - bars[0]!.time;
    return d0 > 0 ? Math.max(1, d0) : 60;
  }
  samples.sort((a, b) => a - b);
  return Math.max(1, samples[Math.floor(samples.length / 2)]! || 60);
}

/**
 * Prefer the pane's declared TF period when the series agrees; otherwise median.
 * Stops floaty sampled periods on mixed/gap data.
 */
export function resolveBarPeriod(
  bars: readonly ChartBar[],
  preferredSec?: number,
): number {
  const median = seriesBarPeriod(bars);
  if (preferredSec == null || !(preferredSec > 0)) return median;
  // Plausible match (weekends / missing bars can inflate median slightly).
  if (median <= preferredSec * 2.5 && median >= preferredSec * 0.4) {
    return preferredSec;
  }
  return median;
}

/** Wall-clock at a logical index — extrapolates into empty left/right pad. */
function timeAtLogicalIndex(
  bars: readonly ChartBar[],
  index: number,
  period: number,
): number {
  if (bars.length === 0) return 0;
  if (index >= 0 && index < bars.length) {
    const lo = Math.floor(index);
    const hi = Math.min(bars.length - 1, lo + 1);
    if (lo === hi || lo < 0) return bars[Math.max(0, lo)]!.time;
    const frac = index - lo;
    return bars[lo]!.time + (bars[hi]!.time - bars[lo]!.time) * frac;
  }
  if (index >= bars.length) {
    const tip = bars.length - 1;
    return bars[tip]!.time + (index - tip) * period;
  }
  return bars[0]!.time + index * period;
}

/**
 * Paper-stable time grid.
 *
 * Lines sit on a fixed logical-index lattice (equal spacing). While you drag,
 * tick *indices* stay put and only their screen X moves with the camera —
 * like sliding graph paper. No bar-snapping, no wall-clock rephase mid-pan.
 *
 * Lattice phase is locked to an integer bar sequence from `bars[0]` so when the
 * replay warm-cache slides, every line shifts with the candles (no float drift).
 * Empty left/right pad is filled by extrapolating time from the bar period.
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 8,
  opts?: NiceTimeTicksOpts,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const step = niceIndexStepSticky(span, approxCount, opts?.sticky);
  const period = resolveBarPeriod(bars, opts?.barPeriod);

  // Integer sequence — avoids float phase jitter on long unix timestamps.
  const baseSeq = Math.round(bars[0]!.time / period);
  const phase = ((baseSeq % step) + step) % step;

  // Lattice: index = k·step − phase  (equal gaps, stable under pan)
  let index = Math.ceil((range.fromIndex + phase) / step) * step - phase;
  if (index < range.fromIndex - 1e-9) index += step;

  const ticks: TimeTick[] = [];
  for (; index < range.toIndex - 1e-9; index += step) {
    ticks.push({
      index,
      time: timeAtLogicalIndex(bars, index, period),
    });
    if (ticks.length > 48) break;
  }

  if (ticks.length === 0) {
    const mid = (range.fromIndex + range.toIndex) / 2;
    ticks.push({
      index: mid,
      time: timeAtLogicalIndex(bars, mid, period),
    });
  }

  return ticks;
}
