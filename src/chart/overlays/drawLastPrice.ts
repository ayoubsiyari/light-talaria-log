import type { ChartBar } from '@/types/bar';
import type { ChartColors } from '../chartTheme';
import { formatPrice } from '../format';
import type { RenderLayout } from '../renderer';
import { priceToY, type PriceScale } from '../scales';

export function drawLastPriceLine(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  bars: readonly ChartBar[],
  priceScale: PriceScale,
  colors: ChartColors,
): void {
  const last = bars[bars.length - 1];
  if (!last) return;

  const { plot, width, priceAxisWidth } = layout;
  const y = priceToY(last.close, priceScale, plot);
  if (y < plot.top || y > plot.top + plot.height) return;

  const up = last.close >= last.open;
  const color = up ? colors.upColor : colors.downColor;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(plot.left, y + 0.5);
  ctx.lineTo(plot.left + plot.width, y + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  const label = formatPrice(last.close);
  const labelH = 18;
  const priceX = width - priceAxisWidth;
  const labelY = Math.min(Math.max(y - labelH / 2, plot.top), plot.top + plot.height - labelH);

  ctx.fillStyle = color;
  ctx.fillRect(priceX, labelY, priceAxisWidth, labelH);
  ctx.fillStyle = colors.background;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, priceX + 4, labelY + labelH / 2);
  ctx.restore();
}
