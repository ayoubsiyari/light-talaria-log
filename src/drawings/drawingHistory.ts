import type { Drawing } from './drawingStore';

const MAX_STACK = 50;

/**
 * Session-local undo/redo for drawing list snapshots.
 * Push *before* mutating; React owns the live list.
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
    if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
    this.redoStack = [];
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
    return prev;
  }

  redo(current: readonly Drawing[]): Drawing[] | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneList(current));
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
