import type { DrawingStyle } from '../drawingStyle';
import { applyFillStyle, applyStrokeStyle } from '../drawingStyle';
import type { PaintCtx } from './coords';

export interface CalloutBubbleLayout {
  /** Bubble top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Point on bubble edge where leader attaches. */
  tipX: number;
  tipY: number;
}

/** Layout a callout bubble at the text anchor, facing the leader origin. */
export function layoutCalloutBubble(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  anchorX: number,
  anchorY: number,
  text: string,
  fontSize: number,
): CalloutBubbleLayout {
  const padX = 8;
  const padY = 6;
  const weight = '';
  ctx.save();
  ctx.font = `${weight}${fontSize}px sans-serif`;
  const tw = Math.max(24, ctx.measureText(text).width);
  ctx.restore();
  const w = tw + padX * 2;
  const h = fontSize + padY * 2;

  // Place bubble so its center is at anchor; nudge away from origin slightly.
  let x = anchorX - w / 2;
  let y = anchorY - h / 2;
  const dx = anchorX - originX;
  const dy = anchorY - originY;
  if (Math.abs(dx) > Math.abs(dy)) {
    x = dx >= 0 ? anchorX + 4 : anchorX - w - 4;
    y = anchorY - h / 2;
  } else {
    x = anchorX - w / 2;
    y = dy >= 0 ? anchorY + 4 : anchorY - h - 4;
  }

  // Attachment on nearest edge toward origin.
  let tipX = x + w / 2;
  let tipY = y + h / 2;
  if (originX < x) tipX = x;
  else if (originX > x + w) tipX = x + w;
  if (originY < y) tipY = y;
  else if (originY > y + h) tipY = y + h;

  return { x, y, w, h, tipX, tipY };
}

export function drawCalloutBubble(
  pc: PaintCtx,
  originX: number,
  originY: number,
  anchorX: number,
  anchorY: number,
  text: string,
  style: DrawingStyle,
): CalloutBubbleLayout {
  const { ctx } = pc;
  const layout = layoutCalloutBubble(
    ctx,
    originX,
    originY,
    anchorX,
    anchorY,
    text,
    style.fontSize,
  );

  // Leader to bubble edge
  ctx.save();
  applyStrokeStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(layout.tipX, layout.tipY);
  ctx.stroke();

  // Bubble body
  if (style.fill) {
    applyFillStyle(ctx, style);
  } else {
    ctx.fillStyle = pc.colors.labelBg;
    ctx.globalAlpha = 0.92;
  }
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.setLineDash([]);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(layout.x, layout.y, layout.w, layout.h, 5);
  } else {
    ctx.rect(layout.x, layout.y, layout.w, layout.h);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
  applyStrokeStyle(ctx, style);
  ctx.stroke();

  const tc =
    style.textColor === '#D1D4DC' || !style.textColor
      ? pc.colors.text
      : style.textColor;
  ctx.fillStyle = tc || style.color;
  ctx.font = `${style.textBold ? 'bold ' : ''}${style.fontSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, layout.x + 8, layout.y + layout.h / 2);
  ctx.restore();

  return layout;
}

export function hitCalloutBubble(
  x: number,
  y: number,
  layout: CalloutBubbleLayout,
  hitPx: number,
): boolean {
  return (
    x >= layout.x - hitPx &&
    x <= layout.x + layout.w + hitPx &&
    y >= layout.y - hitPx &&
    y <= layout.y + layout.h + hitPx
  );
}
