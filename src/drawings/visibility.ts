import type { Timeframe } from '@/types/ui';
import type { Drawing } from './drawingStore';

import { ALL_TIMEFRAMES_ORDERED, isKnownTimeframe } from '@/data/timeframeAgg';

export const DRAWING_VISIBILITY_TFS: readonly Timeframe[] = ALL_TIMEFRAMES_ORDERED;

/**
 * `undefined` / `'all'` / empty handling:
 * - missing or `'all'` → visible on every TF
 * - string[] → only those TFs
 */
export type DrawingVisibleOnTfs = Timeframe[] | 'all';

export function normalizeVisibleOnTfs(
  raw: unknown,
): DrawingVisibleOnTfs | undefined {
  if (raw === 'all' || raw == null) return 'all';
  if (!Array.isArray(raw)) return 'all';
  const out: Timeframe[] = [];
  for (const t of raw) {
    if (typeof t === 'string' && isKnownTimeframe(t)) {
      out.push(t);
    }
  }
  return out.length === 0 ? 'all' : out;
}

/** Global visible flag + per-TF filter. */
export function isDrawingVisibleOnTf(
  d: Drawing,
  tf: Timeframe | null | undefined,
): boolean {
  if (d.visible === false) return false;
  if (tf == null) return true;
  const v = d.visibleOnTfs;
  if (v == null || v === 'all') return true;
  return v.includes(tf);
}

export function toggleVisibleOnTf(
  current: DrawingVisibleOnTfs | undefined,
  tf: Timeframe,
  enabled: boolean,
): DrawingVisibleOnTfs {
  const all = [...DRAWING_VISIBILITY_TFS];
  let set: Set<Timeframe>;
  if (current == null || current === 'all') {
    set = new Set(all);
  } else {
    set = new Set(current);
  }
  if (enabled) set.add(tf);
  else set.delete(tf);
  if (set.size === 0) return [];
  if (set.size === all.length) return 'all';
  return all.filter((t) => set.has(t));
}
