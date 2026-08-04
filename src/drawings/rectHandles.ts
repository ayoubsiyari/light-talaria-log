import type { DrawingPoint } from './drawingStore';
import type { DrawingToolId } from './toolRegistry';

/** Synthetic handle indices for axis-aligned 2-point boxes (after corners 0/1). */
export const RECT_EDGE_N = 2;
export const RECT_EDGE_E = 3;
export const RECT_EDGE_S = 4;
export const RECT_EDGE_W = 5;

export function isRectLikeTool(type: DrawingToolId): boolean {
  return (
    type === 'rectangle' ||
    type === 'datePriceRange' ||
    type === 'priceRange' ||
    type === 'dateRange' ||
    type === 'gannBox' ||
    type === 'gannSquare' ||
    type === 'gannSquareFixed'
  );
}

export function isRectEdgeHandle(handleIndex: number): boolean {
  return handleIndex >= RECT_EDGE_N && handleIndex <= RECT_EDGE_W;
}

/** Mid-edge screen positions for an axis-aligned box from two corners. */
export function rectEdgeMidpoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<{ handleIndex: number; x: number; y: number }> {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const mx = (left + right) / 2;
  const my = (top + bottom) / 2;
  return [
    { handleIndex: RECT_EDGE_N, x: mx, y: top },
    { handleIndex: RECT_EDGE_E, x: right, y: my },
    { handleIndex: RECT_EDGE_S, x: mx, y: bottom },
    { handleIndex: RECT_EDGE_W, x: left, y: my },
  ];
}

/**
 * Apply edge drag to a 2-point axis-aligned box.
 * Stored as diagonal corners (left/high) × (right/low) after edit.
 */
export function applyRectEdgeDrag(
  points: readonly DrawingPoint[],
  edgeHandle: number,
  logical: DrawingPoint,
): DrawingPoint[] {
  const a = points[0];
  const b = points[1];
  if (!a || !b) return [...points];

  let left = Math.min(a.time, b.time);
  let right = Math.max(a.time, b.time);
  let lo = Math.min(a.price, b.price);
  let hi = Math.max(a.price, b.price);

  switch (edgeHandle) {
    case RECT_EDGE_N:
      hi = logical.price;
      if (hi < lo) [lo, hi] = [hi, lo];
      break;
    case RECT_EDGE_S:
      lo = logical.price;
      if (hi < lo) [lo, hi] = [hi, lo];
      break;
    case RECT_EDGE_W:
      left = logical.time;
      if (right < left) [left, right] = [right, left];
      break;
    case RECT_EDGE_E:
      right = logical.time;
      if (right < left) [left, right] = [right, left];
      break;
    default:
      return [...points];
  }

  return [
    { time: left, price: hi },
    { time: right, price: lo },
  ];
}
