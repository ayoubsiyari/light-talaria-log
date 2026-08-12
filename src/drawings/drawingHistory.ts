import type { Drawing } from './drawingStore';
import {
  estimateBookBytes,
  MAX_HISTORY_BYTES_EST,
} from './drawingLimits';

const MAX_STACK = 50;

/**
 * Session-local undo/redo for drawing list snapshots.
 * Push *before* mutating; React owns the live list.
 * Stack depth and estimated byte budget both apply (fat freehand books).
 */
export class DrawingHistory {
  private undoStack: Drawing[][] = [];
  private redoStack: Drawing[][] = [];

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Snapshot current list before a mutating change. */
  push(current: readonly Drawing[]): void {
    this.undoStack.push(cloneList(current));
    this.redoStack = [];
    trimStacks(this.undoStack, this.redoStack);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Returns previous list; caller should also push `current` onto redo. */
  undo(current: readonly Drawing[]): Drawing[] | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneList(current));
    trimStacks(this.undoStack, this.redoStack);
    return prev;
  }

  redo(current: readonly Drawing[]): Drawing[] | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneList(current));
    trimStacks(this.undoStack, this.redoStack);
    return next;
  }
}

function cloneList(list: readonly Drawing[]): Drawing[] {
  return list.map((d) => ({
    ...d,
    points: d.points.map((p) => ({ ...p })),
    style: { ...d.style },
    meta: d.meta ? { ...d.meta } : undefined,
    visibleOnTfs: Array.isArray(d.visibleOnTfs)
      ? [...d.visibleOnTfs]
      : d.visibleOnTfs,
  }));
}

/** Drop oldest undo entries until under depth + RAM budget. */
function trimStacks(undo: Drawing[][], redo: Drawing[][]): void {
  while (undo.length > MAX_STACK) undo.shift();
  const budget = () => {
    let n = 0;
    for (const snap of undo) n += estimateBookBytes(snap);
    for (const snap of redo) n += estimateBookBytes(snap);
    return n;
  };
  while (undo.length > 1 && budget() > MAX_HISTORY_BYTES_EST) {
    undo.shift();
  }
  // If still over after a single undo snap, clear redo first then force one undo.
  while (redo.length > 0 && budget() > MAX_HISTORY_BYTES_EST) {
    redo.shift();
  }
}
