/** True when the primary input is a finger (phones / many tablets). */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Line / body hit radius for drawings (media px). */
export function drawingHitPx(): number {
  return isCoarsePointer() ? 20 : 12;
}

/** Handle hit radius for drawings (media px). */
export function drawingHandleHitPx(): number {
  return isCoarsePointer() ? 24 : 12;
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
