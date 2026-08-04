import { logicalIndexAtTime } from '@/data/timeframeAgg';
import { indexToX, priceToY, type PlotRect, type PriceScale } from '@/chart/scales';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { drawingHandleHitPx, drawingHitPx } from '@/utils/touchTarget';
import type { Drawing, DrawingPoint } from './drawingStore';
import {
  defaultFibLevelsFor,
  resolveFibMeta,
  visibleFibLevels,
} from './fibLevels';
import { extendLine, type LineExtendPaint } from './paint/coords';
import { extendModeToPaint } from './drawingStyle';
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

function nearSeg(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hitPx: number,
): boolean {
  return distToSegment(x, y, x0, y0, x1, y1) <= hitPx;
}

function nearExtended(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: PlotRect,
  mode: LineExtendPaint,
  hitPx: number,
): boolean {
  const e = extendLine(x0, y0, x1, y1, plot, mode);
  return nearSeg(x, y, e.x0, e.y0, e.x1, e.y1, hitPx);
}

function nearBoxEdge(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hitPx: number,
): boolean {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return (
    (x >= left - hitPx &&
      x <= right + hitPx &&
      (Math.abs(y - top) <= hitPx || Math.abs(y - bottom) <= hitPx)) ||
    (y >= top - hitPx &&
      y <= bottom + hitPx &&
      (Math.abs(x - left) <= hitPx || Math.abs(x - right) <= hitPx))
  );
}

function nearPolySegments(
  x: number,
  y: number,
  pts: Array<{ x: number; y: number }>,
  hitPx: number,
  closed = false,
): boolean {
  for (let s = 0; s < pts.length - 1; s++) {
    if (nearSeg(x, y, pts[s]!.x, pts[s]!.y, pts[s + 1]!.x, pts[s + 1]!.y, hitPx)) {
      return true;
    }
  }
  if (closed && pts.length >= 3) {
    const a = pts[pts.length - 1]!;
    const b = pts[0]!;
    if (nearSeg(x, y, a.x, a.y, b.x, b.y, hitPx)) return true;
  }
  return false;
}

/** Hit painted geometry for one drawing (handles checked by caller). */
function hitPaintedBody(
  x: number,
  y: number,
  d: Drawing,
  pts: Array<{ x: number; y: number }>,
  plot: PlotRect,
  priceScale: PriceScale,
  hitPx: number,
): boolean {
  const type = d.type;

  if (type === 'hline' && pts[0]) {
    return Math.abs(y - pts[0].y) <= hitPx;
  }
  if (type === 'vline' && pts[0]) {
    return Math.abs(x - pts[0].x) <= hitPx;
  }
  if (type === 'crossLine' && pts[0]) {
    return Math.abs(y - pts[0].y) <= hitPx || Math.abs(x - pts[0].x) <= hitPx;
  }

  if (
    (type === 'ray' || type === 'horizontalRay' || type === 'extendedLine') &&
    pts.length >= 2
  ) {
    const a = pts[0]!;
    const b = pts[1]!;
    if (type === 'horizontalRay') {
      return nearExtended(x, y, a.x, a.y, b.x, a.y, plot, 'ray', hitPx);
    }
    const ext = extendModeToPaint(
      d.style.extend ?? (type === 'extendedLine' ? 'both' : 'right'),
    );
    const mode: LineExtendPaint =
      type === 'extendedLine'
        ? ext === 'segment'
          ? 'extended'
          : ext
        : ext === 'segment'
          ? 'ray'
          : ext;
    return nearExtended(x, y, a.x, a.y, b.x, b.y, plot, mode, hitPx);
  }

  if (
    (type === 'trendLine' ||
      type === 'infoLine' ||
      type === 'trendAngle' ||
      type === 'arrow' ||
      type === 'arrowMarker') &&
    pts.length >= 2
  ) {
    const ext = extendModeToPaint(d.style.extend ?? 'none');
    return nearExtended(x, y, pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y, plot, ext, hitPx);
  }

  if ((type === 'parallelChannel' || type === 'flatTopBottom') && pts.length >= 3) {
    const [a, b, c] = pts;
    const dx = b!.x - a!.x;
    const dy = type === 'flatTopBottom' ? 0 : b!.y - a!.y;
    if (nearExtended(x, y, a!.x, a!.y, b!.x, b!.y, plot, 'extended', hitPx)) return true;
    if (
      nearExtended(x, y, c!.x, c!.y, c!.x + dx, c!.y + dy, plot, 'extended', hitPx)
    ) {
      return true;
    }
    // Midline
    const mx0 = (a!.x + c!.x) / 2;
    const my0 = (a!.y + c!.y) / 2;
    if (nearExtended(x, y, mx0, my0, mx0 + dx, my0 + dy, plot, 'extended', hitPx)) {
      return true;
    }
    return false;
  }

  if (type === 'disjointChannel' && pts.length >= 4) {
    return (
      nearExtended(x, y, pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y, plot, 'extended', hitPx) ||
      nearExtended(x, y, pts[2]!.x, pts[2]!.y, pts[3]!.x, pts[3]!.y, plot, 'extended', hitPx)
    );
  }

  if (
    (type === 'fibRetracement' || type === 'fibExtension') &&
    pts.length >= 2 &&
    d.points[0] &&
    d.points[1]
  ) {
    const fib = resolveFibMeta(type, d.meta);
    const levels = visibleFibLevels(fib.levels);
    const p2 = d.points[2];
    const priceA = d.points[0].price;
    const priceB =
      p2 && type === 'fibExtension' ? p2.price : d.points[1].price;
    const lo = Math.min(priceA, priceB);
    const hi = Math.max(priceA, priceB);
    const segL = Math.min(pts[0]!.x, pts[1]!.x);
    const segR = Math.max(pts[0]!.x, pts[1]!.x);
    const left = fib.extendLeft ? plot.left : segL;
    const right = fib.extendRight ? plot.left + plot.width : segR;
    for (const lv of levels) {
      const t = fib.reverse ? 1 - lv.coeff : lv.coeff;
      const price = hi - (hi - lo) * t;
      const ly = priceToY(price, priceScale, plot);
      if (nearSeg(x, y, left, ly, right, ly, hitPx)) return true;
    }
    // Trend anchors diagonal
    return nearSeg(x, y, pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y, hitPx);
  }

  if (
    (type === 'fibTimezone' || type === 'fibTrendTime' || type === 'cyclicLines') &&
    pts.length >= 2
  ) {
    const levels = visibleFibLevels(
      resolveFibMeta(type, d.meta).levels.length
        ? resolveFibMeta(type, d.meta).levels
        : defaultFibLevelsFor(type),
    );
    const span = Math.abs(pts[1]!.x - pts[0]!.x) || 1;
    const x0 = pts[0]!.x;
    const top = plot.top;
    const bottom = plot.top + plot.height;
    for (const lv of levels) {
      const lx = x0 + lv.coeff * span * Math.sign(pts[1]!.x - pts[0]!.x || 1);
      if (nearSeg(x, y, lx, top, lx, bottom, hitPx)) return true;
    }
    return false;
  }

  if (
    (type === 'fibSpeedFan' || type === 'fibFan' || type === 'gannFan') &&
    pts.length >= 2
  ) {
    const levels = visibleFibLevels(resolveFibMeta(type, d.meta).levels);
    const a = pts[0]!;
    const b = pts[1]!;
    for (const lv of levels) {
      const t = Math.max(0.01, lv.coeff);
      const x1 = a.x + (b.x - a.x);
      const y1 = a.y + (b.y - a.y) * t;
      if (nearExtended(x, y, a.x, a.y, x1, y1, plot, 'ray', hitPx)) return true;
    }
    return nearSeg(x, y, a.x, a.y, b.x, b.y, hitPx);
  }

  if ((type === 'longPosition' || type === 'shortPosition') && pts.length >= 3) {
    const entry = pts[0]!;
    const stop = pts[1]!;
    const target = pts[2]!;
    const left = Math.min(entry.x, stop.x, target.x);
    const right = Math.max(entry.x, stop.x, target.x) + 40;
    if (nearSeg(x, y, left, entry.y, right, entry.y, hitPx)) return true;
    if (nearSeg(x, y, left, stop.y, right, stop.y, hitPx)) return true;
    if (nearSeg(x, y, left, target.y, right, target.y, hitPx)) return true;
    // Interior of risk/reward boxes (easy grab)
    const minY = Math.min(entry.y, stop.y, target.y);
    const maxY = Math.max(entry.y, stop.y, target.y);
    if (x >= left && x <= right && y >= minY && y <= maxY) return true;
    return false;
  }

  if (
    pts.length >= 2 &&
    (type === 'rectangle' ||
      type === 'datePriceRange' ||
      type === 'priceRange' ||
      type === 'dateRange' ||
      type === 'gannBox' ||
      type === 'gannSquare' ||
      type === 'gannSquareFixed' ||
      type === 'ellipse' ||
      type === 'circle')
  ) {
    if (nearBoxEdge(x, y, pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y, hitPx)) {
      return true;
    }
  }

  if (type === 'brush' || type === 'highlighter' || type === 'path' || type === 'polyline') {
    return nearPolySegments(x, y, pts, hitPx, type === 'polyline');
  }

  if (pts.length === 1) {
    return Math.hypot(x - pts[0]!.x, y - pts[0]!.y) <= hitPx * 1.5;
  }

  return nearPolySegments(x, y, pts, hitPx, false);
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
    // Axis / specialty tools: cursor matches the grab axis
    if (drawing.type === 'hline' || drawing.type === 'horizontalRay') {
      return 'ns-resize';
    }
    if (drawing.type === 'vline') return 'ew-resize';
    if (
      drawing.type === 'fibRetracement' ||
      drawing.type === 'fibExtension' ||
      drawing.type === 'parallelChannel' ||
      drawing.type === 'flatTopBottom' ||
      drawing.type === 'disjointChannel' ||
      drawing.type === 'rectangle' ||
      drawing.type === 'longPosition' ||
      drawing.type === 'shortPosition'
    ) {
      return opts?.dragging ? 'grabbing' : 'move';
    }
    return opts?.dragging ? 'grabbing' : 'move';
  }

  if (drawing.type === 'hline') return 'ns-resize';
  if (drawing.type === 'vline') return 'ew-resize';
  if (drawing.type === 'crossLine') return 'move';

  const pts: Array<{ x: number; y: number }> = [];
  for (const p of drawing.points) {
    const xy = toXY(p, bars, range, plot, priceScale);
    if (xy) pts.push(xy);
  }
  const handle = pts[hit.handleIndex];
  if (!handle) return 'pointer';

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
      drawing.type === 'shortPosition' ||
      drawing.type === 'fibRetracement' ||
      drawing.type === 'fibExtension')
  ) {
    const other = pts[hit.handleIndex === 0 ? 1 : 0] ?? pts[0]!;
    const dx = handle.x - other.x;
    const dy = handle.y - other.y;
    if (dx * dy >= 0) return 'nwse-resize';
    return 'nesw-resize';
  }

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
    if (hitPaintedBody(x, y, d, pts, plot, priceScale, HIT_PX)) {
      return { drawingId: d.id, handleIndex: null };
    }
  }
  return null;
}
