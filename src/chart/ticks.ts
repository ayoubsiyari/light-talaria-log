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
  /** Logical index — may be < 0 or ≥ bars.length for empty pad. */
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
  // index < 0
  return bars[0]!.time + index * period;
}

/** Logical index for a wall-clock time — may land in empty pad. */
function logicalIndexAtTime(
  bars: readonly ChartBar[],
  time: number,
  period: number,
): number {
  if (bars.length === 0) return 0;
  const first = bars[0]!.time;
  const last = bars[bars.length - 1]!.time;
  if (time < first) return (time - first) / period;
  if (time > last) return bars.length - 1 + (time - last) / period;
  const idx = indexAtOrBeforeBars(bars, time);
  const bar = bars[idx]!;
  if (bar.time === time || idx >= bars.length - 1) return idx;
  const next = bars[idx + 1]!;
  const span = next.time - bar.time;
  if (span <= 0) return idx;
  return idx + (time - bar.time) / span;
}

/**
 * Time grid ticks across the full visible window — including empty pad.
 *
 * Tick identity is wall-clock phase (step × bar-period), mapped to a logical
 * index (real bar or extrapolated pad). That keeps lines scrolling with
 * candles during replay, and continues the grid into future/past empty space
 * when the user pans (TradingView-style).
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 6,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const stepBars = niceIndexStep(span / Math.max(2, approxCount));

  // Period from whatever real bars overlap the view (or whole series).
  const sampleFrom = Math.max(0, Math.min(bars.length - 1, range.fromIndex));
  const sampleTo = Math.max(
    sampleFrom + 1,
    Math.min(bars.length, Math.ceil(range.toIndex)),
  );
  const period = estimateBarPeriod(bars, sampleFrom, sampleTo);
  const stepSec = Math.max(period, stepBars * period);

  const fromTime = timeAtLogicalIndex(bars, range.fromIndex, period);
  const toTime = timeAtLogicalIndex(bars, range.toIndex, period);
  if (!(toTime > fromTime)) {
    const tip = bars[bars.length - 1]!;
    return [{ index: bars.length - 1, time: tip.time }];
  }

  // Phase-align so the same clock lines keep identity across slides / pans.
  let t = Math.ceil(fromTime / stepSec) * stepSec;

  const ticks: TimeTick[] = [];
  let lastIndex = Number.NaN;
  let lastTime = Number.NaN;

  for (; t < toTime - stepSec * 0.05; t += stepSec) {
    let index = logicalIndexAtTime(bars, t, period);
    let time = t;

    // Snap onto a real candle when the phase lands on data (keeps line on bar).
    if (index >= 0 && index < bars.length) {
      const barIndex = indexAtOrBeforeBars(bars, t);
      const bar = bars[barIndex];
      if (bar && t - bar.time <= stepSec * 0.9) {
        index = barIndex;
        time = bar.time;
      }
    }

    if (index < range.fromIndex || index >= range.toIndex) continue;
    if (index === lastIndex || time === lastTime) continue;
    lastIndex = index;
    lastTime = time;
    ticks.push({ index, time });
    if (ticks.length > 40) break;
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
