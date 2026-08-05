import { timeAtLogicalIndex } from '@/data/timeframeAgg';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { CrosshairMode, CrosshairPoint } from './types';
import type { PlotRect, PriceScale } from './scales';
import { indexToX, priceToY, xToIndex, yToPrice } from './scales';

/**
 * Resolve pointer → crosshair point (LW Charts parity modes).
 * - normal: free X/Y
 * - magnet: snap X to bar, Y to close
 * - magnetOhlc: snap X to bar, Y to nearest O/H/L/C
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
  const barIndex = Math.round(Math.min(bars.length - 1, Math.max(0, rawIndex)));
  const bar = bars[barIndex] ?? null;

  if (mode === 'normal') {
    // Sub-panes (volume / RSI / MACD): keep free Y. Remapping via main
    // priceToY(close) snaps the hair into the middle of the price pane.
    const price = inMainPlot
      ? yToPrice(canvasY, priceScale, plot)
      : (bar?.close ?? yToPrice(plot.top + plot.height, priceScale, plot));
    const index = rawIndex;
    // Extrapolate past first/last bar so drawings can sit in empty pad space
    const time = timeAtLogicalIndex(bars, index) ?? 0;
    const onBar =
      rawIndex >= -0.5 && rawIndex <= bars.length - 0.5 ? bars[barIndex] ?? null : null;
    return {
      x: canvasX,
      y: canvasY,
      index,
      time,
      price,
      bar: onBar,
      barIndex: onBar ? barIndex : null,
    };
  }

  // Magnet modes: lock X to candle center; Y only on main plot
  if (!bar) return null;
  const x = indexToX(barIndex, range, plot);

  let price: number;
  if (mode === 'magnet') {
    price = bar.close;
  } else {
    const cursorPrice = inMainPlot
      ? yToPrice(canvasY, priceScale, plot)
      : bar.close;
    const levels = [bar.open, bar.high, bar.low, bar.close];
    price = levels.reduce((best, p) =>
      Math.abs(p - cursorPrice) < Math.abs(best - cursorPrice) ? p : best,
    );
  }

  const y = inMainPlot ? priceToY(price, priceScale, plot) : canvasY;
  return {
    x,
    y,
    index: barIndex,
    time: bar.time,
    price,
    bar,
    barIndex,
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
    time: logical.time ?? bar.time,
    price,
    bar,
    barIndex,
  };
}

