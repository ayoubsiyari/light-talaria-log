import type { ChartBar, VisibleRange } from '@/types/bar';
import type { IndicatorPaneResult, IndicatorSeries } from '@/types/indicator';
import type { ChartColors } from '../chartTheme';
import { barWidthPx, indexToX, priceToY, type PlotRect, type PriceScale } from '../scales';

function paneScale(
  pane: IndicatorPaneResult,
  range: VisibleRange,
  maxBarIndex: number | null,
  barsLen: number,
): PriceScale {
  if (
    pane.scaleMode === 'fixed' &&
    pane.fixedMin != null &&
    pane.fixedMax != null &&
    pane.fixedMin < pane.fixedMax
  ) {
    return { min: pane.fixedMin, max: pane.fixedMax };
  }

  const hardMax =
    maxBarIndex == null ? barsLen - 1 : Math.min(barsLen - 1, maxBarIndex);
  const from = Math.max(0, Math.floor(range.fromIndex));
  const to = Math.min(hardMax, Math.ceil(range.toIndex) - 1);
  let min = Infinity;
  let max = -Infinity;
  for (const s of pane.series) {
    const lim = Math.min(s.values.length, barsLen);
    if (lim === 0) continue;
    const end = Math.min(to, lim - 1);
    for (let i = from; i <= end; i++) {
      const v = s.values[i];
      if (v == null || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { min: -1, max: 1 };
  }
  const pad = (max - min) * 0.08 || 0.01;
  return { min: min - pad, max: max + pad };
}

function drawPaneLine(
  ctx: CanvasRenderingContext2D,
  series: IndicatorSeries,
  barsLen: number,
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  from: number,
  to: number,
): void {
  const lim = Math.min(series.values.length, barsLen);
  if (lim === 0) return;
  const drawTo = Math.min(to, lim - 1);
  if (drawTo < from) return;
  ctx.strokeStyle = series.color;
  ctx.lineWidth = series.lineWidth ?? 1.25;
  ctx.beginPath();
  let drawing = false;
  for (let i = from; i <= drawTo; i++) {
    const v = series.values[i];
    if (v == null || !Number.isFinite(v)) {
      drawing = false;
      continue;
    }
    const x = indexToX(i, range, plot);
    const y = priceToY(v, scale, plot);
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (drawing) ctx.stroke();
}

function drawPaneHistogram(
  ctx: CanvasRenderingContext2D,
  series: IndicatorSeries,
  barsLen: number,
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  from: number,
  to: number,
  colors: ChartColors,
): void {
  const lim = Math.min(series.values.length, barsLen);
  if (lim === 0) return;
  const drawTo = Math.min(to, lim - 1);
  if (drawTo < from) return;
  const slot = barWidthPx(range, plot);
  const bodyW = Math.max(1, slot * 0.7);
  const zeroY = priceToY(0, scale, plot);

  for (let i = from; i <= drawTo; i++) {
    const v = series.values[i];
    if (v == null || !Number.isFinite(v)) continue;
    const x = indexToX(i, range, plot);
    const y = priceToY(v, scale, plot);
    ctx.fillStyle = v >= 0 ? colors.upColor : colors.downColor;
    const top = Math.min(y, zeroY);
    const h = Math.abs(y - zeroY);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, h));
    ctx.globalAlpha = 1;
  }
}

/** Draw one indicator sub-pane (grid levels, hist, lines, axis labels). */
export function drawIndicatorPane(
  ctx: CanvasRenderingContext2D,
  pane: IndicatorPaneResult,
  plot: PlotRect,
  bars: readonly ChartBar[],
  range: VisibleRange,
  maxBarIndex: number | null,
  colors: ChartColors,
): void {
  if (plot.height <= 0 || plot.width <= 0 || bars.length === 0) return;

  const hardMax =
    maxBarIndex == null ? bars.length - 1 : Math.min(bars.length - 1, maxBarIndex);
  const from = Math.max(0, Math.floor(range.fromIndex));
  const to = Math.min(hardMax, Math.ceil(range.toIndex) - 1);
  if (to < from) return;

  const scale = paneScale(pane, range, maxBarIndex, bars.length);

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();

  // Pane background separator
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top + 0.5);
  ctx.lineTo(plot.left + plot.width, plot.top + 0.5);
  ctx.stroke();

  // Reference levels
  if (pane.levels?.length) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const level of pane.levels) {
      const y = priceToY(level, scale, plot);
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  for (const series of pane.series) {
    if (series.style === 'histogram') {
      drawPaneHistogram(ctx, series, bars.length, range, plot, scale, from, to, colors);
    }
  }
  for (const series of pane.series) {
    if (series.style !== 'histogram') {
      drawPaneLine(ctx, series, bars.length, range, plot, scale, from, to);
    }
  }

  ctx.restore();

  // Right-axis labels for scale extents + levels
  ctx.save();
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const axisX = plot.left + plot.width + 4;
  const labelVals = [
    scale.max,
    ...(pane.levels ?? []),
    scale.min,
  ];
  const seen = new Set<string>();
  for (const v of labelVals) {
    const key = v.toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key);
    const y = priceToY(v, scale, plot);
    if (y < plot.top - 2 || y > plot.top + plot.height + 2) continue;
    ctx.fillText(Number.isInteger(v) ? String(v) : v.toFixed(1), axisX, y);
  }

  // Pane title
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(pane.label, plot.left + 4, plot.top + 3);
  ctx.restore();
}

/** Map pointer Y in a pane to the pane scale value. */
export function yToPaneValue(
  y: number,
  pane: IndicatorPaneResult,
  plot: PlotRect,
  range: VisibleRange,
  maxBarIndex: number | null,
  barsLen: number,
): number {
  const scale = paneScale(pane, range, maxBarIndex, barsLen);
  const t = (y - plot.top) / Math.max(1, plot.height);
  return scale.max - t * (scale.max - scale.min);
}
