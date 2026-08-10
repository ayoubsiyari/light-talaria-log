import { logicalIndexAtTime } from '@/data/timeframeAgg';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '@/chart/scales';
import type { ChartColors } from '@/chart/chartTheme';
import {
  formatPrice as formatPriceAdaptive,
  formatTime,
  type PriceFormatter,
} from '@/chart/format';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Drawing } from '../drawingStore';

export interface AxisBadgeLayout {
  /** Full canvas CSS width. */
  width: number;
  /** Full canvas CSS height. */
  height: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
}

/**
 * Price (Y-axis) + time (X-axis) badges for selected drawing anchors.
 * Matches crosshair / last-price chip placement (below volume on the time axis).
 */
export function paintAxisBadges(
  ctx: CanvasRenderingContext2D,
  drawings: readonly Drawing[],
  selectedIds: ReadonlySet<string>,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  colors: ChartColors,
  layout: AxisBadgeLayout,
  formatPriceFn?: PriceFormatter,
): void {
  if (selectedIds.size === 0 || bars.length === 0) return;
  const formatPrice = formatPriceFn ?? formatPriceAdaptive;

  const prices = new Set<number>();
  const times = new Set<number>();
  for (const d of drawings) {
    if (!selectedIds.has(d.id) || d.visible === false) continue;
    // Freehand: badges off by default (noise).
    if (d.type === 'brush' || d.type === 'highlighter') continue;
    for (const p of d.points) {
      if (Number.isFinite(p.price)) prices.add(p.price);
      if (Number.isFinite(p.time)) times.add(p.time);
    }
  }

  ctx.save();
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';

  const plotRight = plot.left + plot.width;
  const plotBottom = plot.top + plot.height;
  const labelH = 18;
  const axisX =
    layout.priceAxisWidth > 0
      ? layout.width - layout.priceAxisWidth
      : plotRight;
  const timeAxisY =
    layout.timeAxisHeight > 0
      ? layout.height - layout.timeAxisHeight + 4
      : plotBottom + 4;

  for (const price of prices) {
    const y = priceToY(price, priceScale, plot);
    if (y < plot.top - 2 || y > plotBottom + 2) continue;
    // Chart times/prices are Unix seconds + native price — same as last-price chip.
    const label = formatPrice(price);
    const chipW = Math.max(
      layout.priceAxisWidth > 0 ? layout.priceAxisWidth : 48,
      ctx.measureText(label).width + 12,
    );
    const labelY = Math.min(
      Math.max(y - labelH / 2, plot.top),
      plotBottom - labelH,
    );
    const notch = 4;
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(axisX - notch, labelY + labelH / 2);
    ctx.lineTo(axisX, labelY);
    ctx.lineTo(axisX, labelY + labelH);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(axisX, labelY, chipW, labelH);
    ctx.fillStyle = colors.onSolid;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, axisX + 6, labelY + labelH / 2);
  }

  for (const time of times) {
    // Drawing anchors store Unix seconds (same as ChartBar.time).
    const idx = logicalIndexAtTime(bars, time);
    const x = indexToX(idx, range, plot);
    if (x < plot.left - 2 || x > plotRight + 2) continue;
    const label = formatTime(time);
    if (!label) continue;
    const chipW = Math.max(48, ctx.measureText(label).width + 12);
    const labelX = Math.min(
      Math.max(x - chipW / 2, plot.left),
      plotRight - chipW,
    );
    // Sit on the real time axis under volume / indicator panes — not on plot bottom.
    ctx.fillStyle = colors.accent;
    ctx.fillRect(labelX, timeAxisY, chipW, labelH);
    ctx.beginPath();
    ctx.moveTo(x, timeAxisY);
    ctx.lineTo(x - 4, timeAxisY);
    ctx.lineTo(x + 4, timeAxisY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.onSolid;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX + chipW / 2, timeAxisY + labelH / 2);
  }

  ctx.restore();
}
