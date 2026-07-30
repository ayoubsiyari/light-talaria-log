import { applyFillStyle, applyStrokeStyle, type DrawingStyle } from '../drawingStyle';
import { extendLine, type PaintCtx } from './coords';

export function strokeLine(
  pc: PaintCtx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  style: DrawingStyle,
  mode: import('./coords').LineExtendPaint = 'segment',
): void {
  const { ctx } = pc;
  const e = extendLine(x0, y0, x1, y1, pc.plot, mode);
  applyStrokeStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(e.x0, e.y0);
  ctx.lineTo(e.x1, e.y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export function fillPoly(
  pc: PaintCtx,
  pts: Array<{ x: number; y: number }>,
  style: DrawingStyle,
): void {
  if (pts.length < 3 || !style.fill) return;
  const { ctx } = pc;
  applyFillStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function strokePoly(
  pc: PaintCtx,
  pts: Array<{ x: number; y: number }>,
  style: DrawingStyle,
  close = false,
): void {
  if (pts.length < 2) return;
  const { ctx } = pc;
  applyStrokeStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  if (close) ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export type HandleMode = 'selected' | 'hover' | false;

/** TradingView-style white circles with blue ring on select / near-hover. */
export function drawHandles(
  pc: PaintCtx,
  pts: Array<{ x: number; y: number }>,
  mode: HandleMode,
): void {
  if (!mode || pts.length === 0) return;
  const { ctx } = pc;
  const r = mode === 'selected' ? 4.5 : 4;
  const { colors } = pc;
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = mode === 'hover' ? 0.92 : 1;
  for (const p of pts) {
    ctx.fillStyle = colors.handleFill;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = mode === 'selected' ? 1.75 : 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawArrowHead(
  pc: PaintCtx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  style: DrawingStyle,
  size = 10,
): void {
  const { ctx } = pc;
  const angle = Math.atan2(y1 - y0, x1 - x0);
  applyStrokeStyle(ctx, style);
  ctx.fillStyle = style.color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(
    x1 - size * Math.cos(angle - Math.PI / 7),
    y1 - size * Math.sin(angle - Math.PI / 7),
  );
  ctx.lineTo(
    x1 - size * Math.cos(angle + Math.PI / 7),
    y1 - size * Math.sin(angle + Math.PI / 7),
  );
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

export function drawTextLabel(
  pc: PaintCtx,
  x: number,
  y: number,
  text: string,
  style: DrawingStyle,
  bg = true,
): void {
  const { ctx } = pc;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = `${style.fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  const pad = 4;
  const w = ctx.measureText(text).width;
  if (bg) {
    ctx.fillStyle = pc.colors.labelBg;
    ctx.strokeStyle = pc.colors.border;
    ctx.lineWidth = 1;
    const lx = x - pad;
    const ly = y - style.fontSize / 2 - pad;
    const lw = w + pad * 2;
    const lh = style.fontSize + pad * 2;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(lx, ly, lw, lh, 3);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(lx, ly, lw, lh);
    }
  }
  // Prefer theme text when style still has the dark-default placeholder
  const tc =
    style.textColor === '#D1D4DC' || !style.textColor
      ? pc.colors.text
      : style.textColor;
  ctx.fillStyle = tc || style.color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function quadraticPath(
  pts: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (pts.length < 3) return pts;
  const out: Array<{ x: number; y: number }> = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    out.push(p0);
    out.push({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 });
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
