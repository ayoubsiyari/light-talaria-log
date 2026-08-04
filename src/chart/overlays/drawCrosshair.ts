import type { Timeframe } from '@/types/ui';
import type { ChartColors } from '../chartTheme';
import { formatPrice, formatTime } from '../format';
import { contentBottom, type RenderLayout } from '../renderer';
import type { CrosshairPoint } from '../types';

export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  point: CrosshairPoint,
  colors: ChartColors,
  paneTimeframe?: Timeframe | null,
): void {
  const { plot, width, height, priceAxisWidth, timeAxisHeight } = layout;
  const bottom = contentBottom(layout);

  // Exact media coords of the crosshair center (must match mouse in Normal mode)
  const cx = point.x;
  const cy = point.y;

  ctx.save();
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
  ctx.fillStyle = colors.crosshair;
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

  ctx.fillStyle = colors.crosshair;
  ctx.fillRect(priceX, priceY, priceW, labelH);
  ctx.fillStyle = colors.background;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(priceLabel, priceX + 4, priceY + labelH / 2);

  // Time label on bottom axis (include seconds on 1s…45s panes)
  const timeLabel = formatTime(point.time, { timeframe: paneTimeframe });
  const timeW = ctx.measureText(timeLabel).width + 10;
  const timeX = Math.min(
    Math.max(cx - timeW / 2, plot.left),
    plot.left + plot.width - timeW,
  );
  const timeY = height - timeAxisHeight + 4;

  ctx.fillStyle = colors.crosshair;
  ctx.fillRect(timeX, timeY, timeW, labelH);
  ctx.fillStyle = colors.background;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeLabel, timeX + timeW / 2, timeY + labelH / 2);

  ctx.restore();
}
