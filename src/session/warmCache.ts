import { loadViewportAroundTime } from '@/datasets/seriesViewport';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { MAX_BARS_IN_MEMORY } from '@/utils/constants';

type CacheKey = string;

interface CacheEntry {
  bars: ChartBar[];
  anchorTime: number;
  loadedAt: number;
}

function key(datasetId: string, tf: Timeframe): CacheKey {
  return `${datasetId}|${tf}`;
}

const TF_FALLBACK_ORDER: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

/**
 * In-memory TF viewports. `get` is synchronous; misses kick async fill (epoch-guarded).
 */
export class WarmCache {
  private readonly store = new Map<CacheKey, CacheEntry>();
  private readonly inflight = new Map<CacheKey, number>();
  private readonly epochs = new Map<CacheKey, number>();

  clearDataset(datasetId: string): void {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${datasetId}|`)) this.store.delete(k);
    }
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  /**
   * Sync read. On miss returns nearest coarser cached TF bars (or empty) and
   * starts an async fill — never blocks, never returns undefined.
   */
  get(
    datasetId: string,
    tf: Timeframe,
    anchorTime: number,
    span: number,
  ): ChartBar[] {
    const k = key(datasetId, tf);
    const hit = this.store.get(k);
    if (hit && hit.bars.length > 0) {
      const covers =
        hit.bars[0]!.time <= anchorTime &&
        hit.bars[hit.bars.length - 1]!.time >= anchorTime;
      if (!covers || Math.abs(hit.anchorTime - anchorTime) > span * 60) {
        void this.fill(datasetId, tf, anchorTime, span);
      }
      return hit.bars;
    }

    void this.fill(datasetId, tf, anchorTime, span);

    // Placeholder: nearest coarser cached TF for same dataset.
    const idx = TF_FALLBACK_ORDER.indexOf(tf);
    for (let i = idx + 1; i < TF_FALLBACK_ORDER.length; i++) {
      const coarser = TF_FALLBACK_ORDER[i]!;
      const alt = this.store.get(key(datasetId, coarser));
      if (alt && alt.bars.length > 0) return alt.bars;
    }
    for (let i = idx - 1; i >= 0; i--) {
      const finer = TF_FALLBACK_ORDER[i]!;
      const alt = this.store.get(key(datasetId, finer));
      if (alt && alt.bars.length > 0) return alt.bars;
    }
    return [];
  }

  /** Prefetch every TF around cursor (session open). */
  async prefetchAll(
    datasetId: string,
    tfs: readonly Timeframe[],
    cursorTime: number,
    span: number,
  ): Promise<void> {
    await Promise.all(tfs.map((tf) => this.fill(datasetId, tf, cursorTime, span)));
  }

  async fill(
    datasetId: string,
    tf: Timeframe,
    anchorTime: number,
    span: number,
  ): Promise<ChartBar[]> {
    const k = key(datasetId, tf);
    const epoch = (this.epochs.get(k) ?? 0) + 1;
    this.epochs.set(k, epoch);
    this.inflight.set(k, epoch);

    try {
      const vp = await loadViewportAroundTime(
        datasetId,
        tf,
        anchorTime,
        Math.min(MAX_BARS_IN_MEMORY, Math.max(span * 3, span + 64)),
      );
      if (this.epochs.get(k) !== epoch) return this.store.get(k)?.bars ?? [];
      const bars = vp.bars as ChartBar[];
      this.store.set(k, { bars, anchorTime, loadedAt: Date.now() });
      return bars;
    } finally {
      if (this.inflight.get(k) === epoch) this.inflight.delete(k);
    }
  }

  /** Peek without triggering fill. */
  peek(datasetId: string, tf: Timeframe): ChartBar[] | null {
    return this.store.get(key(datasetId, tf))?.bars ?? null;
  }

  /** Test / prefetch seed — write bars without IDB. */
  put(
    datasetId: string,
    tf: Timeframe,
    bars: ChartBar[],
    anchorTime: number,
  ): void {
    this.store.set(key(datasetId, tf), {
      bars,
      anchorTime,
      loadedAt: Date.now(),
    });
  }
}

export const warmCache = new WarmCache();
