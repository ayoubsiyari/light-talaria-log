import { newId } from '@/utils/uuid';
import type { Drawing, DrawingPoint } from './drawingStore';
import { createDrawing } from './drawingStore';

export interface DrawingClipboardPayload {
  drawings: Array<{
    type: Drawing['type'];
    points: DrawingPoint[];
    style: Drawing['style'];
    text?: string;
    name?: string;
    meta?: Record<string, unknown>;
    visible?: boolean;
    visibleOnTfs?: Drawing['visibleOnTfs'];
  }>;
}

let clipboard: DrawingClipboardPayload | null = null;

/** Offset for paste / duplicate so clones don't sit exactly on the original. */
const PASTE_TIME_OFFSET_MS = 60_000;
const PASTE_PRICE_FRAC = 0.002;

function offsetPoints(
  points: readonly DrawingPoint[],
  dt: number,
  dp: number,
): DrawingPoint[] {
  return points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
}

function priceSpan(points: readonly DrawingPoint[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
  }
  if (!(max > min)) return Math.abs(min) * PASTE_PRICE_FRAC || 1;
  return (max - min) * 0.05 || Math.abs(min) * PASTE_PRICE_FRAC || 1;
}

export function hasDrawingClipboard(): boolean {
  return clipboard != null && clipboard.drawings.length > 0;
}

export function copyDrawings(drawings: readonly Drawing[]): void {
  if (drawings.length === 0) {
    clipboard = null;
    return;
  }
  clipboard = {
    drawings: drawings.map((d) => ({
      type: d.type,
      points: d.points.map((p) => ({ ...p })),
      style: { ...d.style },
      text: d.text,
      name: d.name,
      meta: d.meta ? { ...d.meta } : undefined,
      visible: d.visible !== false,
      visibleOnTfs: d.visibleOnTfs,
    })),
  };
}

export function cloneDrawingInPlace(d: Drawing, offset = true): Drawing {
  const dp = offset ? priceSpan(d.points) : 0;
  const dt = offset ? PASTE_TIME_OFFSET_MS : 0;
  return createDrawing(d.type, offsetPoints(d.points, dt, dp), {
    text: d.text,
    name: d.name,
    style: { ...d.style },
    meta: d.meta ? { ...d.meta } : undefined,
    visible: d.visible !== false,
    visibleOnTfs: d.visibleOnTfs,
    locked: false,
  });
}

/** Paste clipboard with a small time/price offset. */
export function pasteDrawingsFromClipboard(): Drawing[] {
  if (!clipboard?.drawings.length) return [];
  return clipboard.drawings.map((payload) => {
    const dp = priceSpan(payload.points);
    return createDrawing(
      payload.type,
      offsetPoints(payload.points, PASTE_TIME_OFFSET_MS, dp),
      {
        text: payload.text,
        name: payload.name,
        style: { ...payload.style },
        meta: payload.meta ? { ...payload.meta } : undefined,
        visible: payload.visible !== false,
        visibleOnTfs: payload.visibleOnTfs,
        locked: false,
      },
    );
  });
}

export function duplicateDrawings(drawings: readonly Drawing[]): Drawing[] {
  return drawings.map((d) => cloneDrawingInPlace(d, true));
}

/** Move ids to end of array (paint on top). */
export function bringDrawingsToFront(
  drawings: readonly Drawing[],
  ids: readonly string[],
): Drawing[] {
  if (ids.length === 0) return [...drawings];
  const idSet = new Set(ids);
  const rest = drawings.filter((d) => !idSet.has(d.id));
  const moved = drawings.filter((d) => idSet.has(d.id));
  return [...rest, ...moved];
}

/** Move ids to start of array (paint under). */
export function sendDrawingsToBack(
  drawings: readonly Drawing[],
  ids: readonly string[],
): Drawing[] {
  if (ids.length === 0) return [...drawings];
  const idSet = new Set(ids);
  const moved = drawings.filter((d) => idSet.has(d.id));
  const rest = drawings.filter((d) => !idSet.has(d.id));
  return [...moved, ...rest];
}

/** Fresh ids for an in-memory clone (Alt-drag). */
export function rematerializeDrawing(d: Drawing): Drawing {
  return {
    ...cloneDrawingInPlace(d, false),
    id: newId(),
    points: d.points.map((p) => ({ ...p })),
  };
}
