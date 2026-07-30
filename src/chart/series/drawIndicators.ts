import type { ChartBar, VisibleRange } from '@/types/bar';
import type { IndicatorOverlayResult, IndicatorSeries } from '@/types/indicator';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '../scales';

function visibleRange(
  bars: readonly ChartBar[],
  range: VisibleRange,
  maxBarIndex: number | null,
): { from: number; to: number } | null {
  if (bars.length === 0) return null;
  const hardMax =
    maxBarIndex == null ? bars.length - 1 : Math.min(bars.length - 1, maxBarIndex);
  const from = Math.max(0, Math.floor(range.fromIndex));
  const to = Math.min(hardMax, Math.ceil(range.toIndex) - 1);
  if (to < from) return null;
  return { from, to };
}

function drawLineSeries(
  ctx: CanvasRenderingContext2D,
  series: IndicatorSeries,
  barsLen: number,
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  from: number,
  to: number,
  lineWidth = series.lineWidth ?? 1.5,
): void {
  if (series.values.length !== barsLen) return;
  ctx.strokeStyle = series.color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  let drawing = false;
  for (let i = from; i <= to; i++) {
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

function drawBandFill(
  ctx: CanvasRenderingContext2D,
  upper: IndicatorSeries,
  lower: IndicatorSeries,
  barsLen: number,
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  from: number,
  to: number,
): void {
  if (upper.values.length !== barsLen || lower.values.length !== barsLen) return;

  ctx.save();
  // Theme color with alpha — color is already CSS (may be hex or oklch)
  ctx.fillStyle = upper.color;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  let started = false;
  for (let i = from; i <= to; i++) {
    const u = upper.values[i];
    if (u == null || !Number.isFinite(u)) {
      if (started) break;
      continue;
    }
    const x = indexToX(i, range, plot);
    const y = priceToY(u, scale, plot);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (!started) {
    ctx.restore();
    return;
  }
  for (let i = to; i >= from; i--) {
    const l = lower.values[i];
    if (l == null || !Number.isFinite(l)) continue;
    const x = indexToX(i, range, plot);
    const y = priceToY(l, scale, plot);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Polyline / band overlays on the main price plot — viewport-sized arrays only. */
export function drawIndicators(
  ctx: CanvasRenderingContext2D,
  overlays: readonly IndicatorOverlayResult[],
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  maxBarIndex: number | null,
): void {
  if (overlays.length === 0 || bars.length === 0) return;
  const vis = visibleRange(bars, range, maxBarIndex);
  if (!vis) return;
  const { from, to } = vis;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const overlay of overlays) {
    const byKey = new Map(overlay.series.map((s) => [s.key, s]));
    const filled = new Set<string>();

    for (const series of overlay.series) {
      if (series.style === 'band' && series.bandPairKey && !filled.has(series.key)) {
        const pair = byKey.get(series.bandPairKey);
        if (pair) {
          const upper = series.key === 'upper' || series.key.includes('upper') ? series : pair;
          const lower = upper === series ? pair : series;
          drawBandFill(ctx, upper, lower, bars.length, range, plot, scale, from, to);
          filled.add(series.key);
          filled.add(pair.key);
        }
      }
    }

    for (const series of overlay.series) {
      if (series.style === 'histogram') continue;
      drawLineSeries(ctx, series, bars.length, range, plot, scale, from, to);
    }
  }

  ctx.restore();
}
