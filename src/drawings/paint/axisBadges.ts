import { logicalIndexAtTime } from '@/data/timeframeAgg';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '@/chart/scales';
import type { ChartColors } from '@/chart/chartTheme';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Drawing } from '../drawingStore';

function formatPrice(price: number): string {
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 1) return price.toFixed(2);
  if (abs >= 0.01) return price.toFixed(4);
  return price.toFixed(5);
}

function formatTime(ms: number): string {
  try {
    const d = new Date(ms);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

/**
 * Price (Y-axis) + time (X-axis) badges for selected drawing anchors.
 * Painted in the drawings layer so drag stays overlay-cheap.
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
): void {
  if (selectedIds.size === 0 || bars.length === 0) return;

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

  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;
  const labelH = 18;

  for (const price of prices) {
    const y = priceToY(price, priceScale, plot);
    if (y < plot.top - 2 || y > bottom + 2) continue;
    const label = formatPrice(price);
    const chipW = Math.max(44, ctx.measureText(label).width + 12);
    const labelY = Math.min(
      Math.max(y - labelH / 2, plot.top),
      bottom - labelH,
    );
    const axisX = right;
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(axisX - 4, labelY + labelH / 2);
    ctx.lineTo(axisX, labelY);
    ctx.lineTo(axisX, labelY + labelH);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(axisX, labelY, Math.min(chipW, 72), labelH);
    ctx.fillStyle = colors.onSolid;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, axisX + 5, labelY + labelH / 2);
  }

  for (const time of times) {
    const idx = logicalIndexAtTime(bars, time);
    const x = indexToX(idx, range, plot);
    if (x < plot.left - 2 || x > right + 2) continue;
    const label = formatTime(time);
    if (!label) continue;
    const chipW = Math.max(40, ctx.measureText(label).width + 10);
    const labelX = Math.min(
      Math.max(x - chipW / 2, plot.left),
      right - chipW,
    );
    const labelY = bottom;
    ctx.fillStyle = colors.accent;
    ctx.fillRect(labelX, labelY, chipW, labelH);
    ctx.beginPath();
    ctx.moveTo(x, labelY);
    ctx.lineTo(x - 4, labelY);
    ctx.lineTo(x + 4, labelY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.onSolid;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX + chipW / 2, labelY + labelH / 2);
  }

  ctx.restore();
}
