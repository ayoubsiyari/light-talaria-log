import type { ChartColors } from '../chartTheme';
import {
  formatCrosshairTime,
  formatPrice as formatPriceAdaptive,
  type PriceFormatter,
} from '../format';
import { contentBottom, type RenderLayout } from '../renderer';
import type { CrosshairPoint } from '../types';

/** Force opaque fill so axis ticks cannot show through (TV-style chips). */
function opaqueLabelFill(color: string, fallback: string): string {
  const m = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)/i,
  );
  if (m) return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
  if (color.startsWith('#') && (color.length === 9 || color.length === 5)) {
    // #RRGGBBAA / #RGBA → drop alpha
    return color.length === 9 ? color.slice(0, 7) : `#${color[1]}${color[2]}${color[3]}`;
  }
  if (color && color !== 'transparent') return color;
  return fallback;
}

/** Solid axis chip: erase underlay, then opaque plate (TradingView). */
function fillSolidChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: ChartColors,
): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.background;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = opaqueLabelFill(colors.crosshair, colors.muted);
  ctx.fillRect(x, y, w, h);
}

export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  point: CrosshairPoint,
  colors: ChartColors,
  formatPriceFn?: PriceFormatter,
): void {
  const formatPrice = formatPriceFn ?? formatPriceAdaptive;
  const { plot, width, height, priceAxisWidth, timeAxisHeight } = layout;
  const bottom = contentBottom(layout);

  // Exact media coords of the crosshair center (must match mouse in Normal mode)
  const cx = point.x;
  const cy = point.y;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);

  // Vertical through main + volume + indicator panes
  ctx.beginPath();
  ctx.moveTo(Math.round(cx) + 0.5, plot.top);
  ctx.lineTo(Math.round(cx) + 0.5, bottom);
  ctx.stroke();

  // Horizontal through center (clamped to content)
  const hy = Math.min(Math.max(cy, plot.top), bottom);
  ctx.beginPath();
  ctx.moveTo(plot.left, Math.round(hy) + 0.5);
  ctx.lineTo(plot.left + plot.width, Math.round(hy) + 0.5);
  ctx.stroke();

  ctx.setLineDash([]);

  // Center dot — makes cursor/crosshair alignment obvious
  ctx.fillStyle = opaqueLabelFill(colors.crosshair, colors.muted);
  ctx.beginPath();
  ctx.arc(cx, hy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.background;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, hy, 2.5, 0, Math.PI * 2);
  ctx.stroke();

  // Price label on right axis
  const priceLabel = formatPrice(point.price);
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  const priceW = Math.max(priceAxisWidth - 4, ctx.measureText(priceLabel).width + 10);
  const priceX = width - priceAxisWidth;
  const labelH = 18;
  const priceY = Math.min(
    Math.max(hy - labelH / 2, plot.top),
    bottom - labelH,
  );

  fillSolidChip(ctx, priceX, priceY, priceW, labelH, colors);
  // Chart bg text on solid hair plate — readable in dark + light.
  ctx.fillStyle = colors.background;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(priceLabel, priceX + 4, priceY + labelH / 2);

  // Time label on bottom axis (weekday + date/time)
  const timeLabel = formatCrosshairTime(point.time);
  const timeW = ctx.measureText(timeLabel).width + 10;
  const timeX = Math.min(
    Math.max(cx - timeW / 2, plot.left),
    plot.left + plot.width - timeW,
  );
  const timeY = height - timeAxisHeight + 4;

  fillSolidChip(ctx, timeX, timeY, timeW, labelH, colors);
  ctx.fillStyle = colors.background;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeLabel, timeX + timeW / 2, timeY + labelH / 2);

  ctx.restore();
}
