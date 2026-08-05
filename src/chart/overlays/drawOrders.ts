import type { ChartBar, VisibleRange } from '@/types/bar';
import type { ChartOrder, OrderLevelHit, OrderLineKind } from '@/types/order';
import { orderHitPx } from '@/utils/touchTarget';
import { indexAtOrBeforeBars } from '@/data/timeframeAgg';
import { levelDrag } from '@/orders/levelDrag';
import type { ChartColors } from '../chartTheme';
import { formatPrice } from '../format';
import {
  indexToX,
  priceToY,
  type PlotRect,
  type PriceScale,
} from '../scales';

/**
 * Order / position overlay — canvas only.
 * Solid TV-style pills; no heavy RR fills (optional soft band only while dragging).
 */

const FONT = '600 11px ui-sans-serif, system-ui, sans-serif';
const LABEL_H = 18;
const AXIS_LABEL_H = 18;
/** Soft RR band while dragging a level (user-requested ~0.2). */
const DRAG_BAND_ALPHA = 0.2;

export interface DrawOrdersOpts {
  bars: readonly ChartBar[];
  range: VisibleRange;
  width: number;
  priceAxisWidth: number;
}

function markerColor(fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const root = getComputedStyle(document.documentElement);
  return (
    root.getPropertyValue('--chart-order-marker').trim() ||
    root.getPropertyValue('--link').trim() ||
    fallback
  );
}

/** Prefer semantic tokens; never use muted candle-body greys for orders. */
function orderColors(colors: ChartColors): { buy: string; sell: string } {
  const buy =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--success').trim() ||
        colors.upColor
      : colors.upColor;
  const sell =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() ||
        colors.downColor
      : colors.downColor;
  return { buy: buy || '#17c964', sell: sell || '#f31260' };
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 100 || Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2);
  if (n < 0) return `-$${body}`;
  return `$${body}`;
}

export function drawOrders(
  ctx: CanvasRenderingContext2D,
  orders: readonly ChartOrder[],
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  selectedId: string | null,
  opts?: DrawOrdersOpts,
): void {
  if (orders.length === 0 && !levelDrag.active) return;

  const { buy, sell } = orderColors(colors);

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.font = FONT;

  for (const order of orders) {
    const selected = order.id === selectedId || Boolean(order.draft);
    const entry =
      order.entry != null ? dragPrice(order, 'entry', order.entry) : null;
    const sl = order.stopLoss != null ? dragPrice(order, 'sl', order.stopLoss) : null;
    const tp =
      order.takeProfit != null ? dragPrice(order, 'tp', order.takeProfit) : null;

    // Soft band only while dragging this order's level — never a permanent fill.
    // Use globalAlpha (not rgba parse) so CSS tokens like --success still get 0.2.
    if (
      levelDrag.active &&
      levelDrag.orderId === order.id &&
      entry != null
    ) {
      if (levelDrag.kind === 'sl' && sl != null) {
        drawBand(ctx, plot, scale, entry, sl, sell, DRAG_BAND_ALPHA);
      } else if (levelDrag.kind === 'tp' && tp != null) {
        drawBand(ctx, plot, scale, entry, tp, buy, DRAG_BAND_ALPHA);
      }
    }

    const closed = Boolean(order.closed);
    const openPos =
      !order.working && !order.draft && !closed && order.entry != null;
    const pending = Boolean(order.working || order.draft);
    const sideBuy = order.side === 'buy';
    const sizeTxt =
      order.size != null && Number.isFinite(order.size)
        ? order.size.toFixed(1)
        : '';

    // Closed trade: entry + exit candle marks (no live SL/TP rails).
    if (closed && opts && order.entry != null && order.exit != null) {
      const pnl = order.realizedPnL;
      const win = pnl != null && Number.isFinite(pnl) ? pnl >= 0 : sideBuy;
      const markCol = win ? buy : sell;
      const reason = (order.exitReason ?? 'Exit').toUpperCase();
      const pnlTxt =
        pnl != null && Number.isFinite(pnl) ? formatMoney(pnl) : '';
      drawClosedTradeMarks(
        ctx,
        opts.bars,
        opts.range,
        plot,
        scale,
        order.createdAt,
        order.entry,
        order.exitAt ?? order.createdAt,
        order.exit,
        sideBuy,
        markCol,
        colors.muted,
        `${reason}${pnlTxt ? `  ${pnlTxt}` : ''}`,
        colors.onSolid,
      );
      continue;
    }

    if (entry != null) {
      const pnl = openPos ? order.unrealizedPnL : null;
      const entryColor =
        pnl != null && Number.isFinite(pnl)
          ? pnl >= 0
            ? buy
            : sell
          : sideBuy
            ? buy
            : sell;
      drawLevelLine(ctx, plot, scale, entry, entryColor, {
        dashed: pending,
        width: openPos || selected ? 1.5 : 1,
      });

      if (openPos) {
        const seq = order.seqLabel ?? 1;
        const pnlTxt =
          pnl != null && Number.isFinite(pnl) ? formatMoney(pnl) : '$0';
        const label = sizeTxt
          ? `${seq}. P&L: ${pnlTxt}  ${sizeTxt}`
          : `${seq}. P&L: ${pnlTxt}`;
        drawSolidLabel(ctx, plot, scale, entry, label, entryColor, colors.onSolid);
      } else {
        const sideTxt = sideBuy ? 'Buy' : 'Sell';
        const parts = [
          order.draft ? 'Draft' : 'Pending',
          sideTxt,
          sizeTxt || null,
          formatPrice(entry),
        ].filter(Boolean) as string[];
        drawSolidLabel(
          ctx,
          plot,
          scale,
          entry,
          parts.join('  '),
          entryColor,
          colors.onSolid,
        );
      }
    }

    if (sl != null) {
      const slInvalid =
        levelDrag.active &&
        levelDrag.orderId === order.id &&
        levelDrag.kind === 'sl' &&
        levelDrag.invalidReason != null;
      drawLevelLine(ctx, plot, scale, sl, sell, {
        dashed: true,
        width: selected || slInvalid ? 1.5 : 1,
      });
      if (openPos) {
        const pnl =
          order.stopLossPnL != null && Number.isFinite(order.stopLossPnL)
            ? formatMoney(order.stopLossPnL)
            : null;
        const label = slInvalid
          ? `SL  ${formatPrice(sl)}  invalid`
          : pnl != null
            ? `SL  ${pnl}`
            : `SL  ${formatPrice(sl)}`;
        drawSolidLabel(ctx, plot, scale, sl, label, sell, colors.onSolid);
      } else {
        drawSolidLabel(
          ctx,
          plot,
          scale,
          sl,
          slInvalid ? `SL  ${formatPrice(sl)}  invalid` : `SL  ${formatPrice(sl)}`,
          sell,
          colors.onSolid,
        );
      }
    }

    if (tp != null) {
      drawLevelLine(ctx, plot, scale, tp, buy, {
        dashed: true,
        width: selected ? 1.5 : 1,
      });
      if (openPos) {
        const pnl =
          order.takeProfitPnL != null && Number.isFinite(order.takeProfitPnL)
            ? formatMoney(order.takeProfitPnL)
            : null;
        const label =
          pnl != null ? `TP  ${pnl}` : `TP  ${formatPrice(tp)}`;
        drawSolidLabel(ctx, plot, scale, tp, label, buy, colors.onSolid);
      } else {
        drawSolidLabel(
          ctx,
          plot,
          scale,
          tp,
          `TP  ${formatPrice(tp)}`,
          buy,
          colors.onSolid,
        );
      }
    }

    if (
      openPos &&
      entry != null &&
      opts &&
      order.createdAt > 0 &&
      opts.bars.length > 0
    ) {
      drawEntryMarker(
        ctx,
        opts.bars,
        opts.range,
        plot,
        scale,
        order.createdAt,
        entry,
        sideBuy,
        markerColor(sideBuy ? buy : sell),
        colors.muted,
      );
    }
  }

  ctx.restore();

  // Axis chips for SL / TP only (entry conflicts with last-price tag).
  if (opts && opts.priceAxisWidth > 0) {
    for (const order of orders) {
      if (order.closed) continue;
      const sl =
        order.stopLoss != null ? dragPrice(order, 'sl', order.stopLoss) : null;
      const tp =
        order.takeProfit != null
          ? dragPrice(order, 'tp', order.takeProfit)
          : null;
      if (tp != null) {
        drawAxisChip(ctx, plot, scale, opts, tp, buy, colors.onSolid);
      }
      if (sl != null) {
        drawAxisChip(ctx, plot, scale, opts, sl, sell, colors.onSolid);
      }
    }
  }
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
  alpha: number = DRAG_BAND_ALPHA,
): void {
  const y1 = priceToY(a, scale, plot);
  const y2 = priceToY(b, scale, plot);
  const top = Math.min(y1, y2);
  const h = Math.abs(y2 - y1);
  if (h < 0.5) return;
  // globalAlpha so CSS tokens (--success/--danger) still render at 0.2.
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(plot.left, top, plot.width, h);
  ctx.restore();
}

function drawLevelLine(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  price: number,
  color: string,
  opts: { dashed?: boolean; width?: number },
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;
  const yMid = Math.round(y) + 0.5;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = opts.width ?? 1;
  ctx.setLineDash(opts.dashed ? [5, 4] : []);
  ctx.beginPath();
  ctx.moveTo(plot.left, yMid);
  ctx.lineTo(plot.left + plot.width, yMid);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Solid colored pill — readable on candles, lighter than bordered dark boxes. */
function drawSolidLabel(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  price: number,
  text: string,
  fill: string,
  textColor: string,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;

  const padX = 7;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const x = plot.left + plot.width - w - 6;
  const top = Math.min(
    Math.max(y - LABEL_H / 2, plot.top + 1),
    plot.top + plot.height - LABEL_H - 1,
  );

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x + 1, top + 1, w, LABEL_H, 3);
  ctx.fill();

  ctx.fillStyle = fill;
  roundRect(ctx, x, top, w, LABEL_H, 3);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, top + LABEL_H / 2);
}

function drawEntryMarker(
  ctx: CanvasRenderingContext2D,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  createdAt: number,
  entryPrice: number,
  isBuy: boolean,
  arrowColor: string,
  textColor: string,
): void {
  const idx = indexAtOrBeforeBars(bars, createdAt);
  if (idx < 0 || idx >= bars.length) return;
  if (idx < range.fromIndex - 1 || idx > range.toIndex + 1) return;

  const bar = bars[idx]!;
  const x = indexToX(idx, range, plot);
  const tipY = isBuy
    ? priceToY(bar.low, scale, plot) + 10
    : priceToY(bar.high, scale, plot) - 10;

  if (tipY < plot.top - 4 || tipY > plot.top + plot.height + 4) return;

  drawTriangleMarker(ctx, x, tipY, isBuy, arrowColor);

  const label = `$${formatPrice(entryPrice)}`;
  ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = isBuy ? 'top' : 'bottom';
  const s = 5;
  ctx.fillText(label, x, isBuy ? tipY + s + 2 : tipY - s - 2);
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
}

function drawTriangleMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  tipY: number,
  pointUp: boolean,
  color: string,
): void {
  const s = 5;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (pointUp) {
    ctx.moveTo(x, tipY - s);
    ctx.lineTo(x - s, tipY + s * 0.6);
    ctx.lineTo(x + s, tipY + s * 0.6);
  } else {
    ctx.moveTo(x, tipY + s);
    ctx.lineTo(x - s, tipY - s * 0.6);
    ctx.lineTo(x + s, tipY - s * 0.6);
  }
  ctx.closePath();
  ctx.fill();
}

/** Entry ▲/▼ on open candle + exit ▲/▼ on close candle + faint connector + exit label. */
function drawClosedTradeMarks(
  ctx: CanvasRenderingContext2D,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  entryTime: number,
  entryPrice: number,
  exitTime: number,
  exitPrice: number,
  isBuy: boolean,
  color: string,
  muted: string,
  exitLabel: string,
  onSolid: string,
): void {
  const entryIdx = indexAtOrBeforeBars(bars, entryTime);
  const exitIdx = indexAtOrBeforeBars(bars, exitTime);
  if (entryIdx < 0 || exitIdx < 0) return;

  const entryInView =
    entryIdx >= range.fromIndex - 1 && entryIdx <= range.toIndex + 1;
  const exitInView =
    exitIdx >= range.fromIndex - 1 && exitIdx <= range.toIndex + 1;
  if (!entryInView && !exitInView) return;

  const entryX = indexToX(entryIdx, range, plot);
  const exitX = indexToX(exitIdx, range, plot);
  const entryY = priceToY(entryPrice, scale, plot);
  const exitY = priceToY(exitPrice, scale, plot);

  // Faint connector between entry and exit prices.
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(entryX, entryY);
  ctx.lineTo(exitX, exitY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();

  if (entryInView) {
    const bar = bars[entryIdx]!;
    const tipY = isBuy
      ? priceToY(bar.low, scale, plot) + 10
      : priceToY(bar.high, scale, plot) - 10;
    drawTriangleMarker(ctx, entryX, tipY, isBuy, color);
    ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = isBuy ? 'top' : 'bottom';
    ctx.fillText(
      `$${formatPrice(entryPrice)}`,
      entryX,
      isBuy ? tipY + 7 : tipY - 7,
    );
  }

  if (exitInView) {
    const bar = bars[exitIdx]!;
    // Exit points opposite the entry (close of a long = sell → down triangle).
    const exitUp = !isBuy;
    const tipY = exitUp
      ? priceToY(bar.low, scale, plot) + 10
      : priceToY(bar.high, scale, plot) - 10;
    drawTriangleMarker(ctx, exitX, tipY, exitUp, color);
    // Label next to the exit candle — never a sticky right-edge pill
    // (those looked like live TP/SL rails after the trade was flat).
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lx = Math.min(exitX + 8, plot.left + plot.width - 8);
    const ly = Math.min(
      Math.max(tipY, plot.top + 8),
      plot.top + plot.height - 8,
    );
    ctx.fillText(exitLabel, lx, ly);
    void onSolid;
    void exitPrice;
  }

  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
}

function drawAxisChip(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  opts: DrawOrdersOpts,
  price: number,
  color: string,
  onSolid: string,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top || y > plot.top + plot.height) return;

  const label = formatPrice(price);
  const axisX = opts.width - opts.priceAxisWidth;
  const labelY = Math.min(
    Math.max(y - AXIS_LABEL_H / 2, plot.top),
    plot.top + plot.height - AXIS_LABEL_H,
  );
  const notch = 4;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(axisX - notch, labelY + AXIS_LABEL_H / 2);
  ctx.lineTo(axisX, labelY);
  ctx.lineTo(axisX, labelY + AXIS_LABEL_H);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(axisX, labelY, opts.priceAxisWidth, AXIS_LABEL_H);

  ctx.fillStyle = onSolid;
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, axisX + 6, labelY + AXIS_LABEL_H / 2);
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
    if (o.closed) continue; // marks only — not draggable
    const levels: { kind: OrderLineKind; price: number }[] = [];
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
