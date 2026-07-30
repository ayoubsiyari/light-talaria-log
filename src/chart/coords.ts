/**
 * Convert pointer client coords → media (CSS layout) coords used by scales/paint.
 * Corrects CSS size vs layout size drift (DPR, % sizing, subpixels).
 */
export function clientToMedia(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  mediaWidth: number,
  mediaHeight: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: ((clientX - rect.left) / rect.width) * mediaWidth,
    y: ((clientY - rect.top) / rect.height) * mediaHeight,
  };
}
