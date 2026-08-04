/** Canvas equity + underwater chart (§4 charts 1–2). */

export function drawEquityChart(
  canvas: HTMLCanvasElement,
  t: Float64Array,
  e: Float64Array,
  dd: Float64Array,
  colors: { line: string; dd: string; grid: string; text: string },
): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 160;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx || t.length < 2) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  let minE = Infinity;
  let maxE = -Infinity;
  for (let i = 0; i < e.length; i++) {
    if (e[i]! < minE) minE = e[i]!;
    if (e[i]! > maxE) maxE = e[i]!;
  }
  const span = Math.max(1e-9, maxE - minE);
  const pad = 8;

  // DD shading
  ctx.beginPath();
  for (let i = 0; i < t.length; i++) {
    const x = pad + (i / (t.length - 1)) * (w - pad * 2);
    const yEq = pad + (1 - (e[i]! - minE) / span) * (h - pad * 2);
    const peakY = yEq + dd[i]! * (h - pad * 2); // dd is negative fraction
    if (i === 0) ctx.moveTo(x, yEq);
    else ctx.lineTo(x, yEq);
    void peakY;
  }
  // Fill underwater between equity and peak line approximation
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < e.length; i++) {
    const x = pad + (i / (e.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (e[i]! - minE) / span) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // DD area under equity when in drawdown
  ctx.fillStyle = colors.dd;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < e.length; i++) {
    const x = pad + (i / (e.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (e[i]! - minE) / span) * (h - pad * 2);
    if (dd[i]! < -1e-6) {
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    } else if (started) {
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      started = false;
    }
  }
  if (started) {
    const x = pad + (w - pad * 2);
    ctx.lineTo(x, h - pad);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = colors.text;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`n=${e.length}`, pad, 12);
}
