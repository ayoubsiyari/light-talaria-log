/**
 * Warm cache — decoded viewport bars per dataset×TF.
 *
 * 1. Key shape: `${datasetId}|${tf}` — one viewport window per series.
 * 2. Caps: MAX_ENTRIES + MAX_CACHE_BYTES (first-rule: low browser memory).
 * 3. Eviction: LRU by `touchedAt`, never evict pinned (active pane) keys first.
 * 4. Miss: never blocks — returns [] or nearest *coarser* cached TF as placeholder
 *    and kicks async fill (epoch-guarded). Never returns a finer TF.
 * 5. Replay fill-ahead uses a compact forward-biased window (not a larger budget).
 */
import { timeframeSeconds } from '@/data/timeframeAgg';
import { getDataset } from '@/datasets/datasetStore';
import { scheduleRemoteChunkGc } from '@/datasets/idbChunkGc';
import { ensureRemoteTimeCoverage } from '@/datasets/ingestRemoteChunks';
import { loadViewportAroundTime } from '@/datasets/seriesViewport';
import { ledgerAcquire, ledgerRelease } from '@/dev/resourceLedger';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { CHUNK_SIZE, MAX_BARS_IN_MEMORY } from '@/utils/constants';

type CacheKey = string;

interface CacheEntry {
  bars: ChartBar[];
  anchorTime: number;
  loadedAt: number;
  touchedAt: number;
}

export interface WarmCacheFillOpts {
  /** Default 0.05 (interactive). Replay fill-ahead uses ~0.7. */
  aheadRatio?: number;
  /** Cap bars loaded (≤ MAX_BARS_IN_MEMORY). */
  windowBars?: number;
  /**
   * TF/symbol switch: wait for remote chunk top-up before returning so the
   * first click paints the new interval (not the previous candles).
   */
  awaitRemote?: boolean;
}

function key(datasetId: string, tf: Timeframe): CacheKey {
  return `${datasetId}|${tf}`;
}

const TF_FALLBACK_ORDER: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

/**
 * Entry cap — enough for 4 panes × (pane TF + base TF) + spare.
 * Do not raise without a memory check; prefer smaller windows over more entries.
 */
const MAX_ENTRIES = 16;

/** ~3.6 MB at ~120 B/bar — same order as the original 12×2500 budget. */
const MAX_CACHE_BYTES = 3_600_000;

/** Rough resident bytes assuming ~120 B per ChartBar object. */
function estimateBytes(bars: readonly ChartBar[]): number {
  return bars.length * 120;
}

export class WarmCache {
  private readonly store = new Map<CacheKey, CacheEntry>();
  private readonly inflight = new Map<CacheKey, number>();
  private readonly epochs = new Map<CacheKey, number>();
  /** Keys that must not be LRU-evicted (active pane series during play). */
  private readonly pinned = new Set<CacheKey>();

  clearDataset(datasetId: string): void {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${datasetId}|`)) {
        this.store.delete(k);
        this.pinned.delete(k);
        ledgerRelease('cacheEntries');
      }
    }
  }

  clear(): void {
    const n = this.store.size;
    this.store.clear();
    this.inflight.clear();
    this.pinned.clear();
    if (n > 0) ledgerRelease('cacheEntries', n);
  }

  /** Pin active dataset×TF keys so LRU cannot starve multi-pane play. */
  setPinned(keys: ReadonlyArray<{ datasetId: string; tf: Timeframe }>): void {
    this.pinned.clear();
    for (const { datasetId, tf } of keys) {
      this.pinned.add(key(datasetId, tf));
    }
  }

  stats(): { entries: number; bytes: number; pinned: number } {
    let bytes = 0;
    for (const e of this.store.values()) bytes += estimateBytes(e.bars);
    return { entries: this.store.size, bytes, pinned: this.pinned.size };
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
    opts?: WarmCacheFillOpts,
  ): Promise<ChartBar[]> {
    const k = key(datasetId, tf);
    const epoch = (this.epochs.get(k) ?? 0) + 1;
    this.epochs.set(k, epoch);
    this.inflight.set(k, epoch);

    try {
      // Default = full viewport budget (interactive pan). Replay fill-ahead
      // passes a smaller windowBars + higher aheadRatio (runway without RAM growth).
      const windowBars = Math.min(
        MAX_BARS_IN_MEMORY,
        Math.max(64, opts?.windowBars ?? MAX_BARS_IN_MEMORY),
      );

      // Always serve IDB first — never block replay/multi-pane on network.
      const vp = await loadViewportAroundTime(
        datasetId,
        tf,
        anchorTime,
        Math.min(MAX_BARS_IN_MEMORY, Math.max(span * 3, span + 64)),
        {
          aheadRatio: opts?.aheadRatio ?? 0.05,
          windowBars,
        },
      );
      if (this.epochs.get(k) !== epoch) return this.store.get(k)?.bars ?? [];
      const bars = vp.bars as ChartBar[];
      this.writeEntry(k, { bars, anchorTime, loadedAt: Date.now(), touchedAt: Date.now() });

      // Remote top-up when tip is short / empty. Interactive TF switches await
      // this so the first click does not keep painting the previous interval.
      const entry = getDataset(datasetId);
      if (!entry || entry.source === 'remote') {
        const tfSec = timeframeSeconds(tf);
        const tip = bars.length > 0 ? bars[bars.length - 1]!.time : null;
        const needAheadTo = anchorTime + Math.floor(windowBars * 0.55 * tfSec);
        const tipShort = tip == null || tip < needAheadTo - tfSec * 30;
        if (tipShort) {
          const fetchFrom = tip ?? anchorTime;
          const fetchTo = needAheadTo;
          const topUp = async (): Promise<ChartBar[]> => {
            try {
              const fetched = await ensureRemoteTimeCoverage(
                datasetId,
                tf,
                fetchFrom,
                fetchTo,
                {
                  maxBars: Math.min(CHUNK_SIZE, Math.max(500, windowBars)),
                },
              );
              scheduleRemoteChunkGc(datasetId, tf, anchorTime);
              if (!fetched || this.epochs.get(k) !== epoch) {
                return this.store.get(k)?.bars ?? bars;
              }
              // Reload from IDB without nesting another remote wait.
              return this.fill(datasetId, tf, anchorTime, span, {
                ...opts,
                awaitRemote: false,
              });
            } catch {
              return this.store.get(k)?.bars ?? bars;
            }
          };
          if (opts?.awaitRemote) {
            return topUp();
          }
          void topUp();
        } else {
          scheduleRemoteChunkGc(datasetId, tf, anchorTime);
        }
      }

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
    this.evict();
  }

  private totalBytes(): number {
    let bytes = 0;
    for (const e of this.store.values()) bytes += estimateBytes(e.bars);
    return bytes;
  }

  private evict(): void {
    while (this.store.size > MAX_ENTRIES || this.totalBytes() > MAX_CACHE_BYTES) {
      const victim = this.pickVictim();
      if (!victim) break;
      this.store.delete(victim);
      ledgerRelease('cacheEntries');
    }
  }

  /** Prefer unpinned LRU; only evict pinned if nothing else remains. */
  private pickVictim(): CacheKey | null {
    let oldestUnpinned: CacheKey | null = null;
    let oldestUnpinnedTouch = Infinity;
    let oldestAny: CacheKey | null = null;
    let oldestAnyTouch = Infinity;
    for (const [k, e] of this.store) {
      if (e.touchedAt < oldestAnyTouch) {
        oldestAnyTouch = e.touchedAt;
        oldestAny = k;
      }
      if (!this.pinned.has(k) && e.touchedAt < oldestUnpinnedTouch) {
        oldestUnpinnedTouch = e.touchedAt;
        oldestUnpinned = k;
      }
    }
    return oldestUnpinned ?? oldestAny;
  }
}

export const warmCache = new WarmCache();
