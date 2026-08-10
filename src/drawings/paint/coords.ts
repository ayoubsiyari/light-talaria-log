import type { ChartColors } from '@/chart/chartTheme';
import type { PriceFormatter } from '@/chart/format';
import { formatPrice as formatPriceAdaptive } from '@/chart/format';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '@/chart/scales';
import { indexAtOrBeforeBars, logicalIndexAtTime } from '@/data/timeframeAgg';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { DrawingPoint } from '../drawingStore';

export interface PaintCtx {
  ctx: CanvasRenderingContext2D;
  bars: readonly ChartBar[];
  range: VisibleRange;
  plot: PlotRect;
  priceScale: PriceScale;
  colors: ChartColors;
  /** Instrument digits (NQ 2, EURUSD 5). Falls back to adaptive. */
  formatPrice?: PriceFormatter;
}

export function fmtPrice(pc: PaintCtx, price: number): string {
  return (pc.formatPrice ?? formatPriceAdaptive)(price);
}

export function pointToXY(p: DrawingPoint, pc: PaintCtx): { x: number; y: number } | null {
  if (pc.bars.length === 0) return null;
  const idx = logicalIndexAtTime(pc.bars, p.time);
  const x = indexToX(idx, pc.range, pc.plot);
  const y = priceToY(p.price, pc.priceScale, pc.plot);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function pointsToXY(
  points: readonly DrawingPoint[],
  pc: PaintCtx,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    const xy = pointToXY(p, pc);
    if (xy) out.push(xy);
  }
  return out;
}

export type LineExtendPaint = 'segment' | 'ray' | 'rayLeft' | 'extended';

/** Extend a segment past the plot edges (ray / extended line). */
export function extendLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: PlotRect,
  mode: LineExtendPaint,
): { x0: number; y0: number; x1: number; y1: number } {
  if (mode === 'segment') return { x0, y0, x1, y1 };
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x0, y0, x1, y1 };

  const len = Math.hypot(plot.width, plot.height) * 4;
  const ux = dx / Math.hypot(dx, dy);
  const uy = dy / Math.hypot(dx, dy);

  if (mode === 'ray') {
    return { x0, y0, x1: x0 + ux * len, y1: y0 + uy * len };
  }
  if (mode === 'rayLeft') {
    return { x0: x1 - ux * len, y0: y1 - uy * len, x1, y1 };
  }
  return {
    x0: x0 - ux * len,
    y0: y0 - uy * len,
    x1: x0 + ux * len,
    y1: y0 + uy * len,
  };
}

export function clipToPlot(pc: PaintCtx): void {
  const { ctx, plot } = pc;
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
}

/** Nearest bar for volume tools. */
export function barIndexAtTime(bars: readonly ChartBar[], time: number): number {
  return indexAtOrBeforeBars(bars, time);
}
