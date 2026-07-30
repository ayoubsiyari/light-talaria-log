import { bucketStart, timeframeSeconds } from '@/data/timeframeAgg';
import { derivePaneAsync, derivePaneSync } from '@/session/derivePane';
import type {
  PaneConfig,
  PaneView,
  RevealMode,
  SessionBounds,
  SessionState,
} from '@/session/sessionState';
import { warmCache } from '@/session/warmCache';
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

    /** Replay tick — cursor on base TF grid only. */
    setCursorTime(cursorTime: number, opts?: { follow?: boolean }): void {
      if (!state) return;
      const period = timeframeSeconds(state.baseTf);
      const snapped = bucketStart(cursorTime, period);
      const clamped = Math.min(state.bounds.end, Math.max(state.bounds.start, snapped));
      const follow = opts?.follow ?? state.playing;
      state = {
        ...state,
        cursorTime: clamped,
        anchorTime: follow ? clamped : state.anchorTime,
      };
      rederiveSync();
      notify();
      // Top up cache when cursor advances deep into window.
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
      const prevDs = pane.datasetId;
      state = {
        ...state,
        panes: {
          ...state.panes,
          [paneId]: { ...pane, datasetId: meta.datasetId, pair: meta.pair },
        },
      };
      if (prevDs !== meta.datasetId) warmCache.clearDataset(prevDs);
      rederiveSync();
      notify();
      void warmCache
        .prefetchAll(meta.datasetId, availableTfs, state.cursorTime, state.span)
        .then(() => rederiveAsync([paneId]));
    },

    replacePanes(panes: Record<string, PaneConfig>, activePaneId: string): void {
      if (!state) return;
      state = { ...state, panes: { ...panes }, activePaneId };
      rederiveSync();
      notify();
      void rederiveAsync();
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
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
