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
import {
  CHANNEL_WIDTH_HANDLE,
  channelWidthHandleXY,
  isChannelTool,
  isChannelWidthHandle,
} from './channelHandles';
import { hitCalloutBubble } from './paint/calloutBubble';
import {
  isRectEdgeHandle,
  isRectLikeTool,
  rectEdgeMidpoints,
} from './rectHandles';
import { asBool } from './toolSettings';
import { isDrawingVisibleOnTf } from './visibility';

/** Approximate text label hit box (no canvas measure on the hot path). */
function nearTextLabel(
  x: number,
  y: number,
  ax: number,
  ay: number,
  text: string,
  fontSize: number,
  alignH: 'left' | 'center' | 'right' | undefined,
  hitPx: number,
): boolean {
  const pad = 4;
  const w = Math.max(fontSize, text.length * fontSize * 0.55) + pad * 2;
  const h = fontSize + pad * 2;
  let left = ax - pad;
  if (alignH === 'center') left = ax - w / 2;
  else if (alignH === 'right') left = ax - w;
  const top = ay - h / 2;
  return (
    x >= left - hitPx &&
    x <= left + w + hitPx &&
    y >= top - hitPx &&
    y <= top + h + hitPx
  );
}

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
    if (asBool(d.meta?.showMidline, true)) {
      const mx0 = (a!.x + c!.x) / 2;
      const my0 = (a!.y + c!.y) / 2;
      if (nearExtended(x, y, mx0, my0, mx0 + dx, my0 + dy, plot, 'extended', hitPx)) {
        return true;
      }
    }
    // Interior of the infinite band (easy grab on fill)
    const abx = dx;
    const aby = dy;
    const len2 = abx * abx + aby * aby;
    if (len2 > 1e-6) {
      const crossA = (x - a!.x) * aby - (y - a!.y) * abx;
      const crossC = (x - c!.x) * aby - (y - c!.y) * abx;
      // Same-side of both rails? Between rails when signs differ (or near zero).
      if (crossA * crossC <= 0) {
        // Also require roughly between the extended span along the plot.
        const along = ((x - a!.x) * abx + (y - a!.y) * aby) / len2;
        if (along > -2 && along < 3) return true;
      }
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
    const base = fib.reverse ? priceB : priceA;
    const tip = fib.reverse ? priceA : priceB;
    const segL = Math.min(pts[0]!.x, pts[1]!.x);
    const segR = Math.max(pts[0]!.x, pts[1]!.x);
    const left = fib.extendLeft ? plot.left : segL;
    const right = fib.extendRight ? plot.left + plot.width : segR;
    for (const lv of levels) {
      const price = base + (tip - base) * lv.coeff;
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
    // Interior fill — easy grab on large boxes (ellipse/circle use bbox approx)
    const left = Math.min(pts[0]!.x, pts[1]!.x);
    const right = Math.max(pts[0]!.x, pts[1]!.x);
    const top = Math.min(pts[0]!.y, pts[1]!.y);
    const bottom = Math.max(pts[0]!.y, pts[1]!.y);
    if (x >= left && x <= right && y >= top && y <= bottom) return true;
  }

  if (type === 'brush' || type === 'highlighter' || type === 'path' || type === 'polyline') {
    return nearPolySegments(x, y, pts, hitPx, type === 'polyline');
  }

  if (type === 'callout' && pts.length >= 2) {
    if (nearSeg(x, y, pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y, hitPx)) {
      return true;
    }
    // Approximate bubble at tip (no canvas measure on hot path — use layout helper with fake ctx measure via length).
    const label = d.text || 'Callout';
    const fontSize = d.style.fontSize || 12;
    const w = Math.max(24, label.length * fontSize * 0.55) + 16;
    const h = fontSize + 12;
    // Mirror layoutCalloutBubble placement roughly
    const origin = pts[0]!;
    const anchor = pts[1]!;
    const dx = anchor.x - origin.x;
    const dy = anchor.y - origin.y;
    let bx = anchor.x - w / 2;
    let by = anchor.y - h / 2;
    if (Math.abs(dx) > Math.abs(dy)) {
      bx = dx >= 0 ? anchor.x + 4 : anchor.x - w - 4;
      by = anchor.y - h / 2;
    } else {
      bx = anchor.x - w / 2;
      by = dy >= 0 ? anchor.y + 4 : anchor.y - h - 4;
    }
    return hitCalloutBubble(x, y, { x: bx, y: by, w, h, tipX: bx, tipY: by }, hitPx);
  }

  if (type === 'priceLabel' && pts[0] && d.points[0]) {
    const y0 = pts[0].y;
    const right = plot.left + plot.width;
    // Stub or axis chip
    if (nearSeg(x, y, pts[0].x, y0, right, y0, hitPx)) return true;
    const label = d.points[0].price.toFixed(2);
    const chipW = Math.max(48, label.length * 7 + 14);
    const labelH = 18;
    const axisX = right - chipW;
    const labelY = y0 - labelH / 2;
    if (
      x >= axisX - 4 - hitPx &&
      x <= right + hitPx &&
      y >= labelY - hitPx &&
      y <= labelY + labelH + hitPx
    ) {
      return true;
    }
    return Math.hypot(x - pts[0].x, y - pts[0].y) <= hitPx * 1.5;
  }

  if (
    type === 'text' ||
    type === 'note' ||
    type === 'priceNote' ||
    type === 'comment' ||
    type === 'pin'
  ) {
    if (!pts[0]) return false;
    const label =
      d.text ||
      (type === 'priceNote' ? String(d.points[0]?.price ?? '') : type);
    return nearTextLabel(
      x,
      y,
      pts[0].x,
      pts[0].y,
      label,
      d.style.fontSize || 12,
      d.style.textAlignH,
      hitPx,
    );
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
    return opts?.dragging ? 'grabbing' : 'move';
  }

  if (drawing.type === 'hline') return 'ns-resize';
  if (drawing.type === 'vline') return 'ew-resize';
  if (drawing.type === 'crossLine') return 'move';

  if (isRectEdgeHandle(hit.handleIndex) && isRectLikeTool(drawing.type)) {
    if (hit.handleIndex === 2 || hit.handleIndex === 4) return 'ns-resize';
    return 'ew-resize';
  }

  if (isChannelWidthHandle(hit.handleIndex) && isChannelTool(drawing.type)) {
    return opts?.dragging ? 'grabbing' : 'ns-resize';
  }

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
    // Brush: only endpoints are handles (body drag moves the stroke).
    const handleIdxs: number[] =
      (d.type === 'brush' || d.type === 'highlighter') && pts.length > 2
        ? [0, pts.length - 1]
        : pts.map((_, i) => i);
    for (const h of handleIdxs) {
      const p = pts[h];
      if (p && Math.hypot(x - p.x, y - p.y) <= HANDLE_PX) {
        return { drawingId: d.id, handleIndex: h };
      }
    }
    if (isRectLikeTool(d.type) && pts.length >= 2) {
      for (const edge of rectEdgeMidpoints(pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y)) {
        if (Math.hypot(x - edge.x, y - edge.y) <= HANDLE_PX) {
          return { drawingId: d.id, handleIndex: edge.handleIndex };
        }
      }
    }
    if (isChannelTool(d.type) && pts.length >= 3) {
      const wh = channelWidthHandleXY(
        pts[0]!,
        pts[1]!,
        pts[2]!,
        d.type === 'flatTopBottom',
      );
      if (Math.hypot(x - wh.x, y - wh.y) <= HANDLE_PX) {
        return { drawingId: d.id, handleIndex: CHANNEL_WIDTH_HANDLE };
      }
    }
    if (hitPaintedBody(x, y, d, pts, plot, priceScale, HIT_PX)) {
      return { drawingId: d.id, handleIndex: null };
    }
  }
  return null;
}
