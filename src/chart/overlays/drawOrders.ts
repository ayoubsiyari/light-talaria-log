import type { ChartOrder, OrderLevelHit, OrderLineKind } from '@/types/order';
import { orderHitPx } from '@/utils/touchTarget';
import type { ChartColors } from '../chartTheme';
import { formatPrice } from '../format';
import type { RenderLayout } from '../renderer';
import { priceToY, type PlotRect, type PriceScale } from '../scales';
import { levelDrag } from '@/orders/levelDrag';

const LABEL_H = 18;
const NOTCH = 5;

/** Soft zone fill from a solid theme color (TV risk/reward bands). */
function zoneFill(solid: string, alpha = 0.12): string {
  // Accept #rgb / #rrggbb / rgb() / css vars already resolved by getChartColors.
  const hex = solid.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (m) {
    let h = m[1]!;
    if (h.length === 3) {
      h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(hex);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }
  return solid;
}

export function drawOrders(
  ctx: CanvasRenderingContext2D,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  selectedId: string | null,
  layout?: Pick<RenderLayout, 'width' | 'priceAxisWidth'>,
): void {
  if (orders.length === 0 && !levelDrag.active) return;

  const axisW = layout?.priceAxisWidth ?? 0;
  const canvasW = layout?.width ?? plot.left + plot.width + axisW;
  const axisX = axisW > 0 ? canvasW - axisW : plot.left + plot.width;

  ctx.save();

  for (const order of orders) {
    const selected = order.id === selectedId || Boolean(order.draft);
    const entry =
      order.entry != null ? dragPrice(order, 'entry', order.entry) : null;
    const slRaw = order.stopLoss;
    const tpRaw = order.takeProfit;
    const sl = slRaw != null ? dragPrice(order, 'sl', slRaw) : null;
    const tp = tpRaw != null ? dragPrice(order, 'tp', tpRaw) : null;

    // Zones clipped to the plot (not the price axis).
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    if (entry != null && sl != null) {
      drawBand(ctx, plot, scale, entry, sl, zoneFill(colors.downColor));
    }
    if (entry != null && tp != null) {
      drawBand(ctx, plot, scale, entry, tp, zoneFill(colors.upColor));
    }
    ctx.restore();

    const openPos = !order.working && !order.draft && order.entry != null;
    const pending = Boolean(order.working || order.draft);
    const sideBuy = order.side === 'buy';
    const pnl = openPos ? order.unrealizedPnL : null;
    const entryColor =
      pnl != null && Number.isFinite(pnl)
        ? pnl >= 0
          ? colors.upColor
          : colors.downColor
        : sideBuy
          ? colors.upColor
          : colors.downColor;

    if (entry != null) {
      drawLevelLine(ctx, plot, scale, entry, entryColor, {
        dashed: pending,
        selected,
        stopAt: axisX,
      });

      // Left qty badge (TV open-position style).
      if (openPos && order.size != null && Number.isFinite(order.size)) {
        drawLeftQtyBadge(
          ctx,
          plot,
          scale,
          entry,
          order.size.toFixed(2),
          entryColor,
          colors.onSolid,
        );
      }

      const sideTxt = sideBuy ? 'Buy' : 'Sell';
      const sizeTxt =
        order.size != null && Number.isFinite(order.size)
          ? ` ${order.size.toFixed(2)}`
          : '';
      const pnlTxt =
        pnl != null && Number.isFinite(pnl) ? ` ${formatPnL(pnl)}` : '';
      const draftTxt = order.draft ? 'Draft ' : '';
      const dragType =
        levelDrag.active &&
        levelDrag.orderId === order.id &&
        levelDrag.kind === 'entry' &&
        levelDrag.pendingType
          ? `${levelDrag.pendingType} `
          : '';
      drawAxisChip(
        ctx,
        plot,
        scale,
        entry,
        `${draftTxt}${dragType}${sideTxt}${sizeTxt}${pnlTxt}`,
        entryColor,
        colors.onSolid,
        axisX,
        axisW,
        selected,
      );
    }

    if (sl != null) {
      const slInvalid =
        levelDrag.active &&
        levelDrag.orderId === order.id &&
        levelDrag.kind === 'sl' &&
        levelDrag.invalidReason != null;
      drawLevelLine(ctx, plot, scale, sl, colors.downColor, {
        dashed: true,
        selected: selected || slInvalid,
        stopAt: axisX,
        invalid: slInvalid,
      });
      drawAxisChip(
        ctx,
        plot,
        scale,
        sl,
        slInvalid ? `SL ${formatPrice(sl)} · invalid` : `SL ${formatPrice(sl)}`,
        colors.downColor,
        colors.onSolid,
        axisX,
        axisW,
        selected || slInvalid,
      );
    }

    if (tp != null) {
      drawLevelLine(ctx, plot, scale, tp, colors.upColor, {
        dashed: true,
        selected,
        stopAt: axisX,
      });
      drawAxisChip(
        ctx,
        plot,
        scale,
        tp,
        `TP ${formatPrice(tp)}`,
        colors.upColor,
        colors.onSolid,
        axisX,
        axisW,
        selected,
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

function drawLevelLine(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  price: number,
  color: string,
  opts: {
    dashed?: boolean;
    selected?: boolean;
    stopAt?: number;
    invalid?: boolean;
  },
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;
  const yMid = Math.round(y) + 0.5;
  const x1 = plot.left;
  const x2 = opts.stopAt ?? plot.left + plot.width;

  ctx.strokeStyle = color;
  ctx.globalAlpha = opts.selected || opts.invalid ? 1 : 0.92;
  ctx.lineWidth = opts.selected || opts.invalid ? 1.5 : 1;
  if (opts.invalid) ctx.setLineDash([2, 3]);
  else if (opts.dashed) ctx.setLineDash([4, 3]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, yMid);
  ctx.lineTo(Math.max(x1, x2), yMid);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Compact qty pill on the left of the plot (TV position badge). */
function drawLeftQtyBadge(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  price: number,
  text: string,
  fill: string,
  textColor: string,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top || y > plot.top + plot.height) return;
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  const padX = 5;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const h = 16;
  const x = plot.left + 2;
  const top = Math.min(
    Math.max(y - h / 2, plot.top + 1),
    plot.top + plot.height - h - 1,
  );
  roundRect(ctx, x, top, w, h, 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, top + h / 2);
}

/**
 * TradingView price-axis chip: notch into the plot + solid rect on the axis.
 */
function drawAxisChip(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  price: number,
  text: string,
  fill: string,
  textColor: string,
  axisX: number,
  axisW: number,
  selected: boolean,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;

  ctx.font = selected
    ? '600 11px ui-sans-serif, system-ui, sans-serif'
    : '600 10px ui-sans-serif, system-ui, sans-serif';
  const label = text.trim();
  const pad = 6;
  const tw = ctx.measureText(label).width;
  const chipW = axisW > 0 ? axisW : tw + pad * 2;
  const labelH = LABEL_H;
  const labelY = Math.min(
    Math.max(y - labelH / 2, plot.top),
    plot.top + plot.height - labelH,
  );

  ctx.fillStyle = fill;
  // Notch pointing into the plot (same geometry as last-price label).
  ctx.beginPath();
  ctx.moveTo(axisX - NOTCH, labelY + labelH / 2);
  ctx.lineTo(axisX, labelY);
  ctx.lineTo(axisX, labelY + labelH);
  ctx.closePath();
  ctx.fill();

  if (axisW > 0) {
    ctx.fillRect(axisX, labelY, chipW, labelH);
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // Prefer fitting the full label; ellipsis if axis is tight.
    const maxTw = chipW - pad;
    let draw = label;
    if (tw > maxTw) {
      while (draw.length > 1 && ctx.measureText(`${draw}…`).width > maxTw) {
        draw = draw.slice(0, -1);
      }
      draw = `${draw}…`;
    }
    ctx.fillText(draw, axisX + 5, labelY + labelH / 2);
  } else {
    // Fallback: in-plot chip at the right edge when axis width unknown.
    const w = tw + pad * 2;
    const x = plot.left + plot.width - w - 2;
    roundRect(ctx, x, labelY, w, labelH, 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + pad, labelY + labelH / 2);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
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
    // Prefer SL/TP over entry when coincident (TV: drag brackets off the order line).
    if (o.stopLoss != null) levels.push({ kind: 'sl', price: o.stopLoss });
    if (o.takeProfit != null) levels.push({ kind: 'tp', price: o.takeProfit });
    if (o.entry != null && !o.entryLocked) {
      levels.push({ kind: 'entry', price: o.entry });
    }
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
