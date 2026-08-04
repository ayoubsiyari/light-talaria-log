import { logicalIndexAtTime } from '@/data/timeframeAgg';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '@/chart/scales';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { drawingHandleHitPx, drawingHitPx } from '@/utils/touchTarget';
import type { Drawing, DrawingPoint } from './drawingStore';
import { isDrawingVisibleOnTf } from './visibility';

function toXY(
  p: DrawingPoint,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
): { x: number; y: number } | null {
  if (bars.length === 0) return null;
  const idx = logicalIndexAtTime(bars, p.time);
  return {
    x: indexToX(idx, range, plot),
    y: priceToY(p.price, priceScale, plot),
  };
}

function distToSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

export interface HitResult {
  drawingId: string;
  handleIndex: number | null;
}

/** CSS cursor for hover/drag over a drawing (move body vs resize handle). */
export function cursorForDrawingHit(
  hit: HitResult,
  drawing: Drawing,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  opts?: { dragging?: boolean },
): string {
  if (drawing.locked) return 'not-allowed';

  if (hit.handleIndex == null) {
    return opts?.dragging ? 'grabbing' : 'move';
  }

  // Axis-aligned singles
  if (drawing.type === 'hline') return 'ns-resize';
  if (drawing.type === 'vline') return 'ew-resize';
  if (drawing.type === 'crossLine') {
    // Prefer the nearer axis for the handle (only one point)
    return 'move';
  }

  const pts: Array<{ x: number; y: number }> = [];
  for (const p of drawing.points) {
    const xy = toXY(p, bars, range, plot, priceScale);
    if (xy) pts.push(xy);
  }
  const handle = pts[hit.handleIndex];
  if (!handle) return 'pointer';

  // 2-point boxes / ranges — diagonal resize by corner
  if (
    pts.length >= 2 &&
    (drawing.type === 'rectangle' ||
      drawing.type === 'rotatedRectangle' ||
      drawing.type === 'ellipse' ||
      drawing.type === 'circle' ||
      drawing.type === 'datePriceRange' ||
      drawing.type === 'priceRange' ||
      drawing.type === 'dateRange' ||
      drawing.type === 'gannBox' ||
      drawing.type === 'gannSquare' ||
      drawing.type === 'gannSquareFixed' ||
      drawing.type === 'longPosition' ||
      drawing.type === 'shortPosition')
  ) {
    const other = pts[hit.handleIndex === 0 ? 1 : 0] ?? pts[0]!;
    const dx = handle.x - other.x;
    const dy = handle.y - other.y;
    // Screen Y grows downward — NW/SE vs NE/SW
    if (dx * dy >= 0) return 'nwse-resize';
    return 'nesw-resize';
  }

  // Horizontal-ish vs vertical-ish segment endpoint
  if (pts.length >= 2) {
    const prev = pts[Math.max(0, hit.handleIndex - 1)] ?? handle;
    const next = pts[Math.min(pts.length - 1, hit.handleIndex + 1)] ?? handle;
    const ax = Math.abs(next.x - prev.x);
    const ay = Math.abs(next.y - prev.y);
    if (ax > ay * 2) return 'ew-resize';
    if (ay > ax * 2) return 'ns-resize';
  }

  return 'nwse-resize';
}

/** Topmost drawing / handle under pointer (media coords). */
export function hitTestDrawings(
  x: number,
  y: number,
  drawings: readonly Drawing[],
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  paneTf?: Timeframe | null,
): HitResult | null {
  const HIT_PX = drawingHitPx();
  const HANDLE_PX = drawingHandleHitPx();
  // Reverse so last-drawn is on top
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]!;
    if (!isDrawingVisibleOnTf(d, paneTf)) continue;
    const pts: Array<{ x: number; y: number }> = [];
    for (const p of d.points) {
      const xy = toXY(p, bars, range, plot, priceScale);
      if (xy) pts.push(xy);
    }
    for (let h = 0; h < pts.length; h++) {
      if (Math.hypot(x - pts[h]!.x, y - pts[h]!.y) <= HANDLE_PX) {
        return { drawingId: d.id, handleIndex: h };
      }
    }
    if (pts.length === 1) {
      if (Math.hypot(x - pts[0]!.x, y - pts[0]!.y) <= HIT_PX * 1.5) {
        return { drawingId: d.id, handleIndex: null };
      }
    }
    for (let s = 0; s < pts.length - 1; s++) {
      if (distToSegment(x, y, pts[s]!.x, pts[s]!.y, pts[s + 1]!.x, pts[s + 1]!.y) <= HIT_PX) {
        return { drawingId: d.id, handleIndex: null };
      }
    }
    // Closed / box tools: hit near axis-aligned outline (not only the diagonal)
    if (
      pts.length >= 2 &&
      (d.type === 'rectangle' ||
        d.type === 'datePriceRange' ||
        d.type === 'gannBox' ||
        d.type === 'gannSquare' ||
        d.type === 'gannSquareFixed' ||
        d.type === 'ellipse' ||
        d.type === 'circle')
    ) {
      const x0 = Math.min(pts[0]!.x, pts[1]!.x);
      const x1 = Math.max(pts[0]!.x, pts[1]!.x);
      const y0 = Math.min(pts[0]!.y, pts[1]!.y);
      const y1 = Math.max(pts[0]!.y, pts[1]!.y);
      const nearEdge =
        (x >= x0 - HIT_PX &&
          x <= x1 + HIT_PX &&
          (Math.abs(y - y0) <= HIT_PX || Math.abs(y - y1) <= HIT_PX)) ||
        (y >= y0 - HIT_PX &&
          y <= y1 + HIT_PX &&
          (Math.abs(x - x0) <= HIT_PX || Math.abs(x - x1) <= HIT_PX));
      if (nearEdge) return { drawingId: d.id, handleIndex: null };
    }
    // hline / vline special
    if (d.type === 'hline' && pts[0] && Math.abs(y - pts[0].y) <= HIT_PX) {
      return { drawingId: d.id, handleIndex: null };
    }
    if (d.type === 'vline' && pts[0] && Math.abs(x - pts[0].x) <= HIT_PX) {
      return { drawingId: d.id, handleIndex: null };
    }
    if (d.type === 'crossLine' && pts[0]) {
      if (Math.abs(y - pts[0].y) <= HIT_PX || Math.abs(x - pts[0].x) <= HIT_PX) {
        return { drawingId: d.id, handleIndex: null };
      }
    }
  }
  return null;
}
