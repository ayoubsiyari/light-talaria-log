/** Lightweight canvas charts for analytics (no chart lib). */

import {
  drawGrid,
  fmtAxis,
  prepCanvas,
  readAnalyticsChartTheme,
} from './chartTheme';

export { drawUnderwater } from './drawEquity';

export function drawHistogram(
  canvas: HTMLCanvasElement,
  values: Float64Array,
  _colors?: { bar: string; text: string; grid: string },
  opts?: { bins?: number; nLabel?: number; diverging?: boolean },
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 180);
  if (!g || values.length === 0) return;
  const { ctx, w, h, pad } = g;

  let min = Infinity;
  let max = -Infinity;
  let finite = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    finite++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!finite) return;

  const bins = opts?.bins ?? 36;
  const counts = new Uint32Array(bins);
  // Symmetric around 0 when diverging and range crosses 0
  let lo = min;
  let hi = max;
  if (opts?.diverging && lo < 0 && hi > 0) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    lo = -m;
    hi = m;
  }
  const span = Math.max(1e-9, hi - lo);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    let b = Math.floor(((v - lo) / span) * bins);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    counts[b]!++;
  }
  let peak = 1;
  for (let i = 0; i < bins; i++) if (counts[i]! > peak) peak = counts[i]!;

  drawGrid(ctx, w, h, pad, theme, 4, 0);
  const bw = (w - pad * 2) / bins;
  const zeroX = pad + ((0 - lo) / span) * (w - pad * 2);

  for (let i = 0; i < bins; i++) {
    const bh = (counts[i]! / peak) * (h - pad * 2);
    const mid = lo + ((i + 0.5) / bins) * span;
    ctx.fillStyle = mid >= 0 ? theme.winSoft : theme.lossSoft;
    ctx.fillRect(pad + i * bw + 0.5, h - pad - bh, Math.max(1.5, bw - 1), bh);
  }

  if (lo < 0 && hi > 0) {
    ctx.strokeStyle = theme.zero;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zeroX, pad);
    ctx.lineTo(zeroX, h - pad);
    ctx.stroke();
  }

  ctx.fillStyle = theme.muted;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`n=${opts?.nLabel ?? finite}`, pad, 14);
  ctx.textAlign = 'center';
  ctx.fillText(fmtAxis(lo), pad + 10, h - 8);
  ctx.fillText(fmtAxis(hi), w - pad - 10, h - 8);
  ctx.fillText('0', zeroX, h - 8);
}

export function drawScatter(
  canvas: HTMLCanvasElement,
  xs: Float64Array,
  ys: Float64Array,
  outcome: Uint8Array,
  _colors?: { win: string; loss: string; text: string },
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 220);
  if (!g || xs.length === 0) return;
  const { ctx, w, h, pad } = g;

  let maxX = 1e-9;
  let maxY = 1e-9;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i]! > maxX) maxX = xs[i]!;
    if (ys[i]! > maxY) maxY = ys[i]!;
  }
  maxX *= 1.05;
  maxY *= 1.05;

  drawGrid(ctx, w, h, pad, theme, 4, 4);

  // MAE=MFE diagonal
  ctx.strokeStyle = theme.axis;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(pad + (w - pad * 2), pad);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < xs.length; i++) {
    const x = pad + (xs[i]! / maxX) * (w - pad * 2);
    const y = h - pad - (ys[i]! / maxY) * (h - pad * 2);
    ctx.fillStyle = outcome[i] === 1 ? theme.win : theme.loss;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = theme.muted;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MAE (R) →', pad, h - 8);
  ctx.save();
  ctx.translate(12, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('MFE (R) →', 0, 0);
  ctx.restore();
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.win;
  ctx.fillText('Win', w - pad, 14);
  ctx.fillStyle = theme.loss;
  ctx.fillText('Loss', w - pad, 28);
}

export function drawBars(
  canvas: HTMLCanvasElement,
  values: Float64Array,
  labels: string[],
  _colors?: { pos: string; neg: string; text: string },
  opts?: { title?: string },
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 180);
  if (!g || values.length === 0) return;
  const { ctx, w, h, pad } = g;

  let maxAbs = 1e-9;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]!);
    if (a > maxAbs) maxAbs = a;
  }

  drawGrid(ctx, w, h, pad, theme, 4, 0);
  const n = values.length;
  const bw = (w - pad * 2) / n;
  const mid = pad + (h - pad * 2) / 2;

  ctx.strokeStyle = theme.zero;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, mid);
  ctx.lineTo(w - pad, mid);
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    const bh = (Math.abs(v) / maxAbs) * (h / 2 - pad - 4);
    ctx.fillStyle = v >= 0 ? theme.winSoft : theme.lossSoft;
    const x = pad + i * bw + Math.max(1, bw * 0.12);
    const barW = Math.max(2, bw * 0.76);
    if (v >= 0) ctx.fillRect(x, mid - bh, barW, bh);
    else ctx.fillRect(x, mid, barW, bh);
  }

  ctx.fillStyle = theme.muted;
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const lab = labels[i];
    if (lab) ctx.fillText(lab, pad + i * bw + bw / 2, h - 8);
  }
  if (opts?.title) {
    ctx.textAlign = 'left';
    ctx.fillText(opts.title, pad, 14);
  }
}

/** Horizontal ranking bars (symbol / exit reason). */
export function drawHBars(
  canvas: HTMLCanvasElement,
  values: Float64Array,
  labels: string[],
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, Math.max(140, labels.length * 28 + 40));
  if (!g || values.length === 0) return;
  const { ctx, w, h, pad } = g;

  let maxAbs = 1e-9;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]!);
    if (a > maxAbs) maxAbs = a;
  }

  const n = values.length;
  const rowH = (h - pad * 2) / Math.max(1, n);
  const zeroX = pad + (w - pad * 2) * 0.45;
  const maxBar = w - pad - zeroX - 8;

  ctx.strokeStyle = theme.zero;
  ctx.beginPath();
  ctx.moveTo(zeroX, pad);
  ctx.lineTo(zeroX, h - pad);
  ctx.stroke();

  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    const y = pad + i * rowH + rowH * 0.2;
    const bh = rowH * 0.55;
    const bw = (Math.abs(v) / maxAbs) * maxBar;
    ctx.fillStyle = v >= 0 ? theme.winSoft : theme.lossSoft;
    if (v >= 0) ctx.fillRect(zeroX, y, bw, bh);
    else ctx.fillRect(zeroX - bw, y, bw, bh);

    ctx.fillStyle = theme.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i] ?? '', zeroX - 8, y + bh / 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.muted;
    ctx.fillText(fmtAxis(v), (v >= 0 ? zeroX + bw : zeroX - bw) + 4, y + bh / 2);
  }
}

/** Cumulative line (e.g. cum R). */
export function drawLineSeries(
  canvas: HTMLCanvasElement,
  values: Float64Array,
  opts?: { zeroLine?: boolean },
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 180);
  if (!g || values.length < 2) return;
  const { ctx, w, h, pad } = g;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (opts?.zeroLine !== false) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  const padY = Math.max(1e-9, max - min) * 0.08;
  min -= padY;
  max += padY;
  const span = max - min;

  drawGrid(ctx, w, h, pad, theme, 4, 0);
  const xAt = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const yAt = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);

  if (opts?.zeroLine !== false && min < 0 && max > 0) {
    ctx.strokeStyle = theme.zero;
    ctx.beginPath();
    ctx.moveTo(pad, yAt(0));
    ctx.lineTo(w - pad, yAt(0));
    ctx.stroke();
  }

  // Fill to zero
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(0));
  ctx.lineTo(xAt(0), yAt(values[0]!));
  for (let i = 1; i < values.length; i++) ctx.lineTo(xAt(i), yAt(values[i]!));
  ctx.lineTo(xAt(values.length - 1), yAt(0));
  ctx.closePath();
  ctx.fillStyle = values[values.length - 1]! >= 0 ? theme.fill : theme.lossSoft;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = values[values.length - 1]! >= 0 ? theme.line : theme.loss;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(values[0]!));
  for (let i = 1; i < values.length; i++) ctx.lineTo(xAt(i), yAt(values[i]!));
  ctx.stroke();

  ctx.fillStyle = theme.muted;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(fmtAxis(max), pad, 14);
  ctx.fillText(fmtAxis(min), pad, h - 8);
}

/** Simple win-rate rolling line from 0–1 values. */
export function drawRollingLine(
  canvas: HTMLCanvasElement,
  values: Float64Array,
  baseline = 0.5,
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 160);
  if (!g || values.length < 2) return;
  const { ctx, w, h, pad } = g;
  drawGrid(ctx, w, h, pad, theme, 4, 0);

  const xAt = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const yAt = (v: number) => pad + (1 - v) * (h - pad * 2);

  ctx.strokeStyle = theme.zero;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(pad, yAt(baseline));
  ctx.lineTo(w - pad, yAt(baseline));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(values[0]!));
  for (let i = 1; i < values.length; i++) ctx.lineTo(xAt(i), yAt(values[i]!));
  ctx.stroke();

  ctx.fillStyle = theme.muted;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('100%', pad, 14);
  ctx.fillText('0%', pad, h - 8);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(baseline * 100)}%`, w - pad, yAt(baseline) - 4);
}
