/**
 * Drawing memory / CPU guards — keep books lean (project-core).
 * Caps are soft UX limits, not security boundaries.
 */
import type { Drawing, DrawingPoint } from './drawingStore';

/** Max drawings kept per session×dataset book. */
export const MAX_DRAWINGS_PER_BOOK = 200;

/** Max points kept on a brush / highlighter / path after commit. */
export const MAX_FREEHAND_POINTS = 800;

/** Max polyline / path vertices (non-freehand multi-point). */
export const MAX_POLYLINE_POINTS = 400;

/** Refuse persist when JSON would exceed this (~1.5 MB). */
export const MAX_DRAWING_BOOK_JSON_CHARS = 1_500_000;

/** Undo/redo RAM budget (estimated) across both stacks. */
export const MAX_HISTORY_BYTES_EST = 2_000_000;

const FREEHAND_TYPES = new Set(['brush', 'highlighter']);

export function isFreehandDrawingType(type: string): boolean {
  return FREEHAND_TYPES.has(type);
}

/** Evenly sample keeping endpoints — shape-preserving under a hard cap. */
export function downsamplePoints(
  points: readonly DrawingPoint[],
  maxPoints: number,
): DrawingPoint[] {
  if (points.length <= maxPoints || maxPoints < 2) {
    return points.map((p) => ({ time: p.time, price: p.price }));
  }
  const out: DrawingPoint[] = [];
  const lastIdx = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx =
      i === maxPoints - 1 ? lastIdx : Math.round((i / (maxPoints - 1)) * lastIdx);
    const p = points[idx]!;
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.time - p.time) < 1e-9 &&
      Math.abs(prev.price - p.price) < 1e-12
    ) {
      continue;
    }
    out.push({ time: p.time, price: p.price });
  }
  return out;
}

/** Cap freehand point count (caller should sanitize first when committing). */
export function capFreehandPoints(
  points: readonly DrawingPoint[],
  maxPoints: number = MAX_FREEHAND_POINTS,
): DrawingPoint[] {
  return downsamplePoints(points, maxPoints);
}

/** Cap point arrays on a drawing by type (idempotent). */
export function capDrawingPoints(d: Drawing): Drawing {
  if (isFreehandDrawingType(d.type)) {
    if (d.points.length <= MAX_FREEHAND_POINTS) return d;
    return { ...d, points: downsamplePoints(d.points, MAX_FREEHAND_POINTS) };
  }
  if (
    (d.type === 'polyline' || d.type === 'path') &&
    d.points.length > MAX_POLYLINE_POINTS
  ) {
    return { ...d, points: downsamplePoints(d.points, MAX_POLYLINE_POINTS) };
  }
  return d;
}

export function estimateDrawingBytes(d: Drawing): number {
  // Rough: id/type/style ~128 B + 16 B/point
  return 128 + d.points.length * 16 + (d.text?.length ?? 0);
}

export function estimateBookBytes(list: readonly Drawing[]): number {
  let n = 64;
  for (const d of list) n += estimateDrawingBytes(d);
  return n;
}

export type BookCapResult =
  | { ok: true; drawings: Drawing[] }
  | { ok: false; reason: 'count' | 'json'; drawings: Drawing[] };

/**
 * Normalize + enforce book caps. `ok: false` means caller should not grow further
 * (keep previous book); returned `drawings` is a safe capped snapshot for load.
 */
export function enforceDrawingBookLimits(
  drawings: readonly Drawing[],
  opts?: { forLoad?: boolean },
): BookCapResult {
  let list = drawings.map(capDrawingPoints);
  if (list.length > MAX_DRAWINGS_PER_BOOK) {
    if (opts?.forLoad) {
      list = list.slice(-MAX_DRAWINGS_PER_BOOK);
    } else {
      return { ok: false, reason: 'count', drawings: list.slice(0, MAX_DRAWINGS_PER_BOOK) };
    }
  }
  try {
    const json = JSON.stringify(list);
    if (json.length > MAX_DRAWING_BOOK_JSON_CHARS) {
      if (opts?.forLoad) {
        // Drop oldest until under budget.
        while (list.length > 1) {
          list = list.slice(1);
          if (JSON.stringify(list).length <= MAX_DRAWING_BOOK_JSON_CHARS) break;
        }
        return { ok: true, drawings: list };
      }
      return { ok: false, reason: 'json', drawings: list };
    }
  } catch {
    return { ok: false, reason: 'json', drawings: list };
  }
  return { ok: true, drawings: list };
}
