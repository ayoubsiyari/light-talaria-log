import type { ChartOrder, OrderLevelHit, OrderLineKind } from '@/types/order';
import type { ChartColors } from '../chartTheme';
import { formatPrice } from '../format';
import { priceToY, type PlotRect, type PriceScale } from '../scales';
import { levelDrag } from '@/orders/levelDrag';

const HIT_PX = 6;

export function drawOrders(
  ctx: CanvasRenderingContext2D,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  selectedId: string | null,
): void {
  if (orders.length === 0 && !levelDrag.active) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();

  for (const order of orders) {
    const selected = order.id === selectedId;
    const entry = dragPrice(order, 'entry', order.entry);
    const sl = dragPrice(order, 'sl', order.stopLoss);
    const tp = dragPrice(order, 'tp', order.takeProfit);

    // Risk / reward bands
    drawBand(ctx, plot, scale, entry, sl, 'rgba(248, 113, 113, 0.08)');
    drawBand(ctx, plot, scale, entry, tp, 'rgba(74, 222, 128, 0.08)');

    const entryColor = order.side === 'buy' ? colors.upColor : colors.downColor;
    const dashed = Boolean(order.working);
    drawPriceLine(
      ctx,
      plot,
      scale,
      colors,
      entry,
      entryColor,
      selected,
      dashed,
      `${order.side.toUpperCase()} ${formatPrice(entry)}`,
      false,
    );
    const slInvalid =
      levelDrag.active &&
      levelDrag.orderId === order.id &&
      levelDrag.kind === 'sl' &&
      levelDrag.invalidReason != null;
    drawPriceLine(
      ctx,
      plot,
      scale,
      colors,
      sl,
      colors.downColor,
      selected,
      dashed,
      `SL ${formatPrice(sl)}`,
      slInvalid,
    );
    drawPriceLine(
      ctx,
      plot,
      scale,
      colors,
      tp,
      colors.upColor,
      selected,
      dashed,
      `TP ${formatPrice(tp)}`,
      false,
    );
  }

  ctx.restore();
}

function dragPrice(order: ChartOrder, kind: OrderLineKind, fallback: number): number {
  if (levelDrag.active && levelDrag.orderId === order.id && levelDrag.kind === kind) {
    return levelDrag.currentPrice;
  }
  return fallback;
}

function drawBand(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  a: number,
  b: number,
  fill: string,
): void {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return;
  const y1 = priceToY(a, scale, plot);
  const y2 = priceToY(b, scale, plot);
  const top = Math.min(y1, y2);
  const h = Math.abs(y2 - y1);
  if (h < 0.5) return;
  ctx.fillStyle = fill;
  ctx.fillRect(plot.left, top, plot.width, h);
}

function drawPriceLine(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  price: number,
  color: string,
  selected: boolean,
  dashed: boolean,
  label: string,
  invalid: boolean,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;

  ctx.strokeStyle = invalid ? colors.downColor : color;
  ctx.lineWidth = selected || invalid ? 2 : 1;
  if (invalid) ctx.setLineDash([3, 3]);
  else if (dashed) ctx.setLineDash([5, 4]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(plot.left, y + 0.5);
  ctx.lineTo(plot.left + plot.width, y + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  const pad = 4;
  const text = invalid ? `${label} · invalid` : label;
  const tw = ctx.measureText(text).width;
  const bx = plot.left + 6;
  const by = y - 12;
  ctx.fillStyle = colors.labelBg;
  ctx.fillRect(bx - 2, by - 10, tw + pad * 2, 14);
  ctx.fillStyle = invalid ? colors.downColor : color;
  ctx.fillText(text, bx + 2, by);
}

/** Hit-test order price lines; returns level hit or null. */
export function hitTestOrderLevel(
  y: number,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
): OrderLevelHit | null {
  if (orders.length === 0) return null;
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i]!;
    const levels: { kind: OrderLineKind; price: number }[] = [
      { kind: 'entry', price: o.entry },
      { kind: 'sl', price: o.stopLoss },
      { kind: 'tp', price: o.takeProfit },
    ];
    for (const lv of levels) {
      const py = priceToY(lv.price, scale, plot);
      if (Math.abs(y - py) <= HIT_PX) {
        return { orderId: o.id, kind: lv.kind, price: lv.price };
      }
    }
  }
  return null;
}

/** @deprecated use hitTestOrderLevel */
export function hitTestOrders(
  y: number,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
): string | null {
  return hitTestOrderLevel(y, orders, plot, scale)?.orderId ?? null;
}
