/**
 * Debounced viewport loads into the chart engine.
 * Chart visible-range indices are local to the current buffer; this loader
 * converts them to global series indices via `getWindowFrom`.
 *
 * Prefetch only when the visible range approaches a buffer edge (BUFFER_BARS),
 * so pan stays on the current TypedArray window until refill is needed.
 */
import type { ChartInstance } from './createChart';
import { debounce } from '@/utils/debounce';
import { BUFFER_BARS, DEBOUNCE_MS, MAX_BARS_IN_MEMORY } from '@/utils/constants';
import {
  EDGE_PREFETCH_RATIO,
  isNearBufferEdge,
  type BufferEdgeCheck,
} from '@/utils/viewportEdge';
import type { ChartBar, VisibleRange } from '@/types/bar';

export type { BufferEdgeCheck };
export { EDGE_PREFETCH_RATIO, isNearBufferEdge };

export type LoadBarsFn = (
  globalFrom: number,
  globalTo: number,
) => Promise<{ bars: ChartBar[]; windowFrom: number }>;

export interface ViewportLoaderOptions {
  loadBars: LoadBarsFn;
  getWindowFrom: () => number;
  getTotalBars: () => number;
  onLoaded?: (bars: ChartBar[], windowFrom: number, range: VisibleRange) => void;
}

export interface ViewportLoader {
  dispose: () => void;
  refresh: () => void;
}

export function attachViewportLoader(
  chart: ChartInstance,
  options: ViewportLoaderOptions,
): ViewportLoader {
  let loading = false;
  let lastWindowFrom = options.getWindowFrom();
  let loadGen = 0;
  let pending: { from: number; to: number } | null = null;

  const loadForLocalRange = async (localFrom: number, localTo: number) => {
    const totalBars = options.getTotalBars();
    if (totalBars <= 0) return;

    if (loading) {
      pending = { from: localFrom, to: localTo };
      return;
    }

    const windowFrom = options.getWindowFrom();
    const bufferLen = MAX_BARS_IN_MEMORY;
    const nearEdge = isNearBufferEdge({
      localFrom,
      localTo,
      bufferLen,
      windowFrom,
      totalBars,
    });

    // Only fetch when approaching buffer edges (or first refresh / window moved)
    if (!nearEdge && windowFrom === lastWindowFrom) {
      return;
    }

    const globalFrom = windowFrom + localFrom;
    const globalTo = windowFrom + localTo;
    let from = Math.max(0, Math.floor(globalFrom) - BUFFER_BARS);
    let to = Math.min(totalBars, Math.ceil(globalTo) + BUFFER_BARS);
    if (to - from > MAX_BARS_IN_MEMORY) {
      const mid = (from + to) / 2;
      from = Math.max(0, Math.floor(mid - MAX_BARS_IN_MEMORY / 2));
      to = Math.min(totalBars, from + MAX_BARS_IN_MEMORY);
      from = Math.max(0, to - MAX_BARS_IN_MEMORY);
    }

    const gen = ++loadGen;
    loading = true;
    try {
      const result = await options.loadBars(from, to);
      if (gen !== loadGen) return; // stale — a newer load superseded this one

      lastWindowFrom = result.windowFrom;
      const range: VisibleRange = {
        fromIndex: Math.max(0, globalFrom - result.windowFrom),
        toIndex: Math.max(1, globalTo - result.windowFrom),
      };
      const max = result.bars.length;
      range.fromIndex = Math.min(range.fromIndex, Math.max(0, max - 1));
      range.toIndex = Math.min(Math.max(range.fromIndex + 1, range.toIndex), max);

      chart.setViewportBars(result.bars);
      chart.setVisibleRange(range.fromIndex, range.toIndex);
      options.onLoaded?.(result.bars, result.windowFrom, range);
    } finally {
      if (gen !== loadGen) return; // disposed or superseded
      loading = false;
      if (pending) {
        const next = pending;
        pending = null;
        void loadForLocalRange(next.from, next.to);
      }
    }
  };

  const debouncedLoad = debounce((from: number, to: number) => {
    void loadForLocalRange(from, to);
  }, DEBOUNCE_MS);

  const unsubscribe = chart.onVisibleRangeChange((range: VisibleRange) => {
    debouncedLoad(range.fromIndex, range.toIndex);
  });

  return {
    dispose: () => {
      loadGen += 1; // invalidate in-flight
      pending = null;
      loading = false;
      unsubscribe();
    },
    refresh: () => {
      const range = chart.getVisibleRange();
      void loadForLocalRange(range.fromIndex, range.toIndex);
    },
  };
}
