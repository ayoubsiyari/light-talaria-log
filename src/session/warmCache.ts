/**
 * Warm cache — decoded viewport bars per dataset×TF.
 *
 * 1. Key shape: `${datasetId}|${tf}` — one viewport window per series.
 * 2. Caps: MAX_ENTRIES + MAX_CACHE_BYTES (first-rule: low browser memory).
 * 3. Eviction: LRU by `touchedAt`, never evict pinned (active pane) keys first.
 * 4. Miss: never blocks — returns [] or nearest *coarser* cached TF as placeholder
 *    and kicks async fill (epoch-guarded). Never returns a finer TF.
 * 5. Replay fill-ahead uses a compact forward-biased window (not a larger budget).
 * 6. On HTF miss/mismatch: aggregate from a finer cached/IDB series (M1→5m)
 *    so TF switch never sticks on the previous candles when packs are lazy.
 */
import { sanitizeChartBars } from '@/data/ohlcGuard';
import {
  inferDailySessionKind,
  usesSessionDaily,
} from '@/data/sessionDay';
import {
  aggregateChartBars,
  canAggregateFrom,
  timeframeSeconds,
} from '@/data/timeframeAgg';
import { loadViewportAroundTime } from '@/datasets/seriesViewport';
import { ledgerAcquire, ledgerRelease } from '@/dev/resourceLedger';
import { barsMatchTimeframe } from '@/session/barTfGuard';
import { mergeBarsByTime } from '@/session/mergeBarsByTime';
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
  /**
   * When true, do not roll up from a finer TF (packed reload after remote).
   * Default false — TF switch can paint HTF from M1 immediately.
   */
  skipAggregate?: boolean;
}

function key(datasetId: string, tf: Timeframe): CacheKey {
  return `${datasetId}|${tf}`;
}

const TF_FALLBACK_ORDER: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

/**
 * Entry cap — sized for 8 panes × (pane TF + base TF) + retained/order spare.
 * Pinned live keys are never evicted first; prefer compact fill windows over
 * unbounded growth (MAX_CACHE_BYTES still hard-caps resident bars).
 */
export const WARM_CACHE_MAX_ENTRIES = 28;

/**
 * ~5.4 MB at ~120 B/bar — headroom vs the old 16× budget without loading full
 * series. Eviction still prefers unpinned LRU.
 */
const MAX_CACHE_BYTES = 5_400_000;

/** @deprecated use WARM_CACHE_MAX_ENTRIES */
const MAX_ENTRIES = WARM_CACHE_MAX_ENTRIES;

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
  /**
   * Extra pins from the order engine (open/working symbols). Survive
   * `setPinned` so session reveal cannot drop a traded off-focus pair.
   */
  private readonly extraPinned = new Set<CacheKey>();

  clearDataset(datasetId: string): void {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${datasetId}|`)) {
        this.store.delete(k);
        this.pinned.delete(k);
        this.extraPinned.delete(k);
        ledgerRelease('cacheEntries');
      }
    }
  }

  clear(): void {
    const n = this.store.size;
    this.store.clear();
    this.inflight.clear();
    this.pinned.clear();
    this.extraPinned.clear();
    if (n > 0) ledgerRelease('cacheEntries', n);
  }

  /** Pin active dataset×TF keys so LRU cannot starve multi-pane play. */
  setPinned(keys: ReadonlyArray<{ datasetId: string; tf: Timeframe }>): void {
    this.pinned.clear();
    for (const { datasetId, tf } of keys) {
      this.pinned.add(key(datasetId, tf));
    }
  }

  /** Pin order-exposure series without clearing session pane pins. */
  pinExtra(keys: ReadonlyArray<{ datasetId: string; tf: Timeframe }>): void {
    this.extraPinned.clear();
    for (const { datasetId, tf } of keys) {
      this.extraPinned.add(key(datasetId, tf));
    }
  }

  stats(): { entries: number; bytes: number; pinned: number } {
    let bytes = 0;
    for (const e of this.store.values()) bytes += estimateBytes(e.bars);
    return {
      entries: this.store.size,
      bytes,
      pinned: this.pinned.size + this.extraPinned.size,
    };
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
      // passes windowBars + modest aheadRatio (history behind tip + short runway).
      const windowBars = Math.min(
        MAX_BARS_IN_MEMORY,
        Math.max(64, opts?.windowBars ?? MAX_BARS_IN_MEMORY),
      );

      // Always serve IDB first — never block replay/multi-pane on network.
      let bars: ChartBar[] = [];
      try {
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
        bars = vp.bars as ChartBar[];
      } catch {
        // No IDB (tests / private mode) — fall through to client aggregate.
        bars = [];
      }
      if (this.epochs.get(k) !== epoch) return this.store.get(k)?.bars ?? [];
      let usedClientAgg = false;

      let pair: string | null = null;
      try {
        const { getDataset } = await import('@/datasets/datasetStore');
        pair = getDataset(datasetId)?.pair ?? null;
      } catch {
        pair = null;
      }
      const dailyKind = inferDailySessionKind(pair);
      // Packed IDB/remote 1D is usually UTC midnight — prefer client session rollup
      // for FX/CME so Sunday open folds into Monday (TradingView-style).
      const preferSessionDailyAgg =
        tf === '1D' && usesSessionDaily(dailyKind) && !opts?.skipAggregate;

      // Packed HTF missing / wrong period under this key → roll up from finer TF.
      // Critical for lazy remote sessions (base+open only) e.g. NQ M1 → 5m click.
      if (
        preferSessionDailyAgg ||
        (!opts?.skipAggregate &&
          (bars.length === 0 || !barsMatchTimeframe(bars, tf)))
      ) {
        const aggregated = await this.aggregateFromFiner(
          datasetId,
          tf,
          anchorTime,
          span,
          windowBars,
          opts,
          epoch,
          pair,
        );
        if (this.epochs.get(k) !== epoch) return this.store.get(k)?.bars ?? [];
        if (aggregated && aggregated.length > 0) {
          bars = aggregated;
          usedClientAgg = true;
        }
      }

      this.writeEntry(k, {
        bars,
        anchorTime,
        loadedAt: Date.now(),
        touchedAt: Date.now(),
      });

      // Client-aggregated HTF already matches — paint immediately. Optionally
      // upgrade to a server pack in the background (never wipe agg on miss).
      // Do not upgrade session 1D with UTC packs — that reintroduces Sunday bars.
      if (
        usedClientAgg &&
        bars.length > 0 &&
        barsMatchTimeframe(bars, tf) &&
        !preferSessionDailyAgg
      ) {
        void this.tryUpgradePacked(
          datasetId,
          tf,
          anchorTime,
          span,
          windowBars,
          epoch,
        );
        return bars;
      }

      // Remote top-up when history and/or tip is short. Symbol switches onto a
      // higher TF often have empty IDB — fetching only *ahead* of the cursor
      // left replay truncate with a single forming candle.
      // Lazy imports keep unit tests free of UI/jsx datasetStore deps.
      const { getDataset } = await import('@/datasets/datasetStore');
      const { ensureRemoteTimeCoverage } = await import(
        '@/datasets/ingestRemoteChunks'
      );
      const { scheduleRemoteChunkGc } = await import('@/datasets/idbChunkGc');
      const entry = getDataset(datasetId);
      if (!entry || entry.source === 'remote') {
        const tfSec = timeframeSeconds(tf);
        const tip = bars.length > 0 ? bars[bars.length - 1]!.time : null;
        const first = bars.length > 0 ? bars[0]!.time : null;
        const historyBars = Math.max(
          span,
          64,
          Math.floor(windowBars * 0.4),
        );
        const historyNeedSec = historyBars * tfSec;
        const needAheadTo = anchorTime + Math.floor(windowBars * 0.55 * tfSec);
        const historyShort =
          first == null || first > anchorTime - historyNeedSec * 0.5;
        const tipShort = tip == null || tip < needAheadTo - tfSec * 30;
        if (historyShort || tipShort) {
          const fetchFrom = historyShort
            ? anchorTime - historyNeedSec
            : Math.min(tip ?? anchorTime, anchorTime);
          const fetchTo = tipShort
            ? needAheadTo
            : anchorTime + Math.max(tfSec * 2, Math.floor(span * 0.1 * tfSec));
          const topUp = async (): Promise<ChartBar[]> => {
            try {
              const fetched = await ensureRemoteTimeCoverage(
                datasetId,
                tf,
                fetchFrom,
                fetchTo,
                {
                  maxBars: Math.min(
                    CHUNK_SIZE,
                    Math.max(500, historyBars + Math.floor(windowBars * 0.55)),
                  ),
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
            // Cap wait so a slow/offline VPS cannot freeze TF switch or replay arm.
            const REMOTE_WAIT_MS = 8_000;
            return await Promise.race([
              topUp(),
              new Promise<ChartBar[]>((resolve) => {
                setTimeout(() => resolve(this.store.get(k)?.bars ?? bars), REMOTE_WAIT_MS);
              }),
            ]);
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

  /** Background: replace client-agg with packed HTF when the server has it. */
  private async tryUpgradePacked(
    datasetId: string,
    tf: Timeframe,
    anchorTime: number,
    span: number,
    windowBars: number,
    epoch: number,
  ): Promise<void> {
    const k = key(datasetId, tf);
    try {
      const { getDataset } = await import('@/datasets/datasetStore');
      const entry = getDataset(datasetId);
      if (entry && entry.source !== 'remote') return;
      const { ensureRemoteTimeCoverage } = await import(
        '@/datasets/ingestRemoteChunks'
      );
      const tfSec = timeframeSeconds(tf);
      const fetched = await ensureRemoteTimeCoverage(
        datasetId,
        tf,
        anchorTime - windowBars * tfSec,
        anchorTime + Math.max(tfSec * 2, Math.floor(span * 0.1 * tfSec)),
        { maxBars: Math.min(CHUNK_SIZE, Math.max(500, windowBars)) },
      );
      if (!fetched || this.epochs.get(k) !== epoch) return;
      const vp = await loadViewportAroundTime(
        datasetId,
        tf,
        anchorTime,
        Math.min(MAX_BARS_IN_MEMORY, Math.max(span * 3, span + 64)),
        { aheadRatio: 0.05, windowBars },
      );
      if (this.epochs.get(k) !== epoch) return;
      const packed = vp.bars as ChartBar[];
      if (packed.length === 0 || !barsMatchTimeframe(packed, tf)) return;
      this.writeEntry(k, {
        bars: packed,
        anchorTime,
        loadedAt: Date.now(),
        touchedAt: Date.now(),
      });
    } catch {
      /* keep client-aggregated bars */
    }
  }

  /**
   * Build `tf` by aggregating a finer series already in cache/IDB.
   * Prefers the finest available source (usually 1m).
   */
  private async aggregateFromFiner(
    datasetId: string,
    tf: Timeframe,
    anchorTime: number,
    span: number,
    windowBars: number,
    opts: WarmCacheFillOpts | undefined,
    targetEpoch: number,
    pair: string | null = null,
  ): Promise<ChartBar[] | null> {
    const k = key(datasetId, tf);
    const targetSec = timeframeSeconds(tf);
    // Finest → coarsest among sources strictly finer than target.
    const sources = TF_FALLBACK_ORDER.filter(
      (src) =>
        timeframeSeconds(src) < targetSec && canAggregateFrom(src, tf),
    );

      for (const src of sources) {
      if (this.epochs.get(k) !== targetEpoch) return null;
      const srcSec = timeframeSeconds(src);
      const srcWindow = Math.min(
        MAX_BARS_IN_MEMORY,
        Math.max(
          128,
          Math.ceil(windowBars * (targetSec / srcSec)) + 128,
        ),
      );

      let srcBars = this.peek(datasetId, src);
      const peekOk =
        srcBars != null &&
        srcBars.length >= 8 &&
        barsMatchTimeframe(srcBars, src);
      if (!peekOk) {
        srcBars = await this.fill(datasetId, src, anchorTime, span, {
          aheadRatio: opts?.aheadRatio ?? 0.05,
          windowBars: srcWindow,
          // Pull base from remote if needed so HTF agg can paint on first click.
          awaitRemote: opts?.awaitRemote === true,
        });
      }
      if (this.epochs.get(k) !== targetEpoch) return null;
      if (!srcBars || srcBars.length < 3) continue;
      if (!barsMatchTimeframe(srcBars, src)) continue;

      const aggregated = aggregateChartBars(srcBars, tf, {
        symbol: pair,
      });
      if (aggregated.length >= 2 && barsMatchTimeframe(aggregated, tf)) {
        return aggregated;
      }
    }
    return null;
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
      // Repair packed low=0 HTF before anything paints (ES 4h comb).
      bars: sanitizeChartBars(bars),
      anchorTime,
      loadedAt: Date.now(),
      touchedAt: Date.now(),
    });
  }

  /**
   * Union `bars` into the existing entry without dropping a newer tip.
   * Cold-start left-pad / pan history must not replace replay fill-ahead runway.
   */
  mergePut(
    datasetId: string,
    tf: Timeframe,
    bars: readonly ChartBar[],
    anchorTime: number,
  ): void {
    const prev = this.store.get(key(datasetId, tf))?.bars ?? [];
    this.put(
      datasetId,
      tf,
      mergeBarsByTime(prev, bars, MAX_BARS_IN_MEMORY),
      anchorTime,
    );
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
      const held = this.pinned.has(k) || this.extraPinned.has(k);
      if (!held && e.touchedAt < oldestUnpinnedTouch) {
        oldestUnpinnedTouch = e.touchedAt;
        oldestUnpinned = k;
      }
    }
    return oldestUnpinned ?? oldestAny;
  }
}

export const warmCache = new WarmCache();
