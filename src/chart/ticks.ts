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
  /** Logical bar index — integer so each line sits on a candle center. */
  index: number;
  time: number;
}

/**
 * Per-engine sticky density. Powers of two only so zoom-out drops every other
 * line and survivors stay on the same candles (no rephase / teleport).
 */
export interface TimeLatticeSticky {
  step: number;
  span: number;
}

export interface NiceTimeTicksOpts {
  /** Declared TF period (seconds). Preferred when it matches the series. */
  barPeriod?: number;
  /** One object per chart engine. */
  sticky?: TimeLatticeSticky;
}

/** Nested lattice step: 1, 2, 4, 8, … (always candle-aligned when integer). */
export function nestedIndexStep(raw: number): number {
  const n = Math.max(1, raw);
  const exp = Math.round(Math.log2(n));
  return Math.max(1, 2 ** Math.max(0, exp));
}

/**
 * Octave hysteresis — only double/halve step so the visible lattice is always
 * a subset/superset of the previous frame (candles keep their lines).
 */
function nestedIndexStepSticky(
  span: number,
  approxCount: number,
  sticky?: TimeLatticeSticky,
): number {
  const raw = span / Math.max(2, approxCount);
  if (!sticky || sticky.step <= 0) {
    const step = nestedIndexStep(raw);
    if (sticky) {
      sticky.step = step;
      sticky.span = span;
    }
    return step;
  }

  const hi = sticky.step * Math.SQRT2;
  const lo = sticky.step / Math.SQRT2;
  let step = sticky.step;
  if (raw > hi) {
    while (raw > step * Math.SQRT2) step *= 2;
  } else if (raw < lo) {
    while (step > 1 && raw < step / Math.SQRT2) step = Math.max(1, step / 2);
  }

  sticky.step = step;
  sticky.span = span;
  return step;
}

/**
 * Median bar period from the series tip sample.
 * Weekends must not inflate the period used for pad extrapolation.
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
 */
export function resolveBarPeriod(
  bars: readonly ChartBar[],
  preferredSec?: number,
): number {
  const median = seriesBarPeriod(bars);
  if (preferredSec == null || !(preferredSec > 0)) return median;
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
 * Candle-aligned paper grid.
 *
 * Every vertical line sits on an integer bar index (candle center). Spacing is
 * a power of two so zoom-out only removes every other line — survivors stay on
 * the same candles. Phase locks to the series sequence so warm-cache slides
 * move the grid with the candles.
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 8,
  opts?: NiceTimeTicksOpts,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const step = nestedIndexStepSticky(span, approxCount, opts?.sticky);
  const period = resolveBarPeriod(bars, opts?.barPeriod);

  // Tick when (baseSeq + index) ≡ 0 (mod step) → line through that candle.
  const baseSeq = Math.round(bars[0]!.time / period);
  const phase = ((baseSeq % step) + step) % step;

  // First integer lattice index ≥ range.fromIndex
  let index = Math.ceil((range.fromIndex + phase) / step) * step - phase;
  if (index < range.fromIndex - 1e-9) index += step;
  // Snap tiny float error onto an integer candle slot.
  index = Math.round(index);

  const ticks: TimeTick[] = [];
  for (; index < range.toIndex - 1e-9; index += step) {
    ticks.push({
      index,
      time: timeAtLogicalIndex(bars, index, period),
    });
    if (ticks.length > 48) break;
  }

  if (ticks.length === 0) {
    const mid = Math.round((range.fromIndex + range.toIndex) / 2);
    ticks.push({
      index: mid,
      time: timeAtLogicalIndex(bars, mid, period),
    });
  }

  return ticks;
}
