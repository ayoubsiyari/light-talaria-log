import type { ChartBar, VisibleRange } from '@/types/bar';
import { indexAtOrBeforeBars } from '@/data/timeframeAgg';

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
  /** Logical index — maps to screen X via indexToX. */
  index: number;
  time: number;
}

/** Nice integer steps for logical bar counts. */
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

/** Median-ish bar period (seconds) over a window — used to convert bar-steps → time. */
function estimateBarPeriod(
  bars: readonly ChartBar[],
  fromIdx: number,
  toIdx: number,
): number {
  const i0 = Math.max(0, Math.min(bars.length - 1, Math.floor(fromIdx)));
  const i1 = Math.max(0, Math.min(bars.length - 1, Math.ceil(toIdx) - 1));
  if (i1 > i0) {
    const dt = bars[i1]!.time - bars[i0]!.time;
    if (dt > 0) return Math.max(1, Math.round(dt / (i1 - i0)));
  }
  if (bars.length >= 2) {
    const dt = bars[1]!.time - bars[0]!.time;
    if (dt > 0) return Math.max(1, dt);
  }
  return 60;
}

/**
 * Time grid ticks.
 *
 * Tick *identity* is wall-clock phase (step × bar-period), then mapped to the
 * current bar index. That way when replay’s warm-cache slides under a fixed
 * right-anchored index window, vertical lines scroll with the candles —
 * labels stay glued to their bar instead of updating under a fixed screen X.
 *
 * Empty left/right pad (negative / past tip indices) never get ticks.
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 6,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const stepBars = niceIndexStep(span / Math.max(2, approxCount));

  // Only emit ticks over real bars — empty TV-style pads get no grid/labels.
  const dataFrom = Math.max(range.fromIndex, 0);
  const dataTo = Math.min(range.toIndex, bars.length);
  if (dataTo - dataFrom < 1e-6) {
    const tip = bars[bars.length - 1];
    if (!tip) return [];
    const tipIdx = bars.length - 1;
    if (tipIdx < range.fromIndex || tipIdx > range.toIndex) return [];
    return [{ index: tipIdx, time: tip.time }];
  }

  const i0 = Math.max(0, Math.min(bars.length - 1, Math.ceil(dataFrom)));
  const i1 = Math.max(0, Math.min(bars.length - 1, Math.floor(dataTo - 1e-9)));
  if (i1 < i0) {
    const bar = bars[i0];
    return bar ? [{ index: i0, time: bar.time }] : [];
  }

  const period = estimateBarPeriod(bars, i0, i1 + 1);
  const stepSec = Math.max(period, stepBars * period);
  const fromTime = bars[i0]!.time;
  const toTime = bars[i1]!.time;

  // Phase-align to stepSec so the same clock lines keep identity across slides.
  let t = Math.ceil(fromTime / stepSec) * stepSec;

  const ticks: TimeTick[] = [];
  let lastBarIndex = -1;
  let lastTime = Number.NaN;

  for (; t <= toTime + period * 0.25; t += stepSec) {
    const barIndex = indexAtOrBeforeBars(bars, t);
    if (barIndex < dataFrom || barIndex >= dataTo) continue;
    if (barIndex < 0 || barIndex >= bars.length) continue;
    const bar = bars[barIndex];
    if (!bar) continue;
    // Skip if this bar is far behind the target (large gap / weekend hole)
    if (t - bar.time > stepSec * 0.9) continue;
    if (barIndex === lastBarIndex || bar.time === lastTime) continue;
    lastBarIndex = barIndex;
    lastTime = bar.time;
    ticks.push({ index: barIndex, time: bar.time });
    if (ticks.length > 40) break;
  }

  if (ticks.length === 0) {
    const mid = (dataFrom + dataTo) / 2;
    const barIndex = Math.min(bars.length - 1, Math.max(0, Math.round(mid)));
    const bar = bars[barIndex];
    if (bar) ticks.push({ index: barIndex, time: bar.time });
  }

  return ticks;
}
