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
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 6,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const step = niceIndexStep(span / Math.max(2, approxCount));

  const ticks: TimeTick[] = [];
  // Align to a multiple of step so lines stay stable while panning
  let index = Math.ceil(range.fromIndex / step) * step;
  // Prefer lines inside the visible span (not stuck on the left edge)
  if (index < range.fromIndex + step * 0.15) {
    index += step;
  }

  for (; index < range.toIndex - step * 0.05; index += step) {
    const barIndex = Math.min(bars.length - 1, Math.max(0, Math.round(index)));
    const bar = bars[barIndex];
    if (!bar) continue;
    if (ticks.length > 0 && ticks[ticks.length - 1]!.index === index) continue;
    ticks.push({ index, time: bar.time });
    if (ticks.length > 40) break;
  }

  // Fallback if zoom is extreme
  if (ticks.length === 0) {
    const mid = (range.fromIndex + range.toIndex) / 2;
    const barIndex = Math.min(bars.length - 1, Math.max(0, Math.round(mid)));
    const bar = bars[barIndex];
    if (bar) ticks.push({ index: mid, time: bar.time });
  }

  return ticks;
}
