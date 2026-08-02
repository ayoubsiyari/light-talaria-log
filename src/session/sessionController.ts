import { bucketStart, timeframeSeconds } from '@/data/timeframeAgg';
import { formBucketFromClock } from '@/replay/formingBars';
import { derivePaneAsync, derivePaneSync } from '@/session/derivePane';
import type {
  PaneConfig,
  PaneView,
  RevealMode,
  SessionBounds,
  SessionState,
} from '@/session/sessionState';
import { warmCache } from '@/session/warmCache';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { MAX_BARS_IN_MEMORY, REPLAY_VISIBLE_BARS } from '@/utils/constants';

export type SessionListener = (state: SessionState, views: Record<string, PaneView>) => void;

export interface CreateSessionArgs {
  baseTf: Timeframe;
  bounds: SessionBounds;
  panes: Record<string, PaneConfig>;
  activePaneId: string;
  cursorTime: number;
  availableTfs: readonly Timeframe[];
  revealMode?: RevealMode;
  span?: number;
}

/**
 * Plain TypeScript session controller — no React.
 * State transitions + derivation. App subscribes and pushes to engines.
 */
export function createSessionController() {
  let state: SessionState | null = null;
  let views: Record<string, PaneView> = {};
  const listeners = new Set<SessionListener>();
  /** Per-pane epoch for async loads. */
  const paneEpoch = new Map<string, number>();
  let globalEpoch = 0;

  const notify = () => {
    if (!state) return;
    for (const cb of listeners) cb(state, views);
  };

  const bumpPaneEpoch = (paneId: string) => {
    const n = (paneEpoch.get(paneId) ?? 0) + 1;
    paneEpoch.set(paneId, n);
    return n;
  };

  const rederiveSync = () => {
    if (!state) return;
    const next: Record<string, PaneView> = {};
    for (const id of Object.keys(state.panes)) {
      const v = derivePaneSync(state, id);
      if (v) next[id] = v;
    }
    views = next;
  };

  const rederiveAsync = async (paneIds?: string[]) => {
    if (!state) return;
    const ids = paneIds ?? Object.keys(state.panes);
    const myGlobal = ++globalEpoch;
    await Promise.all(
      ids.map(async (id) => {
        const epoch = bumpPaneEpoch(id);
        const s = state!;
        const v = await derivePaneAsync(s, id);
        if (!state || myGlobal !== globalEpoch) return;
        if (paneEpoch.get(id) !== epoch) return;
        if (v) views = { ...views, [id]: v };
      }),
    );
    if (myGlobal === globalEpoch) notify();
  };

  return {
    get(): SessionState | null {
      return state;
    },

    getViews(): Record<string, PaneView> {
      return views;
    },

    subscribe(cb: SessionListener): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async configure(args: CreateSessionArgs): Promise<void> {
      const span = Math.max(1, Math.min(args.span ?? REPLAY_VISIBLE_BARS, MAX_BARS_IN_MEMORY));
      state = {
        cursorTime: args.cursorTime,
        anchorTime: args.cursorTime,
        span,
        panes: { ...args.panes },
        activePaneId: args.activePaneId,
        revealMode: args.revealMode ?? 'replay',
        bounds: { ...args.bounds },
        baseTf: args.baseTf,
        playing: false,
      };

      // Prefetch all TFs for each dataset around cursor.
      const datasets = new Set(Object.values(args.panes).map((p) => p.datasetId));
      await Promise.all(
        [...datasets].map((ds) =>
          warmCache.prefetchAll(ds, args.availableTfs, args.cursorTime, span),
        ),
      );

      rederiveSync();
      await rederiveAsync();
      notify();
    },

    dispose(): void {
      state = null;
      views = {};
      listeners.clear();
      paneEpoch.clear();
      warmCache.clear();
    },

    setPlaying(playing: boolean): void {
      if (!state) return;
      state = { ...state, playing };
      notify();
    },

    setRevealMode(mode: RevealMode): void {
      if (!state) return;
      state = { ...state, revealMode: mode };
      rederiveSync();
      void rederiveAsync();
      notify();
    },

    /**
     * Replay tick — cursor on base TF grid only.
     * `react: false` (playback): mutate forming tip in place, no listener notify
     * (addendum §6 — must not drive React at frame rate).
     */
    setCursorTime(
      cursorTime: number,
      opts?: { follow?: boolean; react?: boolean },
    ): void {
      if (!state) return;
      const period = timeframeSeconds(state.baseTf);
      const snapped = bucketStart(cursorTime, period);
      const clamped = Math.min(state.bounds.end, Math.max(state.bounds.start, snapped));
      const follow = opts?.follow ?? state.playing;
      const react = opts?.react !== false;
      state = {
        ...state,
        cursorTime: clamped,
        anchorTime: follow ? clamped : state.anchorTime,
      };
      if (!react) {
        // Grow revealed bars as the cursor advances (1m append + higher-TF forming).
        // Only patching the tip left base-TF charts frozen after load-time truncate.
        extendRevealInPlace(state, views);
        return;
      }
      rederiveSync();
      notify();
      void this.topUpCaches();
    },

    /** Capture user pan/zoom into TF-invariant camera. */
    setCamera(anchorTime: number, span: number): void {
      if (!state) return;
      const nextSpan = Math.max(1, Math.min(MAX_BARS_IN_MEMORY, span));
      const clampedAnchor = Math.min(
        state.bounds.end,
        Math.max(state.bounds.start, anchorTime),
      );
      state = { ...state, anchorTime: clampedAnchor, span: nextSpan };
      rederiveSync();
      notify();
    },

    setActivePane(paneId: string): void {
      if (!state || !state.panes[paneId]) return;
      state = { ...state, activePaneId: paneId };
      notify();
    },

    /**
     * TF switch — single field change + sync derive from warm cache.
     * Async fill refreshes if cache was a placeholder.
     */
    setPaneTimeframe(paneId: string, tf: Timeframe): void {
      if (!state) return;
      const pane = state.panes[paneId];
      if (!pane) return;
      if (pane.tf === tf && pane.selectedTf === tf) return;

      state = {
        ...state,
        panes: {
          ...state.panes,
          [paneId]: { ...pane, tf, selectedTf: tf },
        },
      };
      // Right edge stays on cursor while in replay reveal (never look ahead).
      if (state.revealMode === 'replay') {
        state = {
          ...state,
          anchorTime: Math.min(state.anchorTime, state.cursorTime),
        };
      }
      rederiveSync();
      notify();
      void rederiveAsync([paneId]);
    },

    setPaneSymbol(
      paneId: string,
      meta: { datasetId: string; pair: string },
      availableTfs: readonly Timeframe[],
    ): void {
      if (!state) return;
      const pane = state.panes[paneId];
      if (!pane) return;
      if (pane.datasetId === meta.datasetId && pane.pair === meta.pair) return;
      const prevDs = pane.datasetId;
      state = {
        ...state,
        panes: {
          ...state.panes,
          [paneId]: { ...pane, datasetId: meta.datasetId, pair: meta.pair },
        },
      };
      // Right edge stays on cursor while in replay reveal (never look ahead).
      if (state.revealMode === 'replay') {
        state = {
          ...state,
          anchorTime: Math.min(state.anchorTime, state.cursorTime),
        };
      }
      // Evict old symbol only when no pane still references it (addendum §5).
      if (prevDs !== meta.datasetId) {
        const stillUsed = Object.values(state.panes).some((p) => p.datasetId === prevDs);
        if (!stillUsed) warmCache.clearDataset(prevDs);
      }
      rederiveSync();
      notify();
      void warmCache
        .prefetchAll(meta.datasetId, availableTfs, state.cursorTime, state.span)
        .then(() => rederiveAsync([paneId]));
    },

    /**
     * Swap pane set (layout change). Fills caches around the cursor first so
     * multi-pair panes are not empty/stuck until a later async race completes.
     */
    async replacePanes(
      panes: Record<string, PaneConfig>,
      activePaneId: string,
    ): Promise<void> {
      if (!state) return;
      state = { ...state, panes: { ...panes }, activePaneId };
      const s = state;
      const datasets = new Set(Object.values(s.panes).map((p) => p.datasetId));
      const tfs = new Set<Timeframe>([s.baseTf]);
      for (const p of Object.values(s.panes)) tfs.add(p.tf);
      await Promise.all(
        [...datasets].flatMap((ds) =>
          [...tfs].map((tf) => warmCache.fill(ds, tf, s.cursorTime, s.span)),
        ),
      );
      if (!state) return;
      rederiveSync();
      await rederiveAsync();
      notify();
    },

    /**
     * Sync pane configs from an external owner (e.g. zoom LOD) without rederiving.
     * React already holds the loaded bars for this path.
     */
    syncPaneConfigs(panes: Record<string, PaneConfig>): void {
      if (!state) return;
      state = { ...state, panes: { ...panes } };
    },

    async topUpCaches(): Promise<void> {
      if (!state) return;
      const s = state;
      const datasets = new Set(Object.values(s.panes).map((p) => p.datasetId));
      const tfs = new Set<Timeframe>([s.baseTf]);
      for (const p of Object.values(s.panes)) tfs.add(p.tf);
      await Promise.all(
        [...datasets].flatMap((ds) =>
          [...tfs].map((tf) => warmCache.fill(ds, tf, s.cursorTime, s.span)),
        ),
      );
    },

    /** Fill caches + rederive (layout recovery / stuck multi-pane). */
    async refreshViews(paneIds?: string[]): Promise<void> {
      if (!state) return;
      await this.topUpCaches();
      if (!state) return;
      rederiveSync();
      await rederiveAsync(paneIds);
      notify();
    },
  };
}

export type SessionController = ReturnType<typeof createSessionController>;

/**
 * Mutate each pane's bars array in place as cursor advances:
 * append newly closed buckets from warmCache + refresh forming tip.
 * Does not allocate a replacement array (addendum §3/§6).
 */
function extendRevealInPlace(
  s: SessionState,
  views: Record<string, PaneView>,
): void {
  if (s.revealMode !== 'replay') return;
  for (const id of Object.keys(views)) {
    const cfg = s.panes[id];
    const view = views[id];
    if (!cfg || !view) continue;

    const raw = warmCache.peek(cfg.datasetId, cfg.tf);
    if (!raw || raw.length === 0) continue;

    const tfPeriod = timeframeSeconds(cfg.tf);
    const openBucket = bucketStart(s.cursorTime, tfPeriod);
    const bars = view.bars as ChartBar[];
    const baseBars = warmCache.peek(cfg.datasetId, s.baseTf);

    // Drop tip at/after open bucket — rebuild from cache + forming.
    while (bars.length > 0 && bars[bars.length - 1]!.time >= openBucket) {
      bars.pop();
    }

    const lastTime = bars.length > 0 ? bars[bars.length - 1]!.time : Number.NEGATIVE_INFINITY;
    for (let i = 0; i < raw.length; i++) {
      const b = raw[i]!;
      if (b.time <= lastTime) continue;
      if (b.time >= openBucket) break;
      bars.push(b);
    }

    let forming: ChartBar | null = null;
    if (tfPeriod > timeframeSeconds(s.baseTf) && baseBars && baseBars.length > 0) {
      forming = formBucketFromClock(baseBars, openBucket, tfPeriod, s.cursorTime);
    } else {
      for (let i = 0; i < raw.length; i++) {
        const b = raw[i]!;
        if (b.time === openBucket && b.time <= s.cursorTime) {
          forming = b;
          break;
        }
        if (b.time > openBucket) break;
      }
    }

    if (forming) {
      bars.push({
        time: forming.time,
        open: forming.open,
        high: forming.high,
        low: forming.low,
        close: forming.close,
        volume: forming.volume,
      });
    }

    const toIndex = Math.max(0, bars.length - 1);
    // Keep span in index-space (exclusive toIndex style via +1 pad on right).
    const span = Math.max(1, s.span);
    const rightPad = Math.floor(span * 0.1);
    const rangeTo = toIndex + 1 + rightPad;
    view.range = { fromIndex: rangeTo - span, toIndex: rangeTo };
  }
}
