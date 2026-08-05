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
 * TradingView-style order / position overlay (canvas only — no DOM).
 * Keep paint cheap: few fillRect/stroke calls, skip off-screen markers.
 */

const FONT = '600 11px ui-sans-serif, system-ui, sans-serif';
const LABEL_H = 18;
const AXIS_LABEL_H = 18;

export interface DrawOrdersOpts {
  bars: readonly ChartBar[];
  range: VisibleRange;
  /** Full canvas width + price-axis width for axis chips. */
  width: number;
  priceAxisWidth: number;
}

function zoneFill(solid: string, alpha = 0.1): string {
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
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return solid;
}

function markerColor(colors: ChartColors, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const root = getComputedStyle(document.documentElement);
  return (
    root.getPropertyValue('--chart-order-marker').trim() ||
    root.getPropertyValue('--link').trim() ||
    colors.accent ||
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
  const labelBg = colors.labelBg || 'rgba(19, 21, 23, 0.92)';

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

    if (entry != null && sl != null && Math.abs(entry - sl) > 1e-12) {
      drawBand(ctx, plot, scale, entry, sl, zoneFill(sell));
    }
    if (entry != null && tp != null && Math.abs(entry - tp) > 1e-12) {
      drawBand(ctx, plot, scale, entry, tp, zoneFill(buy));
    }

    const openPos = !order.working && !order.draft && order.entry != null;
    const pending = Boolean(order.working || order.draft);
    const sideBuy = order.side === 'buy';
    const sizeTxt =
      order.size != null && Number.isFinite(order.size)
        ? order.size.toFixed(1)
        : order.size != null
          ? String(order.size)
          : '';

    // Entry line + label
    if (entry != null) {
      const pnl = openPos ? order.unrealizedPnL : null;
      const entryColor = sideBuy ? buy : sell;
      drawLevelLine(ctx, plot, scale, entry, entryColor, {
        dashed: pending,
        selected,
        width: openPos || selected ? 1.5 : 1,
      });

      if (openPos) {
        const seq = order.seqLabel ?? 1;
        const pnlTxt =
          pnl != null && Number.isFinite(pnl) ? formatMoney(pnl) : '$0';
        drawPositionLabel(ctx, plot, scale, entry, {
          prefix: `${seq}. P&L: ${pnlTxt} | `,
          qty: sizeTxt,
          color: entryColor,
          bg: labelBg,
          onSolid: colors.onSolid,
        });
      } else {
        const sideTxt = sideBuy ? 'Buy' : 'Sell';
        const parts = [
          order.draft ? 'Draft' : 'Pending',
          sideTxt,
          sizeTxt || null,
          formatPrice(entry),
        ].filter(Boolean) as string[];
        drawSimpleBorderLabel(
          ctx,
          plot,
          scale,
          entry,
          parts.join('  '),
          entryColor,
          labelBg,
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
        selected: selected || slInvalid,
        width: 1,
      });
      if (openPos) {
        const pnl =
          order.stopLossPnL != null && Number.isFinite(order.stopLossPnL)
            ? formatMoney(order.stopLossPnL)
            : '—';
        drawPositionLabel(ctx, plot, scale, sl, {
          prefix: slInvalid
            ? `SL. invalid | `
            : `SL. P&L: ${pnl} | `,
          qty: sizeTxt,
          color: sell,
          bg: labelBg,
          onSolid: colors.onSolid,
        });
      } else {
        drawSimpleBorderLabel(
          ctx,
          plot,
          scale,
          sl,
          slInvalid ? `SL  ${formatPrice(sl)}  invalid` : `SL  ${formatPrice(sl)}`,
          sell,
          labelBg,
        );
      }
    }

    if (tp != null) {
      drawLevelLine(ctx, plot, scale, tp, buy, {
        dashed: true,
        selected,
        width: 1,
      });
      if (openPos) {
        const pnl =
          order.takeProfitPnL != null && Number.isFinite(order.takeProfitPnL)
            ? formatMoney(order.takeProfitPnL)
            : '—';
        drawPositionLabel(ctx, plot, scale, tp, {
          prefix: `PT. P&L: ${pnl} | `,
          qty: sizeTxt,
          color: buy,
          bg: labelBg,
          onSolid: colors.onSolid,
        });
      } else {
        drawSimpleBorderLabel(
          ctx,
          plot,
          scale,
          tp,
          `PT  ${formatPrice(tp)}`,
          buy,
          labelBg,
        );
      }
    }

    // Entry fill marker on the open candle (arrow + price) — skip if off-screen.
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
        // Bright marker (TV uses cyan); fall back to accent / side color.
        markerColor(colors, sideBuy ? buy : sell),
        colors.muted,
      );
    }
  }

  ctx.restore();

  // Axis price chips (outside plot clip) — same pattern as last-price notch.
  if (opts && opts.priceAxisWidth > 0) {
    for (const order of orders) {
      const openPos = !order.working && !order.draft && order.entry != null;
      if (!openPos && !order.working && !order.draft) continue;
      const entry =
        order.entry != null ? dragPrice(order, 'entry', order.entry) : null;
      const sl =
        order.stopLoss != null ? dragPrice(order, 'sl', order.stopLoss) : null;
      const tp =
        order.takeProfit != null
          ? dragPrice(order, 'tp', order.takeProfit)
          : null;
      const sideBuy = order.side === 'buy';
      if (tp != null) {
        drawAxisChip(ctx, plot, scale, opts, tp, buy, colors.onSolid);
      }
      if (sl != null) {
        drawAxisChip(ctx, plot, scale, opts, sl, sell, colors.onSolid);
      }
      if (entry != null) {
        drawAxisChip(
          ctx,
          plot,
          scale,
          opts,
          entry,
          sideBuy ? buy : sell,
          colors.onSolid,
        );
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
): void {
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
  opts: { dashed?: boolean; selected?: boolean; width?: number },
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

/** Dark fill + colored border; qty in solid chip; visual ✕ (close via TradeDock). */
function drawPositionLabel(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  price: number,
  parts: {
    prefix: string;
    qty: string;
    color: string;
    bg: string;
    onSolid: string;
  },
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;

  const padX = 6;
  const qtyPad = 4;
  const closeTxt = '✕';
  const prefixW = ctx.measureText(parts.prefix).width;
  const qtyW = parts.qty ? ctx.measureText(parts.qty).width + qtyPad * 2 : 0;
  const midW = parts.qty ? ctx.measureText(' | ').width : 0;
  const closeW = ctx.measureText(closeTxt).width;
  const w = padX + prefixW + qtyW + midW + closeW + padX;
  const x = plot.left + plot.width - w - 4;
  const top = Math.min(
    Math.max(y - LABEL_H / 2, plot.top + 1),
    plot.top + plot.height - LABEL_H - 1,
  );

  ctx.fillStyle = parts.bg;
  roundRect(ctx, x, top, w, LABEL_H, 2);
  ctx.fill();
  ctx.strokeStyle = parts.color;
  ctx.lineWidth = 1;
  ctx.stroke();

  const cy = top + LABEL_H / 2;
  ctx.fillStyle = parts.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = x + padX;
  ctx.fillText(parts.prefix, cx, cy);
  cx += prefixW;

  if (parts.qty) {
    const qh = 14;
    const qy = top + (LABEL_H - qh) / 2;
    ctx.fillStyle = parts.color;
    roundRect(ctx, cx, qy, qtyW, qh, 2);
    ctx.fill();
    ctx.fillStyle = parts.onSolid;
    ctx.fillText(parts.qty, cx + qtyPad, cy);
    cx += qtyW;
    ctx.fillStyle = parts.color;
    ctx.fillText(' | ', cx, cy);
    cx += midW;
  }

  ctx.fillStyle = parts.color;
  ctx.fillText(closeTxt, cx, cy);
}

function drawSimpleBorderLabel(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  scale: PriceScale,
  price: number,
  text: string,
  color: string,
  bg: string,
): void {
  const y = priceToY(price, scale, plot);
  if (y < plot.top - 2 || y > plot.top + plot.height + 2) return;
  const padX = 7;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const x = plot.left + plot.width - w - 4;
  const top = Math.min(
    Math.max(y - LABEL_H / 2, plot.top + 1),
    plot.top + plot.height - LABEL_H - 1,
  );
  ctx.fillStyle = bg;
  roundRect(ctx, x, top, w, LABEL_H, 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
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

  // Small filled triangle (TV entry arrow).
  const s = 5;
  ctx.fillStyle = arrowColor;
  ctx.beginPath();
  if (isBuy) {
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

  const label = `$${formatPrice(entryPrice)}`;
  ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = isBuy ? 'top' : 'bottom';
  ctx.fillText(label, x, isBuy ? tipY + s + 2 : tipY - s - 2);
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
