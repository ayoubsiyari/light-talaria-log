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
 * Stable bar period from the series itself (not the moving viewport),
 * so panning never rephases the lattice mid-drag.
 */
function seriesBarPeriod(bars: readonly ChartBar[]): number {
  if (bars.length >= 2) {
    // Prefer a short sample near the tip — more representative of the live TF.
    const hi = bars.length - 1;
    const lo = Math.max(0, hi - Math.min(64, hi));
    const dt = bars[hi]!.time - bars[lo]!.time;
    const n = hi - lo;
    if (n > 0 && dt > 0) return Math.max(1, Math.round(dt / n));
    const d0 = bars[1]!.time - bars[0]!.time;
    if (d0 > 0) return Math.max(1, d0);
  }
  return 60;
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
 * Lattice phase is locked to `bars[0].time` so when the replay warm-cache
 * slides under a fixed index window, every line shifts with the candles.
 * Empty left/right pad is filled by extrapolating time from the bar period.
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 8,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const step = niceIndexStep(span / Math.max(2, approxCount));
  const period = seriesBarPeriod(bars);

  // Content phase: bars[0] sits at sequence `baseSeq`. When the buffer drops
  // the oldest bar, baseSeq advances and the whole lattice shifts by −1 in
  // buffer-index space (lines scroll with candles during replay slides).
  const baseSeq = bars[0]!.time / period;
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
