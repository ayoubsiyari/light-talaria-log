import type { Drawing, DrawingPoint } from './drawingStore';
import { createDrawing } from './drawingStore';
import { syncRiskRewardMeta } from './positionMath';
import { getTool, type DrawingToolId } from './toolRegistry';

export type PlaceResult =
  | { status: 'pending'; points: DrawingPoint[]; draft: Drawing }
  | { status: 'complete'; drawing: Drawing; points: DrawingPoint[] }
  | { status: 'ignore' };

/**
 * Talaria-style freehand sanitize — drop consecutive near-duplicates only.
 * Do NOT stride-thin to ~40 pts (that is what made release look jagged).
 */
export function sanitizeFreehandPoints(points: readonly DrawingPoint[]): DrawingPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const out: DrawingPoint[] = [];
  // Data-space epsilon (time seconds² + price²) — keep dense strokes.
  const minDistSq = 1e-10;
  for (const p of points) {
    if (!Number.isFinite(p.time) || !Number.isFinite(p.price)) continue;
    if (out.length > 0) {
      const prev = out[out.length - 1]!;
      const dt = p.time - prev.time;
      const dp = p.price - prev.price;
      if (dt * dt + dp * dp < minDistSq) continue;
    }
    out.push({ time: p.time, price: p.price });
  }
  if (out.length < 2 && points.length >= 2) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return [
      { time: first.time, price: first.price },
      { time: last.time, price: last.price },
    ];
  }
  return out;
}

/** Append a point toward finishing the active tool. */
export function placeDrawingPoint(
  tool: DrawingToolId,
  existing: DrawingPoint[],
  point: DrawingPoint,
  opts?: { finishPolyline?: boolean },
): PlaceResult {
  const def = getTool(tool);
  const mode = def.points;

  if (mode.kind === 'freehand') {
    // Press-drag finish: commit accumulated stroke (optionally tip-extend once).
    if (opts?.finishPolyline) {
      const last = existing[existing.length - 1];
      const tipDup =
        last &&
        Math.abs(last.time - point.time) < 0.5 &&
        Math.abs(last.price - point.price) < 1e-6;
      let next = tipDup || existing.length === 0 ? existing : [...existing, point];
      next = sanitizeFreehandPoints(next);
      if (next.length < 2) return { status: 'ignore' };
      return {
        status: 'complete',
        drawing: createDrawing(tool, next, def.needsText ? { text: 'Note' } : undefined),
        points: [],
      };
    }
    const last = existing[existing.length - 1];
    // Skip near-duplicate samples while stroking (tight — keep curve density).
    if (
      last &&
      Math.abs(last.time - point.time) < 0.05 &&
      Math.abs(last.price - point.price) < 1e-8
    ) {
      return {
        status: 'pending',
        points: existing,
        draft: createDrawing(tool, existing),
      };
    }
    const next = [...existing, point];
    return {
      status: 'pending',
      points: next,
      draft: createDrawing(tool, next),
    };
  }

  if (mode.kind === 'polyline') {
    if (opts?.finishPolyline && existing.length >= mode.min) {
      return {
        status: 'complete',
        drawing: createDrawing(tool, existing),
        points: [],
      };
    }
    const next = [...existing, point];
    return {
      status: 'pending',
      points: next,
      draft: createDrawing(tool, next),
    };
  }

  let next = [...existing, point];

  // Parallel channel: 3rd point snaps perpendicular to the baseline (Talaria).
  if (
    tool === 'parallelChannel' &&
    existing.length === 2 &&
    mode.kind === 'fixed' &&
    mode.count === 3
  ) {
    const a = existing[0]!;
    const b = existing[1]!;
    const dt = b.time - a.time;
    const dp = b.price - a.price;
    const len2 = dt * dt + dp * dp;
    if (len2 > 1e-12) {
      const t = ((point.time - a.time) * dt + (point.price - a.price) * dp) / len2;
      next = [
        a,
        b,
        {
          time: a.time + t * dt,
          // Keep the pointer's price offset as channel width (perp in price-time mix).
          price: point.price,
        },
      ];
      // Prefer true geometric perpendicular in price vs along-base projection of time:
      next[2] = {
        time: a.time + Math.max(0, Math.min(1, t)) * dt,
        price: point.price,
      };
    }
  }

  if (next.length < mode.count) {
    return {
      status: 'pending',
      points: next,
      draft: createDrawing(tool, next),
    };
  }

  const pts = next.slice(0, mode.count);
  // Text tools get a placeholder — inline edit / Text settings tab.
  const text = def.needsText ? def.label : undefined;

  let drawing = createDrawing(tool, pts, text != null ? { text } : undefined);
  if (tool === 'longPosition' || tool === 'shortPosition') {
    drawing = {
      ...drawing,
      meta: syncRiskRewardMeta(tool, pts, drawing.meta),
    };
  }

  return {
    status: 'complete',
    drawing,
    points: [],
  };
}
