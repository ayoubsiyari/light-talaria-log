import type { ChartBar, VisibleRange } from '@/types/bar';
import { isValidOhlcBar } from '@/data/ohlcGuard';

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
    // Skip zero/corrupt prints — one ES low=0 used to crush Y to 0→6000.
    if (!bar || !isValidOhlcBar(bar)) continue;
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
 * Play-only auto Y hysteresis: expand immediately for new highs/lows, never
 * shrink while following. Stops tip-candle min/max flicker from “breathing”
 * the whole plot every replay tick. Caller clears sticky on Pause / reset.
 */
export function applyPlayPriceHysteresis(
  sticky: PriceScale | null,
  target: PriceScale,
): PriceScale {
  if (
    !sticky ||
    !(sticky.max > sticky.min) ||
    !(target.max > target.min)
  ) {
    return { min: target.min, max: target.max };
  }
  return {
    min: Math.min(sticky.min, target.min),
    max: Math.max(sticky.max, target.max),
  };
}

/**
 * True when `price` is plausible for the candle scale (same instrument).
 * Rejects cross-pair leaks (e.g. EUR 1.15 on a USD/JPY ~159 pane) that would
 * smash auto-Y and hide candles.
 */
export function isPriceNearScale(scale: PriceScale, price: number): boolean {
  if (!(scale.max > scale.min) || !Number.isFinite(price)) return false;
  const mid = (scale.min + scale.max) / 2;
  const barSpan = scale.max - scale.min;
  // Allow levels well outside the visible candle window (far SL) but not
  // another FX pair's price universe.
  const maxDist = Math.max(barSpan * 40, Math.abs(mid) * 0.35, Math.abs(mid) * 0.01);
  return Math.abs(price - mid) <= maxDist;
}

/**
 * Widen an auto price scale so entry / SL / TP stay on-screen.
 * Without this, protective levels often sit outside the candle range and
 * look like they “disappeared” (clipped by the plot).
 * Outlier / wrong-pair prices are ignored so multi-chart tickets cannot
 * collapse another pane's Y scale.
 */
export function expandPriceScale(
  scale: PriceScale,
  prices: readonly (number | null | undefined)[],
): PriceScale {
  if (!(scale.max > scale.min)) return scale;
  let { min, max } = scale;
  let touched = false;
  for (const p of prices) {
    if (p == null || !Number.isFinite(p)) continue;
    if (!isPriceNearScale(scale, p)) continue;
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

/** Sticky Play Y locked onto a contaminated span — drop it so candles return. */
export function playScaleNeedsReset(
  sticky: PriceScale,
  sane: PriceScale,
): boolean {
  if (!(sticky.max > sticky.min) || !(sane.max > sane.min)) return false;
  const stickySpan = sticky.max - sticky.min;
  const saneSpan = sane.max - sane.min;
  return stickySpan > saneSpan * 6;
}

/**
 * Ease Play sticky Y toward the current target when it is only wider because
 * far SL/TP (or a cleared draft) stretched it. Expands stay instant via
 * hysteresis; shrinks recover over ~1s of paints instead of waiting for Pause.
 */
export function softenPlayPriceScale(
  sticky: PriceScale,
  target: PriceScale,
  ease = 0.12,
): PriceScale {
  if (!(sticky.max > sticky.min) || !(target.max > target.min)) return target;
  const stickySpan = sticky.max - sticky.min;
  const targetSpan = target.max - target.min;
  if (stickySpan <= targetSpan * 1.12) return sticky;
  const t = Math.min(1, Math.max(0, ease));
  return {
    min: sticky.min + (target.min - sticky.min) * t,
    max: sticky.max + (target.max - sticky.max) * t,
  };
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
