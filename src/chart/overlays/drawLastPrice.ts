import type { ChartBar } from '@/types/bar';
import type { ChartColors } from '../chartTheme';
import { formatPrice } from '../format';
import type { RenderLayout } from '../renderer';
import { priceToY, type PriceScale } from '../scales';

/**
 * TradingView-style last price: dashed line across the plot + solid
 * colored chip on the right price axis (must paint AFTER the axis fill).
 */
export function drawLastPriceLine(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  last: ChartBar,
  priceScale: PriceScale,
  colors: ChartColors,
): void {
  const { plot, width, priceAxisWidth } = layout;
  const y = priceToY(last.close, priceScale, plot);
  if (y < plot.top || y > plot.top + plot.height) return;

  const up = last.close >= last.open;
  const color = up ? colors.upColor : colors.downColor;
  const yMid = Math.round(y) + 0.5;

  ctx.save();

  // Dashed line through the main plot only
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(plot.left, yMid);
  ctx.lineTo(plot.left + plot.width, yMid);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Axis chip — TradingView: full axis width, contrasting text
  const label = formatPrice(last.close);
  const labelH = 18;
  const axisX = width - priceAxisWidth;
  const labelY = Math.min(
    Math.max(y - labelH / 2, plot.top),
    plot.top + plot.height - labelH,
  );

  // Small left-pointing notch into the plot
  const notch = 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(axisX - notch, labelY + labelH / 2);
  ctx.lineTo(axisX, labelY);
  ctx.lineTo(axisX, labelY + labelH);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(axisX, labelY, priceAxisWidth, labelH);

  ctx.fillStyle = colors.onSolid;
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, axisX + 6, labelY + labelH / 2);

  ctx.restore();
}
