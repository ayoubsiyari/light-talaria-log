import { timeAtLogicalIndex } from '@/data/timeframeAgg';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { CrosshairMode, CrosshairPoint } from './types';
import type { PlotRect, PriceScale } from './scales';
import { indexToX, priceToY, xToIndex, yToPrice } from './scales';

/**
 * Resolve pointer → crosshair point (TradingView-like modes).
 * - Always snaps X to logical bar slots (real candles + empty pad “virtual” slots)
 * - Over real bars: date = that candle (Fri→Mon never interpolates Sat/Sun)
 * - Empty pad: date keeps stepping via bar period so the label continues to change
 * - normal: free Y; magnet / magnetOhlc: snap Y to close / OHLC when on a real bar
 * - hidden: returns null (caller skips paint)
 */
export function resolveCrosshair(
  canvasX: number,
  canvasY: number,
  mode: CrosshairMode,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  /** Include volume band in hit area (Y below main plot still tracks bar). */
  contentBottom?: number,
): CrosshairPoint | null {
  if (mode === 'hidden' || bars.length === 0) return null;

  const bottom = contentBottom ?? plot.top + plot.height;
  if (
    canvasX < plot.left ||
    canvasX > plot.left + plot.width ||
    canvasY < plot.top ||
    canvasY > bottom
  ) {
    return null;
  }

  const inMainPlot = canvasY <= plot.top + plot.height;
  const rawIndex = xToIndex(canvasX, range, plot);
  // Nearest slot — may be < 0 or > last (TV empty-pad stepping).
  const snapIndex = Math.round(rawIndex);
  const last = bars.length - 1;
  const onRealBar = snapIndex >= 0 && snapIndex <= last;
  const bar = onRealBar ? bars[snapIndex]! : null;
  const edge = snapIndex < 0 ? bars[0]! : bars[last]!;
  const time =
    (onRealBar ? bar!.time : timeAtLogicalIndex(bars, snapIndex)) ?? edge.time;
  const x = indexToX(snapIndex, range, plot);

  if (mode === 'normal') {
    const price = inMainPlot
      ? yToPrice(canvasY, priceScale, plot)
      : (bar?.close ?? edge.close);
    return {
      x,
      y: canvasY,
      index: snapIndex,
      time,
      price,
      bar,
      barIndex: onRealBar ? snapIndex : null,
    };
  }

  // Magnet modes: on pad, price snaps to edge candle OHLC/close.
  const ref = bar ?? edge;
  let price: number;
  if (mode === 'magnet') {
    price = ref.close;
  } else {
    const cursorPrice = inMainPlot
      ? yToPrice(canvasY, priceScale, plot)
      : ref.close;
    const levels = [ref.open, ref.high, ref.low, ref.close];
    price = levels.reduce((best, p) =>
      Math.abs(p - cursorPrice) < Math.abs(best - cursorPrice) ? p : best,
    );
  }

  const y = inMainPlot ? priceToY(price, priceScale, plot) : canvasY;
  return {
    x,
    y,
    index: snapIndex,
    time,
    price,
    bar,
    barIndex: onRealBar ? snapIndex : null,
  };
}

/**
 * Free pointer → time/price for drawing place/drag (may sit in empty pad).
 * Not used for the visible crosshair — that snaps candle-to-candle.
 */
export function resolveFreePointer(
  canvasX: number,
  canvasY: number,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  contentBottom?: number,
): CrosshairPoint | null {
  if (bars.length === 0) return null;
  const bottom = contentBottom ?? plot.top + plot.height;
  if (
    canvasX < plot.left ||
    canvasX > plot.left + plot.width ||
    canvasY < plot.top ||
    canvasY > bottom
  ) {
    return null;
  }
  const inMainPlot = canvasY <= plot.top + plot.height;
  const rawIndex = xToIndex(canvasX, range, plot);
  const barIndex = Math.round(Math.min(bars.length - 1, Math.max(0, rawIndex)));
  const onBar =
    rawIndex >= -0.5 && rawIndex <= bars.length - 0.5
      ? bars[barIndex] ?? null
      : null;
  const price = inMainPlot
    ? yToPrice(canvasY, priceScale, plot)
    : (onBar?.close ?? yToPrice(plot.top + plot.height, priceScale, plot));
  const time = timeAtLogicalIndex(bars, rawIndex) ?? 0;
  return {
    x: canvasX,
    y: canvasY,
    index: rawIndex,
    time,
    price,
    bar: onBar,
    barIndex: onBar ? barIndex : null,
  };
}

/**
 * Drive crosshair from sync (multi-chart) — prefers `time` so panes on
 * different timeframes align; falls back to local logical index.
 */
export function resolveCrosshairFromLogical(
  logical: { index?: number; price: number | null; time: number | null },
  mode: CrosshairMode,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
): CrosshairPoint | null {
  if (mode === 'hidden' || bars.length === 0) return null;

  let barIndex: number;
  if (logical.time != null && Number.isFinite(logical.time)) {
    // Local bar at-or-before synced time
    let lo = 0;
    let hi = bars.length - 1;
    if (logical.time <= bars[0]!.time) barIndex = 0;
    else if (logical.time >= bars[hi]!.time) barIndex = hi;
    else {
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = bars[mid]!.time;
        if (t === logical.time) {
          lo = mid;
          break;
        }
        if (t < logical.time) lo = mid + 1;
        else hi = mid - 1;
      }
      barIndex = Math.max(0, hi);
      if (lo <= bars.length - 1 && bars[lo]!.time === logical.time) barIndex = lo;
    }
  } else if (logical.index != null) {
    barIndex = Math.round(Math.min(bars.length - 1, Math.max(0, logical.index)));
  } else {
    return null;
  }

  const bar = bars[barIndex];
  if (!bar) return null;

  const price = logical.price ?? bar.close;
  const x = indexToX(barIndex, range, plot);
  const y = priceToY(price, priceScale, plot);

  if (x < plot.left - 2 || x > plot.left + plot.width + 2) {
    return null;
  }

  return {
    x,
    y,
    index: barIndex,
    // Always the snapped candle's open time — never a synced interpolated
    // wall-clock that can land on Sat/Sun between Fri→Mon daily bars.
    time: bar.time,
    price,
    bar,
    barIndex,
  };
}

