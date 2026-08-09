import type { ChartBar, VisibleRange } from '@/types/bar';
import { logicalIndexAtTime } from '@/data/timeframeAgg';

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
  /** Logical index — may be fractional; may be < 0 or ≥ bars.length for pad. */
  index: number;
  time: number;
}

/**
 * Per-engine sticky for the time lattice.
 * `anchorTime` pins one world line across zoom so density can change continuously
 * without rephasing onto candle centers.
 */
export interface TimeLatticeSticky {
  anchorTime: number | null;
}

export interface NiceTimeTicksOpts {
  /** Declared TF period (seconds). Preferred when it matches the series. */
  barPeriod?: number;
  /** One object per chart engine. */
  sticky?: TimeLatticeSticky;
}

/**
 * Stable bar period from the series itself (not the moving viewport).
 * Median gap — weekends must not inflate the period used for pad extrapolation.
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
 * Continuous paper-stable time grid (not candle-snapped).
 *
 * Spacing = visibleSpan / approxCount — changes smoothly while zooming.
 * One sticky wall-clock anchor keeps a single line fixed in data space so
 * other lines spread/contract from it (no discrete step rephase / candle snap).
 * Indices may be fractional — lines are free paper, not forced onto bar centers.
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 8,
  opts?: NiceTimeTicksOpts,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const step = span / Math.max(2, approxCount);
  if (!(step > 0) || !Number.isFinite(step)) return [];

  const period = resolveBarPeriod(bars, opts?.barPeriod);
  const sticky = opts?.sticky;
  const mid = (range.fromIndex + range.toIndex) / 2;

  let anchorTime = sticky?.anchorTime ?? null;
  if (anchorTime == null || !Number.isFinite(anchorTime)) {
    anchorTime = timeAtLogicalIndex(bars, mid, period);
    if (sticky) sticky.anchorTime = anchorTime;
  }

  let anchorIndex = logicalIndexAtTime(bars, anchorTime);
  // Soft re-seed if the anchor drifted many viewports away (long pan).
  if (Math.abs(anchorIndex - mid) > span * 4) {
    anchorTime = timeAtLogicalIndex(bars, mid, period);
    if (sticky) sticky.anchorTime = anchorTime;
    anchorIndex = logicalIndexAtTime(bars, anchorTime);
  }

  // First line at or after range.fromIndex: anchor + k·step
  let k = Math.ceil((range.fromIndex - anchorIndex) / step - 1e-12);
  let index = anchorIndex + k * step;

  const ticks: TimeTick[] = [];
  for (; index < range.toIndex - 1e-9; k += 1, index = anchorIndex + k * step) {
    ticks.push({
      index,
      time: timeAtLogicalIndex(bars, index, period),
    });
    if (ticks.length > 48) break;
  }

  if (ticks.length === 0) {
    ticks.push({
      index: mid,
      time: timeAtLogicalIndex(bars, mid, period),
    });
  }

  return ticks;
}
