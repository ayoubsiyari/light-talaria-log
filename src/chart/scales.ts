import type { ChartBar, VisibleRange } from '@/types/bar';

export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PriceScale {
  min: number;
  max: number;
}

const PRICE_PAD = 0.05;

export function computePriceScale(
  bars: readonly ChartBar[],
  range: VisibleRange,
  maxBarIndex: number | null = null,
): PriceScale {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const hardMax =
    maxBarIndex == null ? bars.length - 1 : Math.min(bars.length - 1, maxBarIndex);
  const from = Math.max(0, Math.floor(range.fromIndex));
  const to = Math.min(hardMax, Math.ceil(range.toIndex) - 1);

  for (let i = from; i <= to; i++) {
    const bar = bars[i];
    if (!bar) continue;
    if (bar.low < min) min = bar.low;
    if (bar.high > max) max = bar.high;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { min: 0, max: 1 };
  }

  const pad = (max - min) * PRICE_PAD;
  return { min: min - pad, max: max + pad };
}

/**
 * Widen an auto price scale so entry / SL / TP stay on-screen.
 * Without this, protective levels often sit outside the candle range and
 * look like they “disappeared” (clipped by the plot).
 */
export function expandPriceScale(
  scale: PriceScale,
  prices: readonly (number | null | undefined)[],
): PriceScale {
  let { min, max } = scale;
  let touched = false;
  for (const p of prices) {
    if (p == null || !Number.isFinite(p)) continue;
    if (p < min) {
      min = p;
      touched = true;
    }
    if (p > max) {
      max = p;
      touched = true;
    }
  }
  if (!touched) return scale;
  const span = max - min;
  const pad = (span > 0 ? span : Math.abs(max) || 1) * PRICE_PAD;
  return { min: min - pad, max: max + pad };
}

/** Logical index → canvas x (center of bar slot). */
export function indexToX(index: number, range: VisibleRange, plot: PlotRect): number {
  const span = range.toIndex - range.fromIndex;
  if (span <= 0) return plot.left + plot.width / 2;
  const t = (index - range.fromIndex) / span;
  return plot.left + t * plot.width;
}

/** Canvas x → logical index. */
export function xToIndex(x: number, range: VisibleRange, plot: PlotRect): number {
  if (plot.width <= 0) return range.fromIndex;
  const t = (x - plot.left) / plot.width;
  return range.fromIndex + t * (range.toIndex - range.fromIndex);
}

/** Price → canvas y. */
export function priceToY(price: number, scale: PriceScale, plot: PlotRect): number {
  const span = scale.max - scale.min;
  if (span <= 0) return plot.top + plot.height / 2;
  const t = (price - scale.min) / span;
  return plot.top + (1 - t) * plot.height;
}

/** Canvas y → price. */
export function yToPrice(y: number, scale: PriceScale, plot: PlotRect): number {
  if (plot.height <= 0) return scale.min;
  const t = 1 - (y - plot.top) / plot.height;
  return scale.min + t * (scale.max - scale.min);
}

/** Width of one logical bar in pixels. */
export function barWidthPx(range: VisibleRange, plot: PlotRect): number {
  const span = range.toIndex - range.fromIndex;
  if (span <= 0) return plot.width;
  return plot.width / span;
}
