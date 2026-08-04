import type { Drawing, DrawingPoint } from './drawingStore';
import { createDrawing } from './drawingStore';
import { syncRiskRewardMeta } from './positionMath';
import { getTool, type DrawingToolId } from './toolRegistry';

export type PlaceResult =
  | { status: 'pending'; points: DrawingPoint[]; draft: Drawing }
  | { status: 'complete'; drawing: Drawing; points: DrawingPoint[] }
  | { status: 'ignore' };

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
      const next = tipDup || existing.length === 0 ? existing : [...existing, point];
      if (next.length < 2) return { status: 'ignore' };
      return {
        status: 'complete',
        drawing: createDrawing(tool, next, def.needsText ? { text: 'Note' } : undefined),
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

  const next = [...existing, point];
  if (next.length < mode.count) {
    return {
      status: 'pending',
      points: next,
      draft: createDrawing(tool, next),
    };
  }

  const pts = next.slice(0, mode.count);
  // Text tools get a placeholder — edit in the Text settings tab (no window.prompt).
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
