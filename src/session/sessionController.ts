import { bucketStart, timeframeSeconds } from '@/data/timeframeAgg';
import { barsMatchTimeframe } from '@/session/barTfGuard';
import {
  derivePaneAsync,
  derivePaneSync,
  truncateAtCursor,
} from '@/session/derivePane';
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
import { rangeRightAnchored } from '@/chart/rangeAnchor';

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

      // Prefetch only base + open pane TFs (other TFs load lazily on switch).
      const datasets = new Set(Object.values(args.panes).map((p) => p.datasetId));
      const tfs = new Set<Timeframe>([args.baseTf]);
      for (const p of Object.values(args.panes)) {
        tfs.add(p.tf);
        if (p.selectedTf) tfs.add(p.selectedTf);
      }
      await Promise.all(
        [...datasets].map((ds) =>
          warmCache.prefetchAll(ds, [...tfs], args.cursorTime, span),
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

    /** Update bar-count zoom only (no rederive) — keep Play/Pause from changing scale. */
    setSpan(span: number): void {
      if (!state) return;
      const nextSpan = Math.max(1, Math.min(MAX_BARS_IN_MEMORY, span));
      if (nextSpan === state.span) return;
      state = { ...state, span: nextSpan };
    },

    setActivePane(paneId: string): void {
      if (!state || !state.panes[paneId]) return;
      state = { ...state, activePaneId: paneId };
      notify();
    },

    /**
     * TF switch — fill the target series first, then derive/notify.
     * Avoids a blank frame that wiped candles when the new TF was not cached.
     */
    async setPaneTimeframe(paneId: string, tf: Timeframe): Promise<void> {
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
      const s = state;
      // Await remote chunks so the first TF click paints the new series.
      await warmCache.fill(s.panes[paneId]!.datasetId, tf, s.anchorTime, s.span, {
        awaitRemote: true,
      });
      if (!state) return;
      if (tf !== state.baseTf) {
        await warmCache.fill(
          state.panes[paneId]!.datasetId,
          state.baseTf,
          state.cursorTime,
          state.span,
          { awaitRemote: true },
        );
      }
      if (!state) return;
      rederiveSync();
      notify();
      // Second pass after any late IDB write (no remote wait).
      void rederiveAsync([paneId]);
    },

    /**
     * Symbol switch — prefetch new dataset before notify so panes do not go empty.
     */
    async setPaneSymbol(
      paneId: string,
      meta: { datasetId: string; pair: string },
      availableTfs: readonly Timeframe[],
    ): Promise<void> {
      if (!state) return;
      const pane = state.panes[paneId];
      if (!pane) return;
      if (pane.datasetId === meta.datasetId && pane.pair === meta.pair) return;
      const prevDs = pane.datasetId;
      const keepTf = pane.tf;
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
      const s = state;
      // Warm the active TF (+ base) before painting — await remote for first paint.
      await warmCache.fill(meta.datasetId, keepTf, s.anchorTime, s.span, {
        awaitRemote: true,
      });
      if (!state) return;
      if (keepTf !== state.baseTf) {
        await warmCache.fill(meta.datasetId, state.baseTf, state.cursorTime, state.span, {
          awaitRemote: true,
        });
      }
      if (!state) return;
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

    /**
     * When the wall-clock cursor walks a weekend/holiday gap but warm-cache
     * already has the next session bar, jump the clock forward (keep playing).
     */
    suggestGapJump(): number | null {
      if (!state || state.revealMode !== 'replay') return null;
      const gapSec = Math.max(
        6 * 60 * 60,
        timeframeSeconds(state.baseTf) * 200,
      );
      for (const id of Object.keys(state.panes)) {
        const cfg = state.panes[id];
        const view = views[id];
        if (!cfg || !view || view.bars.length === 0) continue;
        const last = view.bars[view.bars.length - 1]!.time;
        if (state.cursorTime - last < gapSec) continue;
        const raw = warmCache.peek(cfg.datasetId, cfg.tf);
        if (!raw || raw.length === 0) continue;
        let next = raw.find((b) => b.time >= state!.cursorTime);
        if (!next) next = raw.find((b) => b.time > last);
        if (next && next.time > state.cursorTime) {
          return next.time;
        }
      }
      return null;
    },

  };
}

export type SessionController = ReturnType<typeof createSessionController>;

/** Throttle IDB top-ups while the clock is advancing (one fill per dataset×tf). */
const fillAheadInflight = new Set<string>();
/** Latest cursor requested while a fill is in flight — chain another fill if set. */
const fillAheadPendingCursor = new Map<string, number>();

function scheduleFillAhead(
  datasetId: string,
  tf: Timeframe,
  cursorTime: number,
  span: number,
): void {
  const k = `${datasetId}|${tf}`;
  fillAheadPendingCursor.set(k, cursorTime);
  if (fillAheadInflight.has(k)) return;
  fillAheadInflight.add(k);
  void (async () => {
    try {
      // Drain pending targets so a slow fill at an old cursor cannot strand
      // the tip while the clock races ahead at 20×+.
      for (;;) {
        const target = fillAheadPendingCursor.get(k);
        if (target == null) break;
        fillAheadPendingCursor.delete(k);
        // Compact forward window: ~900 bars × 70% ahead ≈ 630-bar runway
        // (~30s at 21×) without holding a full 2500-bar entry per pair.
        await warmCache.fill(datasetId, tf, target, span, {
          aheadRatio: 0.7,
          windowBars: Math.min(900, Math.max(500, span * 6 + 200)),
        });
      }
    } finally {
      fillAheadInflight.delete(k);
      // A request may have landed between the last fill and delete.
      const late = fillAheadPendingCursor.get(k);
      if (late != null) {
        scheduleFillAhead(datasetId, tf, late, span);
      }
    }
  })();
}

/**
 * Advance revealed bars with the cursor.
 * Rebuilds from the correct TF cache each tick so a finer-TF placeholder can
 * never leave 1m residue on a 1D pane (play sawtooth / pause looks fine).
 */
function extendRevealInPlace(
  s: SessionState,
  views: Record<string, PaneView>,
): void {
  if (s.revealMode !== 'replay') return;

  // Pin active series so LRU cannot evict a live pane mid-play.
  const pinKeys: { datasetId: string; tf: Timeframe }[] = [];
  for (const cfg of Object.values(s.panes)) {
    pinKeys.push({ datasetId: cfg.datasetId, tf: cfg.tf });
    if (cfg.tf !== s.baseTf) {
      pinKeys.push({ datasetId: cfg.datasetId, tf: s.baseTf });
    }
  }
  warmCache.setPinned(pinKeys);

  for (const id of Object.keys(views)) {
    const cfg = s.panes[id];
    const view = views[id];
    if (!cfg || !view) continue;

    const tfPeriod = timeframeSeconds(cfg.tf);
    const rawPeek = warmCache.peek(cfg.datasetId, cfg.tf);
    const raw =
      rawPeek && barsMatchTimeframe(rawPeek, cfg.tf) ? rawPeek : null;
    const baseBars = warmCache.peek(cfg.datasetId, s.baseTf) ?? [];

    const openBucket = bucketStart(s.cursorTime, tfPeriod);
    const rawEnd = raw && raw.length > 0 ? raw[raw.length - 1]!.time : null;
    const aheadBars =
      rawEnd != null && tfPeriod > 0
        ? Math.floor((rawEnd - openBucket) / tfPeriod)
        : -1;
    // Top up before the tip freezes — high speed burns ~speed bars/sec.
    if (!raw || raw.length === 0 || aheadBars < Math.max(120, s.span)) {
      scheduleFillAhead(cfg.datasetId, cfg.tf, s.cursorTime, s.span);
      if (cfg.tf !== s.baseTf) {
        scheduleFillAhead(cfg.datasetId, s.baseTf, s.cursorTime, s.span);
      }
    }

    if (!raw || raw.length === 0) {
      // Keep last candles while the correct TF/ticker fills — never blank the pane.
      continue;
    }

    const rebuilt = truncateAtCursor(
      raw,
      s.cursorTime,
      cfg.tf,
      'replay',
      s.baseTf,
      baseBars,
    );

    const bars = view.bars as ChartBar[];
    bars.length = 0;
    for (let i = 0; i < rebuilt.length; i++) {
      const b = rebuilt[i]!;
      bars.push({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      });
    }

    if (bars.length === 0) {
      view.range = { fromIndex: 0, toIndex: 1 };
      continue;
    }

    view.range = rangeRightAnchored(bars.length - 1, Math.max(1, s.span));
  }
}
