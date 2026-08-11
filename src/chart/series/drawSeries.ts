import type { ChartBar, VisibleRange } from '@/types/bar';
import type { ChartColors } from '../chartTheme';
import type { SeriesType } from '../types';
import { barWidthPx, indexToX, priceToY, type PlotRect, type PriceScale } from '../scales';

export function drawSeries(
  ctx: CanvasRenderingContext2D,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  colors: ChartColors,
  seriesType: SeriesType,
  /** Last drawable bar index (inclusive); used to hide future during replay. */
  maxBarIndex: number | null = null,
): void {
  if (seriesType === 'line') {
    drawLine(ctx, bars, range, plot, priceScale, colors, maxBarIndex);
    return;
  }
  if (seriesType === 'bar') {
    drawOhclBars(ctx, bars, range, plot, priceScale, colors, maxBarIndex);
    return;
  }
  drawCandles(ctx, bars, range, plot, priceScale, colors, maxBarIndex);
}

function visibleRange(
  bars: readonly ChartBar[],
  range: VisibleRange,
  maxBarIndex: number | null,
): { from: number; to: number } {
  const hardMax =
    maxBarIndex == null ? bars.length - 1 : Math.min(bars.length - 1, maxBarIndex);
  return {
    from: Math.max(0, Math.floor(range.fromIndex) - 1),
    to: Math.min(hardMax, Math.ceil(range.toIndex) + 1),
  };
}

function isUp(bar: ChartBar, prev: ChartBar | undefined, colors: ChartColors): boolean {
  if (colors.colorBasedOnPrevClose && prev) {
    return bar.close >= prev.close;
  }
  return bar.close >= bar.open;
}

function drawCandles(
  ctx: CanvasRenderingContext2D,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  colors: ChartColors,
  maxBarIndex: number | null,
): void {
  const slot = barWidthPx(range, plot);
  const bodyW = Math.max(1, Math.min(slot * 0.7, slot - 1));
  const { from, to } = visibleRange(bars, range, maxBarIndex);

  for (let i = from; i <= to; i++) {
    const bar = bars[i];
    if (!bar) continue;

    const x = indexToX(i, range, plot);
    const yOpen = priceToY(bar.open, priceScale, plot);
    const yClose = priceToY(bar.close, priceScale, plot);
    const yHigh = priceToY(bar.high, priceScale, plot);
    const yLow = priceToY(bar.low, priceScale, plot);
    const up = isUp(bar, bars[i - 1], colors);
    const body = up ? colors.upBody : colors.downBody;
    const border = up ? colors.upBorder : colors.downBorder;
    const wick = up ? colors.upWick : colors.downWick;

    const top = Math.min(yOpen, yClose);
    const h = Math.max(1, Math.abs(yClose - yOpen));
    // One pixel center for wick + body (avoids half-px shear on first paint).
    const xMid = Math.round(x) + 0.5;
    const left = xMid - bodyW / 2;
    const hollow = colors.hollowCandles && up;

    if (colors.showWick) {
      ctx.strokeStyle = wick;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xMid, yHigh);
      ctx.lineTo(xMid, yLow);
      ctx.stroke();
    }

    if (colors.showBody && !hollow) {
      ctx.fillStyle = body;
      ctx.fillRect(left, top, bodyW, h);
    }

    if (colors.showBorder || hollow) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, bodyW - 1), Math.max(0, h - 1));
    }
  }
}

function drawOhclBars(
  ctx: CanvasRenderingContext2D,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  colors: ChartColors,
  maxBarIndex: number | null,
): void {
  const slot = barWidthPx(range, plot);
  const tick = Math.max(2, Math.min(slot * 0.35, 6));
  const { from, to } = visibleRange(bars, range, maxBarIndex);

  for (let i = from; i <= to; i++) {
    const bar = bars[i];
    if (!bar) continue;
    const x = indexToX(i, range, plot);
    const yOpen = priceToY(bar.open, priceScale, plot);
    const yClose = priceToY(bar.close, priceScale, plot);
    const yHigh = priceToY(bar.high, priceScale, plot);
    const yLow = priceToY(bar.low, priceScale, plot);
    const up = isUp(bar, bars[i - 1], colors);
    ctx.strokeStyle = up ? colors.upColor : colors.downColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, yHigh);
    ctx.lineTo(x + 0.5, yLow);
    ctx.moveTo(x - tick, yOpen);
    ctx.lineTo(x + 0.5, yOpen);
    ctx.moveTo(x + 0.5, yClose);
    ctx.lineTo(x + tick, yClose);
    ctx.stroke();
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  colors: ChartColors,
  maxBarIndex: number | null,
): void {
  const { from, to } = visibleRange(bars, range, maxBarIndex);

  ctx.strokeStyle = colors.lineColor;
  ctx.lineWidth = colors.lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = from; i <= to; i++) {
    const bar = bars[i];
    if (!bar) continue;
    const x = indexToX(i, range, plot);
    const y = priceToY(bar.close, priceScale, plot);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

export function drawVolume(
  ctx: CanvasRenderingContext2D,
  bars: readonly ChartBar[],
  range: VisibleRange,
  volumePlot: PlotRect,
  colors: ChartColors,
  opacity = 0.4,
  maxBarIndex: number | null = null,
): void {
  const { from, to } = visibleRange(bars, range, maxBarIndex);
  let maxVol = 0;
  for (let i = from; i <= to; i++) {
    const v = bars[i]?.volume ?? 0;
    if (v > maxVol) maxVol = v;
  }
  if (maxVol <= 0) return;

  const slot = barWidthPx(range, volumePlot);
  const bodyW = Math.max(1, Math.min(slot * 0.7, slot - 1));
  const baseAlpha = Math.min(1, Math.max(0.05, opacity));

  for (let i = from; i <= to; i++) {
    const bar = bars[i];
    if (!bar || !(bar.volume && bar.volume > 0)) continue;
    const xMid = Math.round(indexToX(i, range, volumePlot)) + 0.5;
    const h = (bar.volume / maxVol) * volumePlot.height;
    const up = isUp(bar, bars[i - 1], colors);
    ctx.fillStyle = up ? colors.upColor : colors.downColor;
    ctx.globalAlpha = baseAlpha;
    ctx.fillRect(xMid - bodyW / 2, volumePlot.top + volumePlot.height - h, bodyW, h);
  }
  ctx.globalAlpha = 1;
}
