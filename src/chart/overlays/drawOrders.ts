import type { ChartOrder, OrderLevelHit, OrderLineKind } from '@/types/order';
import { orderHitPx } from '@/utils/touchTarget';
import type { ChartColors } from '../chartTheme';
import { formatPrice } from '../format';
import { priceToY, type PlotRect, type PriceScale } from '../scales';
import { levelDrag } from '@/orders/levelDrag';

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
    const selected = order.id === selectedId || Boolean(order.draft);
    const entry =
      order.entry != null ? dragPrice(order, 'entry', order.entry) : null;
    const slRaw = order.stopLoss;
    const tpRaw = order.takeProfit;
    const sl =
      slRaw != null ? dragPrice(order, 'sl', slRaw) : null;
    const tp =
      tpRaw != null ? dragPrice(order, 'tp', tpRaw) : null;

    if (entry != null && sl != null) {
      drawBand(ctx, plot, scale, entry, sl, 'rgba(248, 113, 113, 0.10)');
    }
    if (entry != null && tp != null) {
      drawBand(ctx, plot, scale, entry, tp, 'rgba(74, 222, 128, 0.10)');
    }

    const entryColor = order.side === 'buy' ? colors.upColor : colors.downColor;
    const dashed = Boolean(order.working || order.draft);
    const prefix = order.draft ? 'Draft ' : '';
    const openPos = !order.working && !order.draft && order.entry != null;
    const dragType =
      levelDrag.active &&
      levelDrag.orderId === order.id &&
      levelDrag.kind === 'entry' &&
      levelDrag.pendingType
        ? levelDrag.pendingType
        : null;

    if (entry != null) {
      const pnlText =
        openPos && order.unrealizedPnL != null
          ? `  ${formatPnL(order.unrealizedPnL)}`
          : '';
      const sizeText =
        openPos && order.size != null && Number.isFinite(order.size)
          ? ` ${order.size.toFixed(2)}`
          : '';
      const typeTxt = dragType ? `${dragType} ` : '';
      drawPriceLine(
        ctx,
        plot,
        scale,
        colors,
        entry,
        entryColor,
        selected,
        dashed,
        `${prefix}${typeTxt}${order.side.toUpperCase()}${sizeText} ${formatPrice(entry)}${pnlText}`,
        false,
        openPos ? order.unrealizedPnL ?? undefined : undefined,
      );
    }

    if (sl != null) {
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
        `${prefix}SL ${formatPrice(sl)}`,
        slInvalid,
      );
    }

    if (tp != null) {
      drawPriceLine(
        ctx,
        plot,
        scale,
        colors,
        tp,
        colors.upColor,
        selected,
        dashed,
        `${prefix}TP ${formatPrice(tp)}`,
        false,
      );
    }
  }

  ctx.restore();
}

function formatPnL(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 100 ? abs.toFixed(0) : abs.toFixed(2);
  return `${n >= 0 ? '+' : '−'}${body}`;
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
  pnl?: number,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;

  const lineColor =
    pnl != null ? (pnl >= 0 ? colors.upColor : colors.downColor) : color;

  ctx.strokeStyle = invalid ? colors.downColor : lineColor;
  ctx.lineWidth = selected || invalid || pnl != null ? 2 : 1.25;
  if (invalid) ctx.setLineDash([3, 3]);
  else if (dashed) ctx.setLineDash([6, 4]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(plot.left, y + 0.5);
  ctx.lineTo(plot.left + plot.width, y + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label chip on the right (TV-style) so it sits near the price axis
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  const pad = 4;
  const text = invalid ? `${label} · invalid` : label;
  const tw = ctx.measureText(text).width;
  const bx = plot.left + plot.width - tw - pad * 2 - 4;
  const by = y - 12;
  const chipFill =
    pnl != null
      ? pnl >= 0
        ? colors.upColor
        : colors.downColor
      : colors.labelBg;
  const chipText =
    pnl != null ? colors.onSolid : invalid ? colors.downColor : color;
  ctx.fillStyle = chipFill;
  ctx.fillRect(bx - 2, by - 10, tw + pad * 2, 14);
  ctx.fillStyle = chipText;
  ctx.fillText(text, bx + 2, by);
}

export function hitTestOrderLevel(
  y: number,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
): OrderLevelHit | null {
  if (orders.length === 0) return null;
  const hitPx = orderHitPx();
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i]!;
    const levels: { kind: OrderLineKind; price: number }[] = [];
    if (o.entry != null && !o.entryLocked) {
      levels.push({ kind: 'entry', price: o.entry });
    }
    if (o.stopLoss != null) levels.push({ kind: 'sl', price: o.stopLoss });
    if (o.takeProfit != null) levels.push({ kind: 'tp', price: o.takeProfit });
    for (const lv of levels) {
      const py = priceToY(lv.price, scale, plot);
      if (Math.abs(y - py) <= hitPx) {
        return { orderId: o.id, kind: lv.kind, price: lv.price };
      }
    }
  }
  return null;
}

export function hitTestOrders(
  y: number,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
): string | null {
  return hitTestOrderLevel(y, orders, plot, scale)?.orderId ?? null;
}
