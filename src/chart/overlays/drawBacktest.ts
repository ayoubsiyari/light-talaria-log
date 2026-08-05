/**
 * Paint strategy-run markers + condition labels + sparse equity polyline.
 * Engine stays dumb — no strategy math here.
 *
 * Dense-trade safe: binary-search cull by time, then skip markers closer than
 * MIN_MARKER_PX so zoomed-out overlays stay cheap.
 */
import { logicalIndexAtTime } from '@/data/timeframeAgg';
import type {
  BacktestEvent,
  BacktestResult,
  BacktestTrade,
  EquityPoint,
} from '@/types/backtest';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { ChartColors } from '../chartTheme';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '../scales';

const MARKER_R = 5;
/** Skip drawing another marker when closer than this (screen px). */
const MIN_MARKER_PX = 6;
/** Hard cap per paint — leftover trades still contribute via equity band. */
const MAX_MARKERS_PER_FRAME = 400;
/** Min gap between label chips (px). */
const MIN_LABEL_PX = 24;
const MAX_LABELS_PER_FRAME = 140;

export function drawBacktest(
  ctx: CanvasRenderingContext2D,
  result: BacktestResult | null | undefined,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  /** Journal / deep-link focus — brief highlight on matching trade id. */
  focusedTradeId: string | null = null,
): void {
  if (!result || bars.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();

  drawEquityPolyline(ctx, result.equity, bars, range, plot, colors);

  const fromT = bars[Math.max(0, Math.floor(range.fromIndex))]?.time;
  const toT = bars[Math.min(bars.length - 1, Math.ceil(range.toIndex))]?.time;
  if (fromT == null || toT == null) {
    ctx.restore();
    return;
  }

  const padSec = Math.max(1, (toT - fromT) * 0.02);
  const trades = result.trades;
  const lo = lowerBoundTrade(trades, fromT - padSec);
  const hi = upperBoundTrade(trades, toT + padSec);

  const events = result.events?.length
    ? result.events
    : synthesizeEventsFromTrades(trades);
  const eventsOwnMarkers = events.length > 0;

  let drawn = 0;
  let lastEntryX = -Infinity;
  let lastExitX = -Infinity;

  for (let i = lo; i < hi && drawn < MAX_MARKERS_PER_FRAME; i++) {
    const trade = trades[i]!;
    const painted = drawTrade(
      ctx,
      trade,
      bars,
      range,
      plot,
      scale,
      colors,
      lastEntryX,
      lastExitX,
      focusedTradeId != null && trade.id === focusedTradeId,
      /* markers */ !eventsOwnMarkers,
    );
    if (painted.entryX != null) lastEntryX = painted.entryX;
    if (painted.exitX != null) lastExitX = painted.exitX;
    if (painted.drew) drawn++;
  }

  drawEventLabels(
    ctx,
    events,
    bars,
    range,
    plot,
    scale,
    colors,
    fromT - padSec,
    toT + padSec,
    focusedTradeId,
  );

  ctx.restore();
}

function synthesizeEventsFromTrades(
  trades: readonly BacktestTrade[],
): BacktestEvent[] {
  const out: BacktestEvent[] = [];
  for (const t of trades) {
    out.push({
      id: `${t.id}-in`,
      time: t.entryTime,
      price: t.entryPrice,
      kind: 'entry',
      label: t.entryReason ?? (t.side === 'buy' ? 'Long entry' : 'Short entry'),
      side: t.side,
      tradeId: t.id,
    });
    out.push({
      id: `${t.id}-out`,
      time: t.exitTime,
      price: t.exitPrice,
      kind: 'exit',
      label: t.exitReason ?? 'Exit',
      side: t.side,
      tradeId: t.id,
    });
  }
  return out;
}

function drawEventLabels(
  ctx: CanvasRenderingContext2D,
  events: readonly BacktestEvent[],
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  fromT: number,
  toT: number,
  focusedTradeId: string | null,
): void {
  if (events.length === 0) return;

  // Sort by time for stable cull
  const sorted = events
    .filter((e) => e.time >= fromT && e.time <= toT)
    .slice()
    .sort((a, b) => a.time - b.time);

  let lastLabelX = -Infinity;
  let labels = 0;
  let alt = 0;

  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  for (const ev of sorted) {
    if (labels >= MAX_LABELS_PER_FRAME) break;
    const pt = pointXY(ev.time, ev.price, bars, range, plot, scale);
    if (!pt) continue;

    const focused = focusedTradeId != null && ev.tradeId === focusedTradeId;
    if (!focused && Math.abs(pt.x - lastLabelX) < MIN_LABEL_PX) continue;

    const isDetect = ev.kind === 'signal';
    const fill = isDetect
      ? colors.accent
      : ev.kind === 'exit'
        ? colors.downColor
        : ev.side === 'sell'
          ? colors.downColor
          : colors.upColor;

    // Entry/exit = triangles; piece detections = diamonds (easy to tell apart)
    if (isDetect) {
      drawDiamond(ctx, pt.x, pt.y, fill);
    } else {
      drawTriangle(
        ctx,
        pt.x,
        pt.y,
        ev.kind === 'exit' || ev.side === 'sell' ? 'down' : 'up',
        fill,
      );
    }

    const text = truncateLabel(ev.label, 28);
    const tw = ctx.measureText(text).width;
    const padX = 4;
    const h = 14;
    const w = tw + padX * 2;
    const above = alt % 2 === 0;
    alt += 1;
    const bx = Math.min(
      Math.max(plot.left + 2, pt.x - w / 2),
      plot.left + plot.width - w - 2,
    );
    const by = above
      ? Math.max(plot.top + 2, pt.y - MARKER_R - h - 4)
      : Math.min(plot.top + plot.height - h - 2, pt.y + MARKER_R + 4);

    ctx.globalAlpha = focused ? 0.95 : 0.82;
    ctx.fillStyle = colors.background;
    ctx.strokeStyle = focused ? colors.accent : fill;
    ctx.lineWidth = focused ? 1.5 : 1;
    roundRect(ctx, bx, by, w, h, 3);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.axisText;
    ctx.textAlign = 'left';
    ctx.fillText(text, bx + padX, by + h / 2);

    lastLabelX = pt.x;
    labels += 1;
  }
}

function truncateLabel(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
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

function lowerBoundTrade(trades: readonly BacktestTrade[], time: number): number {
  let lo = 0;
  let hi = trades.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const t = trades[mid]!.entryTime;
    if (t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundTrade(trades: readonly BacktestTrade[], time: number): number {
  let lo = 0;
  let hi = trades.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const t = Math.max(trades[mid]!.entryTime, trades[mid]!.exitTime);
    if (t <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function drawTrade(
  ctx: CanvasRenderingContext2D,
  trade: BacktestTrade,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
  lastEntryX: number,
  lastExitX: number,
  focused = false,
  drawMarkers = true,
): { drew: boolean; entryX: number | null; exitX: number | null } {
  const win = trade.pnl >= 0;
  const segColor = win ? colors.upColor : colors.downColor;

  const entry = pointXY(trade.entryTime, trade.entryPrice, bars, range, plot, scale);
  const exit = pointXY(trade.exitTime, trade.exitPrice, bars, range, plot, scale);

  const showEntry =
    entry != null && (focused || Math.abs(entry.x - lastEntryX) >= MIN_MARKER_PX);
  const showExit =
    exit != null && (focused || Math.abs(exit.x - lastExitX) >= MIN_MARKER_PX);
  if (!entry && !exit) {
    return { drew: false, entryX: null, exitX: null };
  }

  if (entry && exit) {
    ctx.strokeStyle = focused ? colors.accent : segColor;
    ctx.globalAlpha = focused ? 0.9 : 0.45;
    ctx.lineWidth = focused ? 2 : 1;
    ctx.setLineDash(focused ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(entry.x, entry.y);
    ctx.lineTo(exit.x, exit.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (drawMarkers) {
    if (showEntry && entry) {
      if (focused) {
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(entry.x, entry.y, MARKER_R + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawTriangle(
        ctx,
        entry.x,
        entry.y,
        trade.side === 'buy' ? 'up' : 'down',
        colors.upColor,
      );
    }
    if (showExit && exit) {
      drawTriangle(ctx, exit.x, exit.y, 'down', colors.downColor);
    }
  }

  return {
    drew: true,
    entryX: showEntry && entry ? entry.x : null,
    exitX: showExit && exit ? exit.x : null,
  };
}

function drawEquityPolyline(
  ctx: CanvasRenderingContext2D,
  equity: readonly EquityPoint[],
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  colors: ChartColors,
): void {
  if (equity.length < 2) return;

  let minE = Number.POSITIVE_INFINITY;
  let maxE = Number.NEGATIVE_INFINITY;
  for (const p of equity) {
    if (p.equity < minE) minE = p.equity;
    if (p.equity > maxE) maxE = p.equity;
  }
  if (!Number.isFinite(minE) || !Number.isFinite(maxE)) return;
  if (maxE <= minE) {
    maxE = minE + 1e-9;
  }

  const bandTop = plot.top + 4;
  const bandH = plot.height * 0.18;

  ctx.strokeStyle = colors.accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  let started = false;
  let lastX = -Infinity;
  for (const p of equity) {
    const idx = logicalIndexAtTime(bars, p.time);
    if (idx < range.fromIndex - 1 || idx > range.toIndex + 1) continue;
    const x = indexToX(idx, range, plot);
    if (started && Math.abs(x - lastX) < 1.5) continue;
    const t = (p.equity - minE) / (maxE - minE);
    const y = bandTop + bandH * (1 - t);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
    lastX = x;
  }
  if (started) ctx.stroke();
  ctx.globalAlpha = 1;
}

function pointXY(
  time: number,
  price: number,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
): { x: number; y: number } | null {
  const idx = logicalIndexAtTime(bars, time);
  if (idx < range.fromIndex - 2 || idx > range.toIndex + 2) return null;
  const x = indexToX(idx, range, plot);
  const y = priceToY(price, scale, plot);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: 'up' | 'down',
  color: string,
): void {
  const r = MARKER_R;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (dir === 'up') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x - r, y + r * 0.7);
    ctx.lineTo(x + r, y + r * 0.7);
  } else {
    ctx.moveTo(x, y + r);
    ctx.lineTo(x - r, y - r * 0.7);
    ctx.lineTo(x + r, y - r * 0.7);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  const r = MARKER_R - 0.5;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}
