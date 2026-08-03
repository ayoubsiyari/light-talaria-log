import type { Drawing, DrawingPoint } from './drawingStore';
import { createDrawing } from './drawingStore';
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
    const next = [...existing, point];
    if (opts?.finishPolyline && next.length >= 2) {
      return {
        status: 'complete',
        drawing: createDrawing(tool, next, def.needsText ? { text: 'Note' } : undefined),
        points: [],
      };
    }
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

  return {
    status: 'complete',
    drawing: createDrawing(tool, pts, text != null ? { text } : undefined),
    points: [],
  };
}
