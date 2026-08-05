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
  /** Logical index — equal screen spacing (not wall-clock). */
  index: number;
  time: number;
}

/** Nice integer steps for logical bar indices. */
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
 * Time grid with equal on-screen spacing (equal logical index steps).
 * Labels show that candle's timestamp — calendar gaps (weekends) may
 * look uneven in the text, but vertical lines stay evenly spaced.
 *
 * Never place ticks on empty left/right pad (negative / past tip indices):
 * clamping those to bars[0]/tip reused the same timestamp → sticky duplicate
 * labels while candles scrolled (replay glitch).
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 6,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const step = niceIndexStep(span / Math.max(2, approxCount));

  // Only emit ticks over real bars — empty TV-style pads get no grid/labels.
  const dataFrom = Math.max(range.fromIndex, 0);
  const dataTo = Math.min(range.toIndex, bars.length);
  if (dataTo - dataFrom < 1e-6) {
    // Viewport is entirely empty pad (e.g. future-only) — one tip label if any.
    const tip = bars[bars.length - 1];
    if (!tip) return [];
    const tipIdx = bars.length - 1;
    if (tipIdx < range.fromIndex || tipIdx > range.toIndex) return [];
    return [{ index: tipIdx, time: tip.time }];
  }

  const ticks: TimeTick[] = [];
  let index = Math.ceil(dataFrom / step) * step;
  if (index < dataFrom + step * 0.15) index += step;

  let lastBarIndex = -1;
  let lastTime = Number.NaN;

  for (; index < dataTo - step * 0.05; index += step) {
    const barIndex = Math.round(index);
    if (barIndex < 0 || barIndex >= bars.length) continue;
    const bar = bars[barIndex];
    if (!bar) continue;
    // Same candle or same unix second → skip (stops sticky duplicates)
    if (barIndex === lastBarIndex || bar.time === lastTime) continue;
    lastBarIndex = barIndex;
    lastTime = bar.time;
    // Snap X to the bar so the line sits on the candle that owns the label
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
