/** Lightweight canvas charts for analytics (no chart lib). */

function prep(
  canvas: HTMLCanvasElement,
  fallbackH = 160,
): { ctx: CanvasRenderingContext2D; w: number; h: number; pad: number } | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || fallbackH;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, pad: 8 };
}

export function drawUnderwater(
  canvas: HTMLCanvasElement,
  ddPct: Float64Array,
  colors: { fill: string; line: string; text: string },
): void {
  const g = prep(canvas);
  if (!g || ddPct.length < 2) return;
  const { ctx, w, h, pad } = g;
  let min = 0;
  for (let i = 0; i < ddPct.length; i++) {
    if (ddPct[i]! < min) min = ddPct[i]!;
  }
  const span = Math.max(1e-9, -min);
  ctx.fillStyle = colors.fill;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  for (let i = 0; i < ddPct.length; i++) {
    const x = pad + (i / (ddPct.length - 1)) * (w - pad * 2);
    const y = pad + (-ddPct[i]! / span) * (h - pad * 2);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(pad + (w - pad * 2), pad);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < ddPct.length; i++) {
    const x = pad + (i / (ddPct.length - 1)) * (w - pad * 2);
    const y = pad + (-ddPct[i]! / span) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = colors.text;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`n=${ddPct.length}`, pad, 12);
}

export function drawHistogram(
  canvas: HTMLCanvasElement,
  values: Float64Array,
  colors: { bar: string; text: string; grid: string },
  opts?: { bins?: number; nLabel?: number },
): void {
  const g = prep(canvas);
  if (!g || values.length === 0) return;
  const { ctx, w, h, pad } = g;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return;
  const bins = opts?.bins ?? 40;
  const counts = new Uint32Array(bins);
  const span = Math.max(1e-9, max - min);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    let b = Math.floor(((v - min) / span) * bins);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    counts[b]!++;
  }
  let peak = 1;
  for (let i = 0; i < bins; i++) if (counts[i]! > peak) peak = counts[i]!;
  const bw = (w - pad * 2) / bins;
  ctx.fillStyle = colors.bar;
  for (let i = 0; i < bins; i++) {
    const bh = (counts[i]! / peak) * (h - pad * 2);
    ctx.fillRect(pad + i * bw, h - pad - bh, Math.max(1, bw - 1), bh);
  }
  ctx.fillStyle = colors.text;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`n=${opts?.nLabel ?? values.length}`, pad, 12);
}

export function drawScatter(
  canvas: HTMLCanvasElement,
  xs: Float64Array,
  ys: Float64Array,
  outcome: Uint8Array, // 0 loss, 1 win
  colors: { win: string; loss: string; text: string },
): void {
  const g = prep(canvas, 200);
  if (!g || xs.length === 0) return;
  const { ctx, w, h, pad } = g;
  let maxX = 1e-9;
  let maxY = 1e-9;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i]! > maxX) maxX = xs[i]!;
    if (ys[i]! > maxY) maxY = ys[i]!;
  }
  for (let i = 0; i < xs.length; i++) {
    const x = pad + (xs[i]! / maxX) * (w - pad * 2);
    const y = h - pad - (ys[i]! / maxY) * (h - pad * 2);
    ctx.fillStyle = outcome[i] === 1 ? colors.win : colors.loss;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  ctx.fillStyle = colors.text;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`n=${xs.length}  MAE(R)→  MFE(R)↑`, pad, 12);
}

export function drawBars(
  canvas: HTMLCanvasElement,
  values: Float64Array,
  labels: string[],
  colors: { pos: string; neg: string; text: string },
): void {
  const g = prep(canvas);
  if (!g || values.length === 0) return;
  const { ctx, w, h, pad } = g;
  let maxAbs = 1e-9;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]!);
    if (a > maxAbs) maxAbs = a;
  }
  const n = values.length;
  const bw = (w - pad * 2) / n;
  const mid = h / 2;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    const bh = (Math.abs(v) / maxAbs) * (h / 2 - pad);
    ctx.fillStyle = v >= 0 ? colors.pos : colors.neg;
    if (v >= 0) ctx.fillRect(pad + i * bw + 1, mid - bh, Math.max(1, bw - 2), bh);
    else ctx.fillRect(pad + i * bw + 1, mid, Math.max(1, bw - 2), bh);
  }
  ctx.fillStyle = colors.text;
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  for (let i = 0; i < n; i++) {
    const lab = labels[i];
    if (lab) ctx.fillText(lab, pad + i * bw + 2, h - 2);
  }
  ctx.fillText(`n=${n}`, pad, 12);
}
