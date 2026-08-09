/**
 * Talaria-style freehand path: light sanitize + centripetal Catmull-Rom (α=0.5).
 * Canvas port of Talaria-log `BaseDrawing.buildFreehandPathData` (no d3).
 */

export interface XY {
  x: number;
  y: number;
}

/** Drop consecutive near-duplicates in screen space (keep endpoints). */
export function sanitizeFreehandXY(points: readonly XY[], minDistSq = 0.25): XY[] {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: XY[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (out.length > 0) {
      const prev = out[out.length - 1]!;
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      if (dx * dx + dy * dy < minDistSq) continue;
    }
    out.push({ x: p.x, y: p.y });
  }
  if (out.length < 2 && points.length >= 2) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return [
      { x: first.x, y: first.y },
      { x: last.x, y: last.y },
    ];
  }
  return out;
}

/** Virtual lead/tail points stabilize Catmull-Rom tangents (Talaria pad). */
export function padPointsForCatmullRom(
  points: readonly XY[],
  opts?: { skipStartPad?: boolean; skipEndPad?: boolean },
): XY[] {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  if (points.length === 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const p0 = points[0]!;
  const p1 = points[1]!;
  const pn = points[points.length - 1]!;
  const pn1 = points[points.length - 2]!;
  const out: XY[] = [];
  if (!opts?.skipStartPad) {
    out.push({ x: p0.x - (p1.x - p0.x) * 0.5, y: p0.y - (p1.y - p0.y) * 0.5 });
  }
  for (const p of points) out.push({ x: p.x, y: p.y });
  if (!opts?.skipEndPad) {
    out.push({ x: pn.x + (pn.x - pn1.x) * 0.5, y: pn.y + (pn.y - pn1.y) * 0.5 });
  }
  return out;
}

/**
 * Centripetal Catmull-Rom (α=0.5) → cubic Bezier for segment i→i+1.
 * Port of the common CR→SVG-C conversion used with d3.curveCatmullRom.alpha(0.5).
 */
function segmentToBezier(
  p0: XY,
  p1: XY,
  p2: XY,
  p3: XY,
  alpha = 0.5,
): { cp1: XY; cp2: XY } {
  const d1 = Math.sqrt((p0.x - p1.x) ** 2 + (p0.y - p1.y) ** 2);
  const d2 = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  const d3 = Math.sqrt((p2.x - p3.x) ** 2 + (p2.y - p3.y) ** 2);

  const d1a = d1 ** alpha;
  const d2a = d2 ** alpha;
  const d3a = d3 ** alpha;
  const d1_2a = d1a * d1a;
  const d2_2a = d2a * d2a;
  const d3_2a = d3a * d3a;

  let bp1: XY;
  if (d1a < 1e-8 && d2a < 1e-8) {
    bp1 = { x: p1.x, y: p1.y };
  } else if (d1a < 1e-8) {
    bp1 = { x: p1.x + (p2.x - p1.x) / 3, y: p1.y + (p2.y - p1.y) / 3 };
  } else {
    const A = 2 * d1_2a + 3 * d1a * d2a + d2_2a;
    const N = 3 * d1a * (d1a + d2a);
    const M = 1 / Math.max(N, 1e-9);
    bp1 = {
      x: (d1_2a * p2.x - d2_2a * p0.x + A * p1.x) * M,
      y: (d1_2a * p2.y - d2_2a * p0.y + A * p1.y) * M,
    };
  }

  let bp2: XY;
  if (d3a < 1e-8 && d2a < 1e-8) {
    bp2 = { x: p2.x, y: p2.y };
  } else if (d3a < 1e-8) {
    bp2 = { x: p2.x - (p2.x - p1.x) / 3, y: p2.y - (p2.y - p1.y) / 3 };
  } else {
    const A = 2 * d3_2a + 3 * d3a * d2a + d2_2a;
    const N = 3 * d3a * (d3a + d2a);
    const M = 1 / Math.max(N, 1e-9);
    bp2 = {
      x: (d3_2a * p1.x - d2_2a * p3.x + A * p2.x) * M,
      y: (d3_2a * p1.y - d2_2a * p3.y + A * p2.y) * M,
    };
  }

  if (!Number.isFinite(bp1.x) || !Number.isFinite(bp1.y)) bp1 = { x: p1.x, y: p1.y };
  if (!Number.isFinite(bp2.x) || !Number.isFinite(bp2.y)) bp2 = { x: p2.x, y: p2.y };
  return { cp1: bp1, cp2: bp2 };
}

/** Build a Canvas path through points with centripetal Catmull-Rom smoothing. */
export function pathFreehandCatmullRom(
  ctx: CanvasRenderingContext2D,
  points: readonly XY[],
  opts?: { skipStartPad?: boolean; skipEndPad?: boolean },
): void {
  const clean = sanitizeFreehandXY(points);
  if (clean.length < 2) return;

  if (clean.length === 2) {
    ctx.moveTo(clean[0]!.x, clean[0]!.y);
    ctx.lineTo(clean[1]!.x, clean[1]!.y);
    return;
  }

  // Pad for tangents only — stroke passes through real samples (no overhang).
  const padded = padPointsForCatmullRom(clean, opts);
  const hasStartPad = !opts?.skipStartPad && padded.length > clean.length;
  const offset = hasStartPad ? 1 : 0;

  ctx.moveTo(clean[0]!.x, clean[0]!.y);
  for (let i = 0; i < clean.length - 1; i++) {
    const pi = offset + i;
    const p0 = padded[Math.max(0, pi - 1)]!;
    const p1 = padded[pi]!;
    const p2 = padded[pi + 1]!;
    const p3 = padded[Math.min(padded.length - 1, pi + 2)]!;
    const { cp1, cp2 } = segmentToBezier(p0, p1, p2, p3, 0.5);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }
}
