/**
 * Paint backtest entry/exit markers + sparse equity polyline from results only.
 * Engine stays dumb — no strategy math here.
 *
 * Dense-trade safe: binary-search cull by time, then skip markers closer than
 * MIN_MARKER_PX so zoomed-out overlays stay cheap.
 */
import { logicalIndexAtTime } from '@/data/timeframeAgg';
import type { BacktestResult, BacktestTrade, EquityPoint } from '@/types/backtest';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { ChartColors } from '../chartTheme';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '../scales';

const MARKER_R = 5;
/** Skip drawing another marker when closer than this (screen px). */
const MIN_MARKER_PX = 6;
/** Hard cap per paint — leftover trades still contribute via equity band. */
const MAX_MARKERS_PER_FRAME = 400;

export function drawBacktest(
  ctx: CanvasRenderingContext2D,
  result: BacktestResult | null | undefined,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  scale: PriceScale,
  colors: ChartColors,
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
    );
    if (painted.entryX != null) lastEntryX = painted.entryX;
    if (painted.exitX != null) lastExitX = painted.exitX;
    if (painted.drew) drawn++;
  }

  ctx.restore();
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
    // Include trades whose exit still overlaps the window
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
): { drew: boolean; entryX: number | null; exitX: number | null } {
  const win = trade.pnl >= 0;
  const segColor = win ? colors.upColor : colors.downColor;

  const entry = pointXY(trade.entryTime, trade.entryPrice, bars, range, plot, scale);
  const exit = pointXY(trade.exitTime, trade.exitPrice, bars, range, plot, scale);

  const showEntry = entry != null && Math.abs(entry.x - lastEntryX) >= MIN_MARKER_PX;
  const showExit = exit != null && Math.abs(exit.x - lastExitX) >= MIN_MARKER_PX;
  if (!showEntry && !showExit) {
    return { drew: false, entryX: null, exitX: null };
  }

  if (entry && exit && (showEntry || showExit)) {
    ctx.strokeStyle = segColor;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(entry.x, entry.y);
    ctx.lineTo(exit.x, exit.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (showEntry && entry) {
    drawTriangle(ctx, entry.x, entry.y, trade.side === 'buy' ? 'up' : 'down', colors.upColor);
  }
  if (showExit && exit) {
    drawTriangle(ctx, exit.x, exit.y, 'down', colors.downColor);
  }

  return {
    drew: true,
    entryX: showEntry && entry ? entry.x : null,
    exitX: showExit && exit ? exit.x : null,
  };
}

/** Equity curve in the top 18% of the plot (normalized), accent stroke. */
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
    if (started && Math.abs(x - lastX) < 1.5) continue; // decimate dense equity
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
