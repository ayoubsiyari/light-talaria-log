/** Hit-testing helpers for analytics canvases (pad-aware). */

function padFor(h: number): number {
  return h < 140 ? 18 : h < 180 ? 22 : 28;
}

export function canvasLocal(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number; w: number; h: number; pad: number } {
  const rect = canvas.getBoundingClientRect();
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
    w,
    h,
    pad: padFor(h),
  };
}

/** Map x → series index for a line chart with n points. */
export function hitSeriesIndex(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  n: number,
): number | null {
  if (n < 2) return null;
  const { x, y, w, h, pad } = canvasLocal(canvas, clientX, clientY);
  if (x < pad || x > w - pad || y < pad || y > h - pad) return null;
  const t = (x - pad) / Math.max(1e-9, w - pad * 2);
  return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
}

/** Nearest scatter point within radius (px). */
export function hitScatterNearest(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  xs: Float64Array,
  ys: Float64Array,
  radiusPx = 10,
): number | null {
  if (xs.length === 0) return null;
  const { x, y, w, h, pad } = canvasLocal(canvas, clientX, clientY);
  let maxX = 1e-9;
  let maxY = 1e-9;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i]! > maxX) maxX = xs[i]!;
    if (ys[i]! > maxY) maxY = ys[i]!;
  }
  maxX *= 1.05;
  maxY *= 1.05;
  let best = -1;
  let bestD = radiusPx * radiusPx;
  for (let i = 0; i < xs.length; i++) {
    const px = pad + (xs[i]! / maxX) * (w - pad * 2);
    const py = h - pad - (ys[i]! / maxY) * (h - pad * 2);
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

/** Bar index for equal-width vertical bars. */
export function hitBarIndex(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  n: number,
): number | null {
  if (n <= 0) return null;
  const { x, y, w, h, pad } = canvasLocal(canvas, clientX, clientY);
  if (x < pad || x > w - pad || y < pad || y > h - pad) return null;
  const t = (x - pad) / Math.max(1e-9, w - pad * 2);
  return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
}

export interface TooltipState {
  x: number;
  y: number;
  lines: string[];
}
