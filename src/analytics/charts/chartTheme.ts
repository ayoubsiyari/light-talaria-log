/**
 * Analytics canvas colors — never use raw `--accent` (often dark navy on black).
 * Prefer bright readable series colors with Hero fallbacks.
 */

export interface AnalyticsChartTheme {
  bg: string;
  grid: string;
  axis: string;
  text: string;
  muted: string;
  line: string;
  fill: string;
  fillStrong: string;
  win: string;
  loss: string;
  winSoft: string;
  lossSoft: string;
  zero: string;
}

function css(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function readAnalyticsChartTheme(): AnalyticsChartTheme {
  const win = css('--success', '#17c964');
  const loss = css('--danger', '#f31260');
  const soft = css('--accent-soft-foreground', '#bfdbfe');
  const muted = css('--muted', '#8b95a8');
  const fg = css('--foreground', '#f4f6fb');
  return {
    bg: 'transparent',
    grid: 'rgba(139, 149, 168, 0.18)',
    axis: 'rgba(139, 149, 168, 0.45)',
    text: fg,
    muted,
    line: soft,
    fill: 'rgba(96, 165, 250, 0.22)',
    fillStrong: 'rgba(96, 165, 250, 0.38)',
    win,
    loss,
    winSoft: 'rgba(23, 201, 100, 0.55)',
    lossSoft: 'rgba(243, 18, 96, 0.55)',
    zero: 'rgba(244, 246, 251, 0.35)',
  };
}

export function prepCanvas(
  canvas: HTMLCanvasElement,
  fallbackH = 180,
  opts?: { pad?: number },
): { ctx: CanvasRenderingContext2D; w: number; h: number; pad: number } | null {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const w = Math.max(40, canvas.clientWidth || 320);
  const h = Math.max(40, canvas.clientHeight || fallbackH);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  // Compact pad on short canvases so immersive grids stay readable.
  const autoPad = h < 140 ? 18 : h < 180 ? 22 : 28;
  return { ctx, w, h, pad: opts?.pad ?? autoPad };
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pad: number,
  theme: AnalyticsChartTheme,
  rows = 4,
  cols = 0,
): void {
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  const innerH = h - pad * 2;
  const innerW = w - pad * 2;
  for (let i = 0; i <= rows; i++) {
    const y = pad + (i / rows) * innerH;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + innerW, y);
    ctx.stroke();
  }
  if (cols > 0) {
    for (let i = 0; i <= cols; i++) {
      const x = pad + (i / cols) * innerW;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + innerH);
      ctx.stroke();
    }
  }
}

export function fmtAxis(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
