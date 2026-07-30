import type { ChartOrder } from '@/types/order';
import type { ChartColors } from '../chartTheme';
import { formatPrice } from '../format';
import { priceToY, type PlotRect, type PriceScale } from '../scales';

const HIT_PX = 6;

export function drawOrders(
  ctx: CanvasRenderingContext2D,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  selectedId: string | null,
): void {
  if (orders.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();

  for (const order of orders) {
    const selected = order.id === selectedId;
    const entryColor = order.side === 'buy' ? colors.upColor : colors.downColor;
    drawPriceLine(ctx, plot, scale, colors, order.entry, entryColor, selected, `${order.side.toUpperCase()} ${formatPrice(order.entry)}`);
    drawPriceLine(ctx, plot, scale, colors, order.stopLoss, colors.downColor, selected, `SL ${formatPrice(order.stopLoss)}`);
    drawPriceLine(ctx, plot, scale, colors, order.takeProfit, colors.upColor, selected, `TP ${formatPrice(order.takeProfit)}`);
  }

  ctx.restore();
}

function drawPriceLine(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  price: number,
  color: string,
  selected: boolean,
  label: string,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(plot.left, y + 0.5);
  ctx.lineTo(plot.left + plot.width, y + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  const pad = 4;
  const tw = ctx.measureText(label).width;
  const bx = plot.left + 6;
  const by = y - 12;
  ctx.fillStyle = colors.labelBg;
  ctx.fillRect(bx - 2, by - 10, tw + pad * 2, 14);
  ctx.fillStyle = color;
  ctx.fillText(label, bx + 2, by);
}

/** Hit-test order price lines; returns order id or null. */
export function hitTestOrders(
  y: number,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
): string | null {
  if (orders.length === 0) return null;
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i]!;
    for (const price of [o.entry, o.stopLoss, o.takeProfit]) {
      const py = priceToY(price, scale, plot);
      if (Math.abs(y - py) <= HIT_PX) return o.id;
    }
  }
  return null;
}
