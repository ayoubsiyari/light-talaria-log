/**
 * Warm cache — decoded viewport bars per dataset×TF.
 *
 * 1. Key shape: `${datasetId}|${tf}` — one viewport window per series; sufficient
 *    because loads are always around a single anchor/cursor.
 * 2. Maximum: MAX_ENTRIES = 12 (6 TFs × 2 datasets); MAX_BYTES ≈ 12 × 2500 × ~120 B
 *    ≈ 3.6 MB as ChartBar objects (budget: < 3 MB packed / ~1.8 MB objects for 6 TFs —
 *    we still store ChartBar[]; packed SoA migration is deferred — see report §14).
 * 3. Eviction: LRU by `touchedAt` when entry count exceeds MAX_ENTRIES; clearDataset
 *    when a pane drops a symbol (caller must clear before prefetching the new one).
 * 4. Miss: never blocks — returns [] or nearest *coarser* cached TF as placeholder
 *    and kicks async fill (epoch-guarded). Never returns a finer TF.
 */
import { loadViewportAroundTime } from '@/datasets/seriesViewport';
import { ledgerAcquire, ledgerRelease } from '@/dev/resourceLedger';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { MAX_BARS_IN_MEMORY } from '@/utils/constants';

type CacheKey = string;

interface CacheEntry {
  bars: ChartBar[];
  anchorTime: number;
  loadedAt: number;
  touchedAt: number;
}

function key(datasetId: string, tf: Timeframe): CacheKey {
  return `${datasetId}|${tf}`;
}

const TF_FALLBACK_ORDER: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

/** 6 TFs × 2 datasets — hard cap (addendum §5). */
const MAX_ENTRIES = 12;

/** Rough resident bytes assuming ~120 B per ChartBar object. */
function estimateBytes(bars: readonly ChartBar[]): number {
  return bars.length * 120;
}

export class WarmCache {
  private readonly store = new Map<CacheKey, CacheEntry>();
  private readonly inflight = new Map<CacheKey, number>();
  private readonly epochs = new Map<CacheKey, number>();

  clearDataset(datasetId: string): void {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${datasetId}|`)) {
        this.store.delete(k);
        ledgerRelease('cacheEntries');
      }
    }
  }

  clear(): void {
    const n = this.store.size;
    this.store.clear();
    this.inflight.clear();
    if (n > 0) ledgerRelease('cacheEntries', n);
  }

  stats(): { entries: number; bytes: number } {
    let bytes = 0;
    for (const e of this.store.values()) bytes += estimateBytes(e.bars);
    return { entries: this.store.size, bytes };
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
      hit.touchedAt = Date.now();
      const covers =
        hit.bars[0]!.time <= anchorTime &&
        hit.bars[hit.bars.length - 1]!.time >= anchorTime;
      if (!covers || Math.abs(hit.anchorTime - anchorTime) > span * 60) {
        void this.fill(datasetId, tf, anchorTime, span);
      }
      return hit.bars;
    }

    void this.fill(datasetId, tf, anchorTime, span);

    // Coarser placeholder only — never return a finer TF (e.g. 1m for 1D).
    // Finer placeholders corrupt replay reveal into a sawtooth of intraday bars.
    const idx = TF_FALLBACK_ORDER.indexOf(tf);
    for (let i = idx + 1; i < TF_FALLBACK_ORDER.length; i++) {
      const coarser = TF_FALLBACK_ORDER[i]!;
      const alt = this.store.get(key(datasetId, coarser));
      if (alt && alt.bars.length > 0) {
        alt.touchedAt = Date.now();
        return alt.bars;
      }
    }
    return [];
  }

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
      this.writeEntry(k, { bars, anchorTime, loadedAt: Date.now(), touchedAt: Date.now() });
      return bars;
    } finally {
      if (this.inflight.get(k) === epoch) this.inflight.delete(k);
    }
  }

  peek(datasetId: string, tf: Timeframe): ChartBar[] | null {
    const e = this.store.get(key(datasetId, tf));
    if (!e) return null;
    e.touchedAt = Date.now();
    return e.bars;
  }

  put(
    datasetId: string,
    tf: Timeframe,
    bars: ChartBar[],
    anchorTime: number,
  ): void {
    this.writeEntry(key(datasetId, tf), {
      bars,
      anchorTime,
      loadedAt: Date.now(),
      touchedAt: Date.now(),
    });
  }

  private writeEntry(k: CacheKey, entry: CacheEntry): void {
    const isNew = !this.store.has(k);
    this.store.set(k, entry);
    if (isNew) ledgerAcquire('cacheEntries');
    this.evictLru();
  }

  private evictLru(): void {
    while (this.store.size > MAX_ENTRIES) {
      let oldestKey: CacheKey | null = null;
      let oldestTouch = Infinity;
      for (const [k, e] of this.store) {
        if (e.touchedAt < oldestTouch) {
          oldestTouch = e.touchedAt;
          oldestKey = k;
        }
      }
      if (!oldestKey) break;
      this.store.delete(oldestKey);
      ledgerRelease('cacheEntries');
    }
  }
}

export const warmCache = new WarmCache();
