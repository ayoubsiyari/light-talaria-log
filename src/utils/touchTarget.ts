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
 * Fat invisible stroke (~Talaria max(16, stroke*5)) so lines are easy to grab.
 */
export function drawingHitPx(strokeWidth = 1): number {
  const fat = Math.max(16, strokeWidth * 5);
  return isCoarsePointer() ? Math.max(24, fat) : fat;
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
