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
import { warmCache, type WarmCacheFillOpts } from '@/session/warmCache';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import {
  BUFFER_BARS,
  MAX_BARS_IN_MEMORY,
  REPLAY_VISIBLE_BARS,
} from '@/utils/constants';
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
  /** All session-leg dataset ids (order engine may step off-screen pairs). */
  retainedDatasets?: readonly string[];
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

  /** Redraw one pane only — keeps sibling cameras/bars when layout sync is off. */
  const rederivePaneSync = (paneId: string) => {
    if (!state) return;
    const v = derivePaneSync(state, paneId);
    if (v) views = { ...views, [paneId]: v };
    else {
      const next = { ...views };
      delete next[paneId];
      views = next;
    }
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
      const retainedDatasets = [
        ...new Set([
          ...(args.retainedDatasets ?? []),
          ...Object.values(args.panes).map((p) => p.datasetId),
        ]),
      ];
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
        retainedDatasets,
      };

      // Prefetch only base + open pane TFs (other TFs load lazily on switch).
      const datasets = new Set([
        ...Object.values(args.panes).map((p) => p.datasetId),
        ...retainedDatasets,
      ]);
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

    /**
     * Capture fill-size camera (anchor + span) without touching views.
     * Silent like setSpan — TF/symbol switch must not rederive sibling panes.
     */
    setCamera(anchorTime: number, span: number): void {
      if (!state) return;
      const nextSpan = Math.max(1, Math.min(MAX_BARS_IN_MEMORY, span));
      const clampedAnchor = Math.min(
        state.bounds.end,
        Math.max(state.bounds.start, anchorTime),
      );
      state = { ...state, anchorTime: clampedAnchor, span: nextSpan };
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
        // Base clock needs enough 1m bars to cover the higher-TF viewport
        // (span is in *pane* bars — 120×1h ≈ 7200×1m).
        const baseSpan = Math.min(
          MAX_BARS_IN_MEMORY,
          Math.max(
            state.span,
            Math.ceil(
              (state.span * timeframeSeconds(tf)) /
                timeframeSeconds(state.baseTf),
            ),
          ),
        );
        await warmCache.fill(
          state.panes[paneId]!.datasetId,
          state.baseTf,
          state.cursorTime,
          baseSpan,
          { awaitRemote: true },
        );
      }
      if (!state) return;
      rederivePaneSync(paneId);
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
      // Evict old symbol only when unused by panes AND not a retained session leg
      // (open orders still need that pair's bars while the chart shows another).
      if (prevDs !== meta.datasetId) {
        const stillUsed = Object.values(state.panes).some((p) => p.datasetId === prevDs);
        const retained = state.retainedDatasets.includes(prevDs);
        if (!stillUsed && !retained) warmCache.clearDataset(prevDs);
      }
      const s = state;
      // Warm the active TF (+ base) before painting — await remote for first paint.
      // Higher TF on a newly focused pair often has empty IDB; fill must pull
      // history *behind* the cursor (see warmCache historyShort) or replay
      // truncate leaves a single forming candle.
      await warmCache.fill(meta.datasetId, keepTf, s.anchorTime, s.span, {
        awaitRemote: true,
      });
      if (!state) return;
      if (keepTf !== state.baseTf) {
        const baseSpan = Math.min(
          MAX_BARS_IN_MEMORY,
          Math.max(
            state.span,
            Math.ceil(
              (state.span * timeframeSeconds(keepTf)) /
                timeframeSeconds(state.baseTf),
            ),
          ),
        );
        await warmCache.fill(meta.datasetId, state.baseTf, state.cursorTime, baseSpan, {
          awaitRemote: true,
        });
      }
      if (!state) return;
      rederivePaneSync(paneId);
      // Still sparse after first fill (slow remote) — one more awaited pass.
      const painted = views[paneId]?.bars.length ?? 0;
      if (painted < Math.min(8, Math.max(2, Math.floor(s.span * 0.05)))) {
        await warmCache.fill(meta.datasetId, keepTf, state.anchorTime, state.span, {
          awaitRemote: true,
        });
        if (!state) return;
        rederivePaneSync(paneId);
      }
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
      const datasets = new Set([
        ...Object.values(s.panes).map((p) => p.datasetId),
        ...s.retainedDatasets,
      ]);
      const tfs = new Set<Timeframe>([s.baseTf]);
      let coarsestSec = timeframeSeconds(s.baseTf);
      for (const p of Object.values(s.panes)) {
        tfs.add(p.tf);
        coarsestSec = Math.max(coarsestSec, timeframeSeconds(p.tf));
      }
      const clockOpts = formingClockFillOpts(s.baseTf, coarsestSec, s.span);
      await Promise.all(
        [...datasets].flatMap((ds) =>
          [...tfs].map((tf) =>
            warmCache.fill(
              ds,
              tf,
              s.cursorTime,
              s.span,
              tf === s.baseTf ? clockOpts : undefined,
            ),
          ),
        ),
      );
    },

    /** Fill caches + rederive (layout recovery / stuck multi-pane). */
    async refreshViews(paneIds?: string[]): Promise<void> {
      if (!state) return;
      await this.topUpCaches();
      if (!state) return;
      if (paneIds && paneIds.length > 0) {
        for (const id of paneIds) rederivePaneSync(id);
      } else {
        rederiveSync();
      }
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
/** Latest cursor + fill opts while a fill is in flight — chain another fill if set. */
const fillAheadPending = new Map<
  string,
  { cursorTime: number; span: number; opts: WarmCacheFillOpts }
>();

/**
 * Play fill window for the pane's own TF.
 * Must keep enough bars *behind* the cursor so right-anchored follow
 * (span + 10% pad) does not leave an empty left pad. Forward runway stays
 * modest — higher-TF forming still uses {@link formingClockFillOpts}.
 *
 * At high speed (20×–30×) a tip-heavy window races ahead and starves history
 * → huge empty left pad. Bias hard toward lookback.
 */
function paneRunwayFillOpts(span: number): WarmCacheFillOpts {
  const spanSafe = Math.max(1, span);
  // ~2× visible span of history + buffer; short forward runway only.
  const windowBars = Math.min(
    MAX_BARS_IN_MEMORY,
    Math.max(
      spanSafe * 2 + BUFFER_BARS + 200,
      spanSafe * 3 + 400,
      REPLAY_VISIBLE_BARS * 2 + BUFFER_BARS,
      1400,
    ),
  );
  const aheadBars = Math.min(160, Math.max(80, Math.floor(spanSafe * 0.75)));
  const aheadRatio = Math.min(0.12, aheadBars / windowBars);
  return { aheadRatio, windowBars };
}

/**
 * Base-TF (clock) window biased backward so a coarser pane's open bucket can be
 * formed tick-by-tick (1D needs ~1440×1m lookback — not a 70%-ahead tip window).
 */
function formingClockFillOpts(
  baseTf: Timeframe,
  coarsestPeriodSec: number,
  span: number,
): WarmCacheFillOpts {
  const baseSec = Math.max(1, timeframeSeconds(baseTf));
  const needBack = Math.ceil(coarsestPeriodSec / baseSec) + 64;
  const windowBars = Math.min(
    MAX_BARS_IN_MEMORY,
    Math.max(needBack + 160, span * 4 + 200, 500),
  );
  const aheadRatio = Math.min(0.15, 160 / windowBars);
  return { aheadRatio, windowBars };
}

function clockOverlapsBucket(
  clockBars: readonly ChartBar[],
  openBucket: number,
  cursorTime: number,
  periodSec: number,
): boolean {
  if (clockBars.length === 0 || cursorTime < openBucket) return false;
  const end = Math.min(cursorTime, openBucket + periodSec - 1);
  const first = clockBars[0]!.time;
  const last = clockBars[clockBars.length - 1]!.time;
  return first <= end && last >= openBucket;
}

function scheduleFillAhead(
  datasetId: string,
  tf: Timeframe,
  cursorTime: number,
  span: number,
  opts?: WarmCacheFillOpts,
): void {
  const k = `${datasetId}|${tf}`;
  const fillOpts = opts ?? paneRunwayFillOpts(span);
  fillAheadPending.set(k, { cursorTime, span, opts: fillOpts });
  if (fillAheadInflight.has(k)) return;
  fillAheadInflight.add(k);
  void (async () => {
    try {
      // Drain pending targets so a slow fill at an old cursor cannot strand
      // the tip while the clock races ahead at 20×+.
      for (;;) {
        const pending = fillAheadPending.get(k);
        if (pending == null) break;
        fillAheadPending.delete(k);
        await warmCache.fill(datasetId, tf, pending.cursorTime, pending.span, pending.opts);
      }
    } finally {
      fillAheadInflight.delete(k);
      // A request may have landed between the last fill and delete.
      const late = fillAheadPending.get(k);
      if (late != null) {
        scheduleFillAhead(datasetId, tf, late.cursorTime, late.span, late.opts);
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
  const coarsestSecByDs = new Map<string, number>();
  for (const cfg of Object.values(s.panes)) {
    pinKeys.push({ datasetId: cfg.datasetId, tf: cfg.tf });
    if (cfg.tf !== s.baseTf) {
      pinKeys.push({ datasetId: cfg.datasetId, tf: s.baseTf });
    }
    const sec = timeframeSeconds(cfg.tf);
    coarsestSecByDs.set(
      cfg.datasetId,
      Math.max(coarsestSecByDs.get(cfg.datasetId) ?? 0, sec),
    );
  }
  // Keep off-screen session legs warm for the order engine.
  for (const ds of s.retainedDatasets) {
    pinKeys.push({ datasetId: ds, tf: s.baseTf });
  }
  warmCache.setPinned(pinKeys);

  // One clock top-up per dataset (not per pane) — covers coarsest open bucket.
  const clockScheduled = new Set<string>();

  for (const id of Object.keys(views)) {
    const cfg = s.panes[id];
    const view = views[id];
    if (!cfg || !view) continue;

    const tfPeriod = timeframeSeconds(cfg.tf);
    const rawPeek = warmCache.peek(cfg.datasetId, cfg.tf);
    const raw =
      rawPeek && barsMatchTimeframe(rawPeek, cfg.tf) ? rawPeek : null;
    const basePeek = warmCache.peek(cfg.datasetId, s.baseTf);
    const baseBars =
      basePeek && barsMatchTimeframe(basePeek, s.baseTf) ? basePeek : [];

    const openBucket = bucketStart(s.cursorTime, tfPeriod);
    const rawEnd = raw && raw.length > 0 ? raw[raw.length - 1]!.time : null;
    const rawStart = raw && raw.length > 0 ? raw[0]!.time : null;
    const aheadBars =
      rawEnd != null && tfPeriod > 0
        ? Math.floor((rawEnd - openBucket) / tfPeriod)
        : -1;
    // How much history sits behind the open bucket — short lookback is what
    // paints the empty left pad under right-anchored follow.
    const behindBars =
      rawStart != null && tfPeriod > 0
        ? Math.floor((openBucket - rawStart) / tfPeriod)
        : -1;
    const needBehind = Math.max(s.span, REPLAY_VISIBLE_BARS);
    const needAhead = Math.max(120, s.span);
    // Top up when runway OR history is short — high speed burns both edges.
    if (
      !raw ||
      raw.length === 0 ||
      aheadBars < needAhead ||
      behindBars < needBehind
    ) {
      scheduleFillAhead(cfg.datasetId, cfg.tf, s.cursorTime, s.span);
    }

    // Higher-TF tip is built from base clock bars. Keep that window covering
    // the coarsest open bucket and the cursor tip (not just this pane's TF).
    if (cfg.tf !== s.baseTf && !clockScheduled.has(cfg.datasetId)) {
      const coarsest = coarsestSecByDs.get(cfg.datasetId) ?? tfPeriod;
      const coarseOpen = bucketStart(s.cursorTime, coarsest);
      const clockTip =
        baseBars.length > 0 ? baseBars[baseBars.length - 1]!.time : null;
      const clockBehind =
        clockTip == null ||
        clockTip < s.cursorTime - timeframeSeconds(s.baseTf) * 2;
      const needsClock =
        baseBars.length === 0 ||
        !clockOverlapsBucket(baseBars, coarseOpen, s.cursorTime, coarsest) ||
        clockBehind;
      if (needsClock) {
        scheduleFillAhead(
          cfg.datasetId,
          s.baseTf,
          s.cursorTime,
          s.span,
          formingClockFillOpts(s.baseTf, coarsest, s.span),
        );
        clockScheduled.add(cfg.datasetId);
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

  // Off-screen session legs (order engine) — keep base TF runway ahead of cursor.
  for (const ds of s.retainedDatasets) {
    if (Object.values(s.panes).some((p) => p.datasetId === ds)) continue;
    const peek = warmCache.peek(ds, s.baseTf);
    const tip = peek && peek.length > 0 ? peek[peek.length - 1]!.time : null;
    const period = timeframeSeconds(s.baseTf);
    const ahead =
      tip != null && period > 0
        ? Math.floor((tip - s.cursorTime) / period)
        : -1;
    if (!peek || peek.length === 0 || ahead < Math.max(120, s.span)) {
      scheduleFillAhead(ds, s.baseTf, s.cursorTime, s.span);
    }
  }
}
