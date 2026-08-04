/** Monthly P&L heatmap (calendar months). */

import { fmtAxis, prepCanvas, readAnalyticsChartTheme } from './chartTheme';

export interface MonthCell {
  key: string; // YYYY-MM
  n: number;
  netPnl: number;
  wins: number;
}

export function drawMonthHeatmap(
  canvas: HTMLCanvasElement,
  months: readonly MonthCell[],
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 140);
  if (!g) return;
  const { ctx, w, h, pad } = g;

  if (months.length === 0) {
    ctx.fillStyle = theme.muted;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('No monthly buckets yet', pad, h / 2);
    return;
  }

  let maxAbs = 1e-9;
  for (const m of months) {
    const a = Math.abs(m.netPnl);
    if (a > maxAbs) maxAbs = a;
  }

  const cols = Math.min(12, months.length);
  const rows = Math.max(1, Math.ceil(months.length / cols));
  const gap = 3;
  const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (h - pad * 2 - gap * (rows - 1) - 14) / rows;

  for (let i = 0; i < months.length; i++) {
    const m = months[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + gap);
    const y = pad + row * (cellH + gap);
    const t = Math.min(1, Math.abs(m.netPnl) / maxAbs);
    const alpha = 0.18 + t * 0.72;
    ctx.fillStyle =
      m.netPnl >= 0
        ? `rgba(23, 201, 100, ${alpha})`
        : `rgba(243, 18, 96, ${alpha})`;
    roundRect(ctx, x, y, cellW, cellH, 4);
    ctx.fill();

    ctx.fillStyle = theme.text;
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = m.key.slice(2); // YY-MM
    ctx.fillText(label, x + cellW / 2, y + cellH / 2 - 6);
    ctx.fillStyle = theme.muted;
    ctx.font = '8px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(fmtAxis(m.netPnl), x + cellW / 2, y + cellH / 2 + 7);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = theme.muted;
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`${months.length} months`, pad, h - 4);
}

/** Win vs loss hold-time histograms side by side. */
export function drawHoldCompare(
  canvas: HTMLCanvasElement,
  winSec: Float64Array,
  lossSec: Float64Array,
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 140);
  if (!g) return;
  const { ctx, w, h, pad } = g;
  const mid = w / 2;
  drawHalfHist(ctx, winSec, pad, mid - 4, h, pad, theme.winSoft, 'Wins');
  drawHalfHist(ctx, lossSec, mid + 4, w - pad, h, pad, theme.lossSoft, 'Losses');
}

function drawHalfHist(
  ctx: CanvasRenderingContext2D,
  values: Float64Array,
  x0: number,
  x1: number,
  h: number,
  pad: number,
  color: string,
  title: string,
): void {
  const theme = readAnalyticsChartTheme();
  const width = x1 - x0;
  ctx.fillStyle = theme.muted;
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${title} n=${values.length}`, x0, 12);

  if (values.length === 0) return;
  let max = 1e-9;
  for (let i = 0; i < values.length; i++) {
    if (values[i]! > max) max = values[i]!;
  }
  // Cap display at 95th-ish via max; use hours on axis
  const bins = 12;
  const counts = new Uint32Array(bins);
  for (let i = 0; i < values.length; i++) {
    let b = Math.floor((values[i]! / max) * bins);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    counts[b]!++;
  }
  let peak = 1;
  for (let i = 0; i < bins; i++) if (counts[i]! > peak) peak = counts[i]!;
  const bw = width / bins;
  const top = pad + 10;
  const plotH = h - top - pad;
  ctx.fillStyle = color;
  for (let i = 0; i < bins; i++) {
    const bh = (counts[i]! / peak) * plotH;
    ctx.fillRect(x0 + i * bw + 0.5, h - pad - bh, Math.max(1, bw - 1), bh);
  }
  ctx.fillStyle = theme.muted;
  ctx.font = '8px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fmtDur(0), x0, h - 2);
  ctx.textAlign = 'right';
  ctx.fillText(fmtDur(max), x1, h - 2);
}

/** Horizontal streak run visualization (signed run lengths). */
export function drawStreakStrip(
  canvas: HTMLCanvasElement,
  runs: Int16Array,
  meta: { maxWin: number; maxLoss: number; current: number },
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 120);
  if (!g) return;
  const { ctx, w, h, pad } = g;

  ctx.fillStyle = theme.muted;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Max W ${meta.maxWin} · Max L ${meta.maxLoss} · Now ${
      meta.current > 0 ? `+${meta.current}` : meta.current
    }`,
    pad,
    14,
  );

  if (runs.length === 0) return;
  let maxAbs = 1;
  for (let i = 0; i < runs.length; i++) {
    const a = Math.abs(runs[i]!);
    if (a > maxAbs) maxAbs = a;
  }
  const mid = pad + (h - pad * 2) * 0.55;
  const bw = (w - pad * 2) / runs.length;
  ctx.strokeStyle = theme.zero;
  ctx.beginPath();
  ctx.moveTo(pad, mid);
  ctx.lineTo(w - pad, mid);
  ctx.stroke();

  for (let i = 0; i < runs.length; i++) {
    const v = runs[i]!;
    const bh = (Math.abs(v) / maxAbs) * (h - pad * 2 - 20) * 0.85;
    const x = pad + i * bw + 0.5;
    ctx.fillStyle = v >= 0 ? theme.winSoft : theme.lossSoft;
    if (v >= 0) ctx.fillRect(x, mid - bh, Math.max(1.5, bw - 1), bh);
    else ctx.fillRect(x, mid, Math.max(1.5, bw - 1), bh);
  }
}

export function hitMonthCell(
  canvas: HTMLCanvasElement,
  months: readonly MonthCell[],
  clientX: number,
  clientY: number,
): MonthCell | null {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  const pad = h < 140 ? 18 : 22;
  if (months.length === 0) return null;
  const cols = Math.min(12, months.length);
  const rows = Math.max(1, Math.ceil(months.length / cols));
  const gap = 3;
  const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (h - pad * 2 - gap * (rows - 1) - 14) / rows;
  for (let i = 0; i < months.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = pad + col * (cellW + gap);
    const cy = pad + row * (cellH + gap);
    if (x >= cx && x <= cx + cellW && y >= cy && y <= cy + cellH) {
      return months[i]!;
    }
  }
  return null;
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(0)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
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
