/** Canvas equity + underwater charts — bright, anti-aliased, with grid/axes. */

import {
  drawGrid,
  fmtAxis,
  prepCanvas,
  readAnalyticsChartTheme,
  type AnalyticsChartTheme,
} from './chartTheme';

export function drawEquityChart(
  canvas: HTMLCanvasElement,
  t: Float64Array,
  e: Float64Array,
  _dd: Float64Array,
  _colors?: { line: string; dd: string; grid: string; text: string },
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 200);
  if (!g || e.length < 2) return;
  const { ctx, w, h, pad } = g;

  let minE = Infinity;
  let maxE = -Infinity;
  for (let i = 0; i < e.length; i++) {
    if (e[i]! < minE) minE = e[i]!;
    if (e[i]! > maxE) maxE = e[i]!;
  }
  const span = Math.max(1e-9, maxE - minE);
  const padY = span * 0.08;
  minE -= padY;
  maxE += padY;
  const ySpan = maxE - minE;

  drawGrid(ctx, w, h, pad, theme, 4, 0);

  const xAt = (i: number) => pad + (i / (e.length - 1)) * (w - pad * 2);
  const yAt = (v: number) => pad + (1 - (v - minE) / ySpan) * (h - pad * 2);

  // Area under equity
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(e[0]!));
  for (let i = 1; i < e.length; i++) ctx.lineTo(xAt(i), yAt(e[i]!));
  ctx.lineTo(xAt(e.length - 1), h - pad);
  ctx.lineTo(xAt(0), h - pad);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
  grad.addColorStop(0, theme.fillStrong);
  grad.addColorStop(1, 'rgba(96, 165, 250, 0.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Bright line
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(e[0]!));
  for (let i = 1; i < e.length; i++) ctx.lineTo(xAt(i), yAt(e[i]!));
  ctx.stroke();

  // End tip
  ctx.fillStyle = theme.line;
  ctx.beginPath();
  ctx.arc(xAt(e.length - 1), yAt(e[e.length - 1]!), 3.5, 0, Math.PI * 2);
  ctx.fill();

  drawYLabels(ctx, theme, pad, h, minE, maxE);
  ctx.fillStyle = theme.muted;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${e.length} pts`, pad, 14);
  if (t.length >= 2) {
    ctx.textAlign = 'right';
    ctx.fillText(fmtDate(t[0]!), w - pad, h - 6);
    ctx.fillText(fmtDate(t[t.length - 1]!), w - pad, 14);
  }
}

export function drawUnderwater(
  canvas: HTMLCanvasElement,
  ddPct: Float64Array,
  _colors?: { fill: string; line: string; text: string },
): void {
  const theme = readAnalyticsChartTheme();
  const g = prepCanvas(canvas, 180);
  if (!g || ddPct.length < 2) return;
  const { ctx, w, h, pad } = g;

  let min = 0;
  for (let i = 0; i < ddPct.length; i++) {
    if (ddPct[i]! < min) min = ddPct[i]!;
  }
  // ddPct is ≤ 0; show 0 at top, deepest at bottom
  const span = Math.max(1e-9, -min) * 1.08;
  drawGrid(ctx, w, h, pad, theme, 4, 0);

  const xAt = (i: number) => pad + (i / (ddPct.length - 1)) * (w - pad * 2);
  const yAt = (v: number) => pad + (-v / span) * (h - pad * 2);

  ctx.beginPath();
  ctx.moveTo(xAt(0), pad);
  for (let i = 0; i < ddPct.length; i++) ctx.lineTo(xAt(i), yAt(ddPct[i]!));
  ctx.lineTo(xAt(ddPct.length - 1), pad);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
  grad.addColorStop(0, 'rgba(243, 18, 96, 0.08)');
  grad.addColorStop(1, theme.lossSoft);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = theme.loss;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(ddPct[0]!));
  for (let i = 1; i < ddPct.length; i++) ctx.lineTo(xAt(i), yAt(ddPct[i]!));
  ctx.stroke();

  // Zero baseline
  ctx.strokeStyle = theme.zero;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(w - pad, pad);
  ctx.stroke();

  drawYLabels(ctx, theme, pad, h, 0, min * 1.08, (v) => `${(v * 100).toFixed(1)}%`);
}

function drawYLabels(
  ctx: CanvasRenderingContext2D,
  theme: AnalyticsChartTheme,
  pad: number,
  h: number,
  min: number,
  max: number,
  format: (v: number) => string = fmtAxis,
): void {
  ctx.fillStyle = theme.muted;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = max - (i / 4) * (max - min);
    const y = pad + (i / 4) * (h - pad * 2);
    ctx.fillText(format(v), pad - 4, y);
  }
}

function fmtDate(sec: number): string {
  try {
    return new Date(sec * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}
