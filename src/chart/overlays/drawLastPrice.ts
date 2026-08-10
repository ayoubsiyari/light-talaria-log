import type { ChartBar } from '@/types/bar';
import type { ChartColors } from '../chartTheme';
import {
  formatPrice as formatPriceAdaptive,
  type PriceFormatter,
} from '../format';
import type { RenderLayout } from '../renderer';
import { priceToY, type PriceScale } from '../scales';

function dashForStyle(style: ChartColors['lastPriceLineStyle']): number[] {
  if (style === 'solid') return [];
  if (style === 'dotted') return [1, 3];
  return [4, 3];
}

/**
 * TradingView-style last price: line across the plot + optional chip on price axis.
 */
export function drawLastPriceLine(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  last: ChartBar,
  priceScale: PriceScale,
  colors: ChartColors,
  formatPriceFn?: PriceFormatter,
): void {
  const formatPrice = formatPriceFn ?? formatPriceAdaptive;
  const { plot, width, priceAxisWidth } = layout;
  const y = priceToY(last.close, priceScale, plot);
  if (y < plot.top || y > plot.top + plot.height) return;

  const up = last.close >= last.open;
  const color = up ? colors.upColor : colors.downColor;
  const yMid = Math.round(y) + 0.5;

  ctx.save();

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.setLineDash(dashForStyle(colors.lastPriceLineStyle));
  ctx.beginPath();
  ctx.moveTo(plot.left, yMid);
  ctx.lineTo(plot.left + plot.width, yMid);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (!colors.showLastPriceLabel || priceAxisWidth <= 0) {
    ctx.restore();
    return;
  }

  const label = formatPrice(last.close);
  const labelH = 18;
  const axisX = width - priceAxisWidth;
  const labelY = Math.min(
    Math.max(y - labelH / 2, plot.top),
    plot.top + plot.height - labelH,
  );

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
