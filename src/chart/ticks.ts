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
  /** Stroke opacity 0..1 (dense lines fade while zooming). */
  alpha: number;
}

/** @deprecated kept so engines can pass a stub; lattice is a pure function of span. */
export interface TimeLatticeSticky {
  exp: number;
}

export interface NiceTimeTicksOpts {
  /** Declared TF period (seconds). Preferred when it matches the series. */
  barPeriod?: number;
  /** Ignored — accepted for API compat with per-engine paint state. */
  sticky?: TimeLatticeSticky;
}

/** Nested lattice step: 1, 2, 4, 8, … */
export function nestedIndexStep(raw: number): number {
  const n = Math.max(1, raw);
  const exp = Math.max(0, Math.floor(Math.log2(n)));
  return 2 ** exp;
}

function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
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

function pushLattice(
  ticks: TimeTick[],
  range: VisibleRange,
  bars: readonly ChartBar[],
  period: number,
  baseSeq: number,
  step: number,
  alpha: number,
  seen: Set<number>,
): void {
  if (step < 1 || alpha < 0.02) return;
  const phase = ((baseSeq % step) + step) % step;
  let index = Math.ceil((range.fromIndex + phase) / step) * step - phase;
  if (index < range.fromIndex - 1e-9) index += step;
  index = Math.round(index);

  for (; index < range.toIndex - 1e-9; index += step) {
    if (seen.has(index)) continue;
    seen.add(index);
    ticks.push({
      index,
      time: timeAtLogicalIndex(bars, index, period),
      alpha,
    });
    if (ticks.length > 64) break;
  }
}

/**
 * Candle-aligned grid with continuous zoom crossfade (no sticky pop).
 *
 * Pure function of visible span:
 * - coarse lattice (2^{e+1}) always solid
 * - dense lattice (2^e) fades 1→0 across the octave
 *
 * At an octave boundary the roles hand off without jumping indices — every
 * line stays on a candle center.
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 8,
  opts?: NiceTimeTicksOpts,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const period = resolveBarPeriod(bars, opts?.barPeriod);
  const baseSeq = Math.round(bars[0]!.time / period);

  const raw = Math.max(1e-6, span / Math.max(2, approxCount));
  const ticks: TimeTick[] = [];
  const seen = new Set<number>();

  // Very zoomed in: a line on every candle.
  if (raw <= 1) {
    pushLattice(ticks, range, bars, period, baseSeq, 1, 1, seen);
    ticks.sort((a, b) => a.index - b.index);
    return ticks;
  }

  const exact = Math.log2(raw);
  const exp = Math.max(0, Math.floor(exact));
  const frac = exact - exp; // [0, 1) — continuous as span changes
  const stepDense = 2 ** exp;
  const stepCoarse = 2 ** (exp + 1);
  // Dense extras fade out before the next octave; coarse stays solid.
  const denseAlpha = 1 - smoothstep01(frac);

  pushLattice(ticks, range, bars, period, baseSeq, stepCoarse, 1, seen);
  pushLattice(ticks, range, bars, period, baseSeq, stepDense, denseAlpha, seen);

  ticks.sort((a, b) => a.index - b.index);

  if (ticks.length === 0) {
    const mid = Math.round((range.fromIndex + range.toIndex) / 2);
    ticks.push({
      index: mid,
      time: timeAtLogicalIndex(bars, mid, period),
      alpha: 1,
    });
  }

  return ticks;
}
