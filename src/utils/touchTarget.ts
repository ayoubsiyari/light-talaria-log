/** True when the primary input is a finger (phones / many tablets). */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * Line / body hit radius for drawings (media px).
 * Touch stays fat for fat-finger grabs; fine pointer (mouse/trackpad) is
 * tighter so nearby shapes do not magnetically steal chart pan.
 */
export function drawingHitPx(strokeWidth = 1): number {
  if (isCoarsePointer()) {
    return Math.max(24, strokeWidth * 5);
  }
  return Math.max(8, strokeWidth * 3);
}

/** Handle hit radius for drawings (media px). Coarse ≈44px diameter. */
export function drawingHandleHitPx(): number {
  return isCoarsePointer() ? 22 : 14;
}

/** Horizontal order line hit radius (media px). */
export function orderHitPx(): number {
  return isCoarsePointer() ? 16 : 6;
}

/** Painted handle circle radius. */
export function handlePaintRadius(selected: boolean): number {
  if (isCoarsePointer()) return selected ? 7 : 6;
  return selected ? 4.5 : 4;
}
