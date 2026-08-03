import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button } from '@heroui/react';
import {
  createChartSyncStore,
  getAppearance,
  patchAppearance,
  subscribeAppearance,
  type ChartSyncStore,
  type CrosshairMode,
  type CrosshairPoint,
  type DrawingPlacement,
  type SeriesType,
} from '@/chart';
import { DatasetsPage } from '@/components/dataset/DatasetsPage';
import { DrawingFloatingToolbar } from '@/components/drawings/DrawingFloatingToolbar';
import { DrawingSettingsModal } from '@/components/drawings/DrawingSettingsModal';
import { ChartSettingsModal } from '@/components/chart/ChartSettingsModal';
import { JournalPage } from '@/components/journal/JournalPage';
import { BottomBar } from '@/components/layout/BottomBar';
import { ChartGrid } from '@/components/layout/ChartGrid';
import { LeftToolbar } from '@/components/layout/LeftToolbar';
import { TopBar } from '@/components/layout/TopBar';
import { MarketingHome } from '@/components/landing/MarketingHome';
import { CreateSessionPage } from '@/components/session/CreateSessionPage';
import { saveJournalResult } from '@/journal/journalStore';
import { getSession, updateSessionProgress } from '@/sessions/sessionStore';
import { LoadingProgress } from '@/components/LoadingProgress';
import { PerfOverlay } from '@/components/perf/PerfOverlay';
import { getChart } from '@/chart';
/** Per-switch camera preserve: tip candle screen fraction + bar-count zoom. */
type LiveCamera = { anchorTime: number; span: number; tipRatio: number };
import {
  canAggregateFrom,
  timeframeSeconds,
} from '@/data/timeframeAgg';
import { createSessionController } from '@/session';
import { ledgerAssertTeardown } from '@/dev/resourceLedger';
import { warmCache } from '@/session/warmCache';
import {
  loadDrawings,
  saveDrawings,
  type Drawing,
  type DrawingPoint,
} from '@/drawings/drawingStore';
import { placeDrawingPoint } from '@/drawings/drawingInteraction';
import type { HitResult } from '@/drawings/hitTest';
import { magnetSnap } from '@/drawings/magnet';
import { getTool, TOOLS, type DrawingToolId } from '@/drawings/toolRegistry';
import { ensureDatasetIngested } from '@/datasets/ingestDataset';
import { resolveBaseDatasetsForSession } from '@/datasets/resolveBaseDataset';
import {
  clearBacktestResult,
  getBacktestState,
  setBacktestCancelled,
  setBacktestError,
  setBacktestResult,
  setBacktestRunning,
  subscribeBacktest,
} from '@/backtest/backtestStore';
import { cancelBacktest, runBacktest } from '@/backtest/runBacktestWorker';
import {
  createOrderSessionBridge,
  type OrderSessionBridge,
} from '@/orders/sessionBridge';
import { isTerminal } from '@/orders/orderTypes';
import {
  OrderTicket,
  type OrderLevelPatch,
  type OrderTicketDraft,
} from '@/components/orders/OrderTicket';
import { TradeDock, tradeDockCounts } from '@/components/orders/TradeDock';
import type { EnabledIndicator } from '@/types/indicator';
import { DEFAULT_BACKTEST_PARAMS } from '@/types/backtest';
import type { ChartOrder } from '@/types/order';
import { MAX_BACKTEST_BARS } from '@/utils/constants';
import {
  loadViewportAroundTime,
  loadViewportForTimeRange,
  paneNeedsViewportPrefetch,
  timeRangeFromVisible,
} from '@/datasets/seriesViewport';
import { pickLodTimeframe } from '@/datasets/zoomLod';
import { useCsvImport } from '@/hooks/useCsvImport';
import { createReplayController, type ReplayController } from '@/replay/replayStore';
import type { ChartBar } from '@/types/bar';
import type { SeriesCatalog } from '@/types/series';
import type { BacktestSession, PairSymbol } from '@/types/session';
import type { ChartPaneState } from '@/types/pane';
import { DEFAULT_LAYOUT_SYNC, type LayoutSyncOptions } from '@/types/layout';
import { paneCountForLayout } from '@/types/pane';
import type { BottomTabId, ChartLayout, ChartToolId, Timeframe } from '@/types/ui';
import { debounce } from '@/utils/debounce';
import {
  LOD_DEBOUNCE_MS,
  MAX_BARS_IN_MEMORY,
  REPLAY_VISIBLE_BARS,
} from '@/utils/constants';
import {
  formatAppRoute,
  parseAppRoute,
  type AppView,
} from '@/navigation/appRoute';

/** Throttle localStorage writes while replay is playing. */
const REPLAY_PROGRESS_SAVE_MS = 2500;

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

function bootRoute(): { view: AppView; journalSessionId: string | null } {
  const route = parseAppRoute();
  if (route.view === 'chart') {
    // Chart restore runs after loadSessionData is ready; keep view=chart.
    return { view: route.sessionId ? 'chart' : 'sessions', journalSessionId: null };
  }
  if (route.view === 'journal') {
    return { view: 'journal', journalSessionId: route.sessionId };
  }
  return { view: route.view, journalSessionId: null };
}

interface PaneSeries {
  pair: PairSymbol;
  datasetId: string;
  catalog: SeriesCatalog;
}

const SUGGESTED_PANE_TFS: Timeframe[] = ['1m', '5m', '15m', '1h'];

function isDrawingTool(tool: ChartToolId): tool is DrawingToolId {
  return tool !== 'cursor' && tool !== 'zoom' && tool in TOOLS;
}

function dateToUnix(date: string, endOfDay: boolean): number {
  const iso = endOfDay ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
  return Math.floor(Date.parse(iso) / 1000);
}

function intersectTimeframes(series: readonly PaneSeries[]): Timeframe[] {
  if (series.length === 0) return [];
  const first = series[0]!.catalog.timeframes;
  return first.filter((tf) => series.every((s) => s.catalog.timeframes.includes(tf)));
}

function replayBounds(
  session: BacktestSession,
  series: readonly PaneSeries[],
): { timeStart: number; timeEnd: number } {
  const sessionStart = dateToUnix(session.startDate, false);
  const sessionEnd = dateToUnix(session.endDate, true);
  let timeStart = Math.max(sessionStart, ...series.map((s) => s.catalog.timeStart));
  let timeEnd = Math.min(sessionEnd, ...series.map((s) => s.catalog.timeEnd));
  if (timeStart > timeEnd) {
    timeStart = Math.min(...series.map((s) => s.catalog.timeStart));
    timeEnd = Math.max(...series.map((s) => s.catalog.timeEnd));
  }
  return { timeStart, timeEnd };
}

export default function App() {
  const { state, importCsv } = useCsvImport();
  const importing = state.status === 'importing';

  const boot = useMemo(() => bootRoute(), []);
  const [view, setView] = useState<AppView>(boot.view);
  const [journalSessionId, setJournalSessionId] = useState<string | null>(
    boot.journalSessionId,
  );
  /** Ignore hashchange triggered by our own URL sync. */
  const suppressHashRef = useRef(false);
  const [session, setSession] = useState<BacktestSession | null>(null);
  const [catalog, setCatalog] = useState<SeriesCatalog | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ingestPct, setIngestPct] = useState(0);

  const [panes, setPanes] = useState<ChartPaneState[]>([]);
  const [activePaneId, setActivePaneId] = useState('pane-0');

  const [activeTool, setActiveTool] = useState<ChartToolId>('cursor');
  const [activeTab, setActiveTab] = useState<BottomTabId>('all');
  const [seriesType, setSeriesType] = useState<SeriesType>(
    () => getAppearance().seriesType,
  );
  const [crosshairMode, setCrosshairMode] = useState<CrosshairMode>(
    () => getAppearance().crosshairMode,
  );
  const [showVolume, setShowVolume] = useState(() => getAppearance().showVolume);
  const [volumeOpacity, setVolumeOpacity] = useState(
    () => getAppearance().volumeOpacity,
  );
  const [enabledIndicators, setEnabledIndicators] = useState<EnabledIndicator[]>([]);
  const [orders, setOrders] = useState<ChartOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderEngineTick, setOrderEngineTick] = useState(0);
  const [lastOrderReject, setLastOrderReject] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketDraft, setTicketDraft] = useState<OrderTicketDraft | null>(null);
  const [ticketLevelPatch, setTicketLevelPatch] = useState<{
    kind: 'entry' | 'sl' | 'tp';
    price: number;
  } | null>(null);
  const orderBridgeRef = useRef<OrderSessionBridge | null>(null);
  const stepOrderEngineRef = useRef<(cursorTime: number) => void>(() => {});
  void orderEngineTick;
  const [backtestTick, setBacktestTick] = useState(0);
  const [chartLayout, setChartLayout] = useState<ChartLayout>('1');
  const [layoutSync, setLayoutSync] = useState<LayoutSyncOptions>(DEFAULT_LAYOUT_SYNC);
  const layoutSyncRef = useRef(layoutSync);
  layoutSyncRef.current = layoutSync;

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draftPoints, setDraftPoints] = useState<DrawingPoint[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [magnet, setMagnet] = useState(false);
  const [stayInDrawingMode, setStayInDrawingMode] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [replayTick, setReplayTick] = useState(0);
  const freehandActiveRef = useRef(false);
  /** Coalesce freehand point appends to one React update per frame. */
  const freehandRafRef = useRef(0);
  const pendingFreehandRef = useRef<DrawingPoint | null>(null);

  const syncStoreRef = useRef<ChartSyncStore | null>(null);
  const replayRef = useRef<ReplayController>(createReplayController());
  const sessionRef = useRef(createSessionController());
  const panesRef = useRef<ChartPaneState[]>([]);
  panesRef.current = panes;
  /** Per-pair ingested catalogs for the open session. */
  const seriesRef = useRef<PaneSeries[]>([]);
  /** Blocks replay/sync viewport reloads during session ingest + first paint. */
  const viewportReloadEnabledRef = useRef(false);
  const lastReplayCursorRef = useRef<number | null>(null);
  /**
   * Legacy replay buffers — retained as a safety net for pan LOD path until
   * applyTimeWindowToPanes is fully session-owned. Reveal/TF paths use session.
   */
  const replayBufferRef = useRef<Map<string, ChartBar[]>>(new Map());
  /** Invalidates in-flight pan/zoom IDB window refills (edge prefetch). */
  const prefetchGenRef = useRef(0);
  /** User pan/zoom during play detaches camera follow (stops fighting the drag). */
  const [cameraDetached, setCameraDetached] = useState(false);
  const cameraDetachedRef = useRef(false);
  cameraDetachedRef.current = cameraDetached;
  /** Per-pane follow detach — panning one chart must not freeze the others. */
  const detachedPanesRef = useRef(new Set<string>());
  /**
   * Last TF/pair switch camera: keep tip candle at the same horizontal fraction
   * and the same bar-count zoom after derive (incl. async warm-cache fills).
   */
  const cameraPreserveRef = useRef<LiveCamera | null>(null);
  /** Open session id for progress persist (survives teardown order). */
  const sessionIdRef = useRef<string | null>(null);
  const lastProgressSaveRef = useRef(0);

  /** Push session PaneViews into React pane state (preserves pane order). */
  const commitSessionViews = useCallback(() => {
    const views = sessionRef.current.getViews();
    const s = sessionRef.current.get();
    if (!s) return;
    setPanes((prev) => {
      const ids = prev.length > 0 ? prev.map((p) => p.id) : Object.keys(s.panes);
      const next: ChartPaneState[] = [];
      for (const id of ids) {
        const v = views[id];
        const cfg = s.panes[id];
        const old = prev.find((p) => p.id === id);
        if (!v || !cfg) {
          if (old) next.push(old);
          continue;
        }
        next.push({
          id,
          timeframe: v.timeframe,
          selectedTf: v.selectedTf,
          bars: v.bars,
          range: v.range,
          windowFrom: old?.windowFrom ?? 0,
          totalBars: old?.totalBars ?? v.bars.length,
          pair: v.pair as PairSymbol,
          datasetId: v.datasetId,
        });
      }
      panesRef.current = next;
      return next;
    });
  }, []);

  /**
   * Imperative engine sync after TF/pair switch.
   * Required during replay: useChart skips React bar props while replayFollow is on.
   * Restores captured tipRatio + span so the last candle and zoom stay put.
   */
  const syncEnginesFromSession = useCallback(() => {
    const s = sessionRef.current.get();
    const views = sessionRef.current.getViews();
    if (!s) return;
    const replay = replayRef.current.get();
    const cursor = replay.cursorTime;
    const preserved = cameraPreserveRef.current;
    const span = Math.max(10, preserved?.span ?? s.span);
    // Default ≈ rangeRightAnchored tip placement when no capture exists.
    const tipRatio = preserved?.tipRatio ?? 0.9;

    for (const pane of panesRef.current) {
      const chart = getChart(pane.id);
      const v = views[pane.id];
      if (!chart || !v || v.bars.length === 0) continue;

      const tipTime = Number.isFinite(cursor)
        ? cursor
        : v.bars[v.bars.length - 1]!.time;
      chart.syncReplayReveal(v.bars, tipTime);

      const tipIndex = v.bars.length - 1;
      const fromIndex = tipIndex - tipRatio * span;
      chart.setVisibleRange(fromIndex, fromIndex + span, { silent: true });

      if (replay.playing && !detachedPanesRef.current.has(pane.id)) {
        chart.setReplayFollow(true);
      }
    }
  }, []);

  /** Capture live zoom + tip position from the engine (not stale React pane.bars). */
  const captureLiveCamera = useCallback(
    (paneId: string): LiveCamera => {
      const pane = panesRef.current.find((p) => p.id === paneId);
      const engine = getChart(paneId);
      const liveRange = engine?.getVisibleRange() ?? pane?.range ?? { fromIndex: 0, toIndex: 120 };
      const span = Math.max(10, liveRange.toIndex - liveRange.fromIndex);
      const bars = engine?.getBars() ?? pane?.bars ?? [];
      const replay = replayRef.current.get();
      const cursor = replay.cursorTime;
      const tipIndex = Math.max(0, bars.length - 1);
      // Where the tip candle sits in the viewport (0 = left, 1 = right).
      const tipRatio = Math.max(
        0,
        Math.min(1.2, (tipIndex - liveRange.fromIndex) / span),
      );

      // While following replay, the tip time IS the cursor (last revealed candle).
      const following =
        replay.playing && !detachedPanesRef.current.has(paneId);
      let anchorTime: number;
      if (following && Number.isFinite(cursor)) {
        anchorTime = cursor;
      } else {
        const tr = bars.length > 0 ? timeRangeFromVisible(bars, liveRange) : null;
        anchorTime =
          tr?.toTime ??
          bars[bars.length - 1]?.time ??
          (Number.isFinite(cursor) ? cursor : (catalog?.timeEnd ?? 0));
        if (Number.isFinite(cursor)) {
          anchorTime = Math.min(anchorTime, cursor);
        }
      }
      return { anchorTime, span, tipRatio };
    },
    [catalog?.timeEnd],
  );

  const availableTimeframes = useMemo(() => {
    if (seriesRef.current.length > 0) return intersectTimeframes(seriesRef.current);
    return catalog?.timeframes ?? [];
  }, [catalog?.datasetId, catalog?.timeframes, panes.length]);

  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0] ?? null;
  /** Active pane symbol only (TV-style pill) — switch via SymbolPicker. */
  const topSymbol = activePane?.pair ?? session?.pair ?? '';
  const symbolOptions = session?.legs.map((l) => ({ pair: l.pair })) ?? [];

  const syncStore = useMemo(() => {
    const first = panes[0];
    const initial =
      first && first.bars.length > 0
        ? timeRangeFromVisible(first.bars, first.range)
        : null;
    const store = createChartSyncStore(initial);
    syncStoreRef.current = store;
    return store;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog?.datasetId, catalog?.timeEnd, session?.id]);

  /** Engine paints rubber-band / freehand preview — no React setState per pointer move. */
  const placement = useMemo((): DrawingPlacement | null => {
    if (!isDrawingTool(activeTool)) return null;
    return {
      tool: activeTool,
      points: draftPoints,
      freehandActive: freehandActiveRef.current,
    };
  }, [activeTool, draftPoints]);

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) ?? null;

  const persistDrawings = useCallback(
    (next: Drawing[]) => {
      setDrawings(next);
      if (session && catalog) {
        saveDrawings(`${session.id}:${catalog.datasetId}`, next);
      }
    },
    [session, catalog],
  );

  const replayState = replayRef.current.get();
  void replayTick;

  const paneFromViewport = useCallback(
    (
      id: string,
      tf: Timeframe,
      vp: Awaited<ReturnType<typeof loadViewportAroundTime>>,
      pair: PairSymbol,
      datasetId: string,
      selectedTf?: Timeframe,
    ): ChartPaneState => ({
      id,
      timeframe: tf,
      selectedTf: selectedTf ?? tf,
      bars: vp.bars,
      range: vp.range,
      windowFrom: vp.windowFrom,
      totalBars: vp.totalBars,
      pair,
      datasetId,
    }),
    [],
  );

  const seriesForPane = useCallback((pane: Pick<ChartPaneState, 'datasetId' | 'pair'>) => {
    return (
      seriesRef.current.find((s) => s.datasetId === pane.datasetId) ??
      seriesRef.current.find((s) => s.pair === pane.pair) ??
      seriesRef.current[0] ??
      null
    );
  }, []);

  const buildPane = useCallback(
    async (
      id: string,
      tf: Timeframe,
      anchorTime: number | null,
      meta: { pair: PairSymbol; datasetId: string },
      /** Explicit user pick — becomes LOD floor. Defaults to `tf`. */
      selectedTf?: Timeframe,
    ) => {
      const series = seriesForPane(meta);
      if (!series) return null;
      const cat = series.catalog;
      const floor = selectedTf ?? tf;
      if (!canAggregateFrom(cat.baseTf, floor) && floor !== cat.baseTf) return null;
      const sync = syncStoreRef.current?.get().timeRange;
      const available = cat.timeframes;
      let loadTf = floor;
      if (sync) {
        loadTf = pickLodTimeframe({
          windowSec: Math.max(0, sync.toTime - sync.fromTime),
          selectedTf: floor,
          available,
          currentTf: floor,
        });
      }
      const vp = sync
        ? await loadViewportForTimeRange(
            series.datasetId,
            loadTf,
            sync.fromTime,
            sync.toTime,
          )
        : await loadViewportAroundTime(series.datasetId, loadTf, anchorTime);
      if (vp.bars.length === 0) return null;
      return paneFromViewport(id, loadTf, vp, series.pair, series.datasetId, floor);
    },
    [paneFromViewport, seriesForPane],
  );

  const pickTfForPaneIndex = useCallback(
    (index: number, fallback: Timeframe): Timeframe => {
      const available =
        seriesRef.current.length > 0
          ? intersectTimeframes(seriesRef.current)
          : (catalog?.timeframes ?? [fallback]);
      const suggested = SUGGESTED_PANE_TFS[index];
      if (suggested && available.includes(suggested)) return suggested;
      if (available.includes(fallback)) return fallback;
      return available[0] ?? fallback;
    },
    [catalog],
  );

  /**
   * Clock grid = dataset base TF; advance rate = focused pane's selected TF.
   * Changing another pane's interval must not alter step semantics for others.
   */
  const syncReplayClockTf = useCallback((paneList?: readonly ChartPaneState[]) => {
    const list = paneList ?? panesRef.current;
    const base = catalog?.baseTf ?? '1m';
    replayRef.current.setBaseTf(base);
    const focused =
      list.find((p) => p.id === activePaneId) ?? list[0] ?? null;
    if (focused) {
      replayRef.current.setRateTf(focused.selectedTf ?? focused.timeframe);
    }
  }, [activePaneId, catalog?.baseTf]);

  /**
   * Pan/zoom IDB refill + zoom LOD:
   * - Mid-buffer sync ticks skip IDB (engines already remapped via chart sync).
   * - Near buffer edge → refetch same TF (Step 9).
   * - Zoom density → switch to coarser/finer pre-agg TF (≥ selectedTf floor).
   * Generation-token guarded; wall-clock window preserved across TF switches.
   */
  const applyTimeWindowToPanes = useCallback(
    async (fromTime: number, toTime: number) => {
      if (!catalog || !viewportReloadEnabledRef.current) return;
      const current = panesRef.current;
      if (current.length === 0) return;

      const windowSec = Math.max(0, toTime - fromTime);
      const lodTfs = current.map((p) => {
        const series = seriesForPane(p);
        const available = series?.catalog.timeframes ?? [p.timeframe];
        const floor = p.selectedTf ?? p.timeframe;
        return pickLodTimeframe({
          windowSec,
          selectedTf: floor,
          available,
          currentTf: p.timeframe,
        });
      });

      const needsFetch = current.map((p, i) => {
        if (lodTfs[i] !== p.timeframe) return true;
        return paneNeedsViewportPrefetch(p, fromTime, toTime);
      });
      if (!needsFetch.some(Boolean)) return;

      const gen = ++prefetchGenRef.current;

      const updated = await Promise.all(
        current.map(async (p, i) => {
          if (!needsFetch[i]) return p; // keep buffer + identity — no React churn

          const loadTf = lodTfs[i]!;
          const vp = await loadViewportForTimeRange(
            p.datasetId,
            loadTf,
            fromTime,
            toTime,
          );
          if (vp.bars.length === 0) return p; // keep previous window
          // Remap camera from the same wall-clock window (fractional) so buffer
          // reloads / LOD switches don't snap; keep prior range if remap is degenerate.
          const next = paneFromViewport(
            p.id,
            loadTf,
            vp,
            p.pair,
            p.datasetId,
            p.selectedTf ?? p.timeframe,
          );
          if (next.range.toIndex <= next.range.fromIndex) {
            return { ...next, range: p.range };
          }
          return next;
        }),
      );

      if (gen !== prefetchGenRef.current) return; // stale prefetch / LOD
      if (!viewportReloadEnabledRef.current) return;
      const tfChanged = updated.some(
        (p, i) => p.timeframe !== current[i]!.timeframe,
      );
      panesRef.current = updated;
      setPanes(updated);
      // Keep session pane TFs in sync when zoom LOD mutates effective timeframe.
      // No rederive — React already holds the LOD-loaded bars.
      const sess = sessionRef.current.get();
      if (sess) {
        const nextCfgs = { ...sess.panes };
        for (const p of updated) {
          const prev = nextCfgs[p.id];
          if (!prev) continue;
          nextCfgs[p.id] = {
            ...prev,
            tf: p.timeframe,
            selectedTf: p.selectedTf ?? prev.selectedTf,
          };
        }
        sessionRef.current.syncPaneConfigs(nextCfgs);
      }
      if (tfChanged) syncReplayClockTf(updated);
    },
    [catalog, paneFromViewport, seriesForPane, syncReplayClockTf],
  );

  /** Save replay cursor (+ zoom) so exit/refresh → reopen resumes mid-session. */
  const persistReplayProgress = useCallback((force = false) => {
    const id = sessionIdRef.current;
    if (!id) return;
    if (!force && !viewportReloadEnabledRef.current) return;
    const now = Date.now();
    if (!force && now - lastProgressSaveRef.current < REPLAY_PROGRESS_SAVE_MS) return;
    const rs = replayRef.current.get();
    if (!Number.isFinite(rs.cursorTime) || rs.cursorTime <= 0) return;
    const sess = sessionRef.current.get();
    lastProgressSaveRef.current = now;
    const updated = updateSessionProgress(id, {
      cursorTime: rs.cursorTime,
      span: sess?.span,
    });
    // Never setState while playing — App re-renders reset chrome / fight DOM scrub.
    if (updated && (force || !rs.playing)) {
      setSession((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev));
    }
  }, []);

  /**
   * Replay tick → session cursor (base TF grid).
   * During playback: no React (addendum §6) — engines + DOM only.
   * Discrete pause/seek: full derive + commitSessionViews.
   */
  const applyReplayReveal = useCallback(
    (cursorTime: number, opts?: { playEdge?: boolean }) => {
      if (!catalog || !viewportReloadEnabledRef.current) return;
      if (!sessionRef.current.get()) return;
      const playing = replayRef.current.get().playing;
      const follow = playing && !cameraDetachedRef.current;

      if (playing) {
        sessionRef.current.setCursorTime(cursorTime, { follow, react: false });
        // Step order engine on every base bar the cursor passes (§4.1).
        stepOrderEngineRef.current(cursorTime);
        const views = sessionRef.current.getViews();
        if (opts?.playEdge) detachedPanesRef.current.clear();

        for (const pane of panesRef.current) {
          const chart = getChart(pane.id);
          if (!chart) continue;
          const v = views[pane.id];
          const paneDetached = detachedPanesRef.current.has(pane.id);

          // Keep follow alive on every tick for panes the user hasn't panned.
          // (React props alone are not enough after layout changes mid-play.)
          if (!paneDetached) {
            chart.setReplayFollow(true);
          }

          if (v && v.bars.length > 0) {
            // Append/patch revealed bars as cursor advances.
            // Follow uses the same right-anchored camera as pause (no Play jump).
            chart.syncReplayReveal(v.bars, cursorTime);
          } else {
            // Cache/view not ready — advance paint mask on whatever the engine has.
            chart.setReplayCursorTime(cursorTime);
          }

          if (opts?.playEdge && v && v.bars.length > 0 && !paneDetached) {
            // Ensure zoom is not a collapsed 1-bar window after a cold start.
            const span = Math.max(10, sessionRef.current.get()?.span ?? 120);
            const live = chart.getVisibleRange();
            const liveSpan = live.toIndex - live.fromIndex;
            if (liveSpan < 10) {
              const anchor = Math.max(0, v.bars.length - 1);
              const rightPad = Math.floor(span * 0.1);
              const toIndex = anchor + 1 + rightPad;
              chart.setVisibleRange(toIndex - span, toIndex, { silent: true });
            }
          }
        }
        // Chrome scrubber / label — direct DOM, not useState
        const rs = replayRef.current.get();
        const label = document.getElementById('replay-cursor-label');
        if (label) {
          const d = new Date(cursorTime * 1000);
          const pad = (n: number) => String(n).padStart(2, '0');
          label.textContent = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        const scrub = document.getElementById('replay-scrub') as HTMLInputElement | null;
        if (scrub) {
          const span = Math.max(1, rs.endTime - rs.startTime);
          const progress = Math.min(1, Math.max(0, (cursorTime - rs.startTime) / span));
          scrub.value = String(Math.round(progress * 1000));
        }
        return;
      }

      // Lock session.span to the live engine zoom so pause commit uses the same
      // right-anchored window Play was following (no scale jump).
      const focus =
        panesRef.current.find((p) => p.id === activePaneId) ?? panesRef.current[0];
      const live = focus ? getChart(focus.id)?.getVisibleRange() : null;
      if (live) {
        sessionRef.current.setSpan(
          Math.max(10, live.toIndex - live.fromIndex),
        );
      }
      sessionRef.current.setCursorTime(cursorTime, { follow, react: true });
      stepOrderEngineRef.current(cursorTime);
      commitSessionViews();
    },
    [activePaneId, catalog, commitSessionViews],
  );

  const syncOrdersFromBridge = useCallback(() => {
    const bridge = orderBridgeRef.current;
    const sessId = sessionIdRef.current;
    if (!bridge || !sessId) return;
    const next = bridge.toChartOrders(sessId);
    setOrders(next);
    setLastOrderReject(bridge.getLastReject());
    setOrderEngineTick((n) => n + 1);
  }, []);

  const lastOrderChromeAtRef = useRef(0);
  stepOrderEngineRef.current = (cursorTime: number) => {
    const bridge = orderBridgeRef.current;
    const sess = sessionRef.current.get();
    if (!bridge || !sess) return;
    const ds =
      panesRef.current.find((p) => p.id === activePaneId)?.datasetId ??
      panesRef.current[0]?.datasetId;
    if (!ds) return;
    bridge.advanceTo(cursorTime, (fromExclusive, toInclusive) => {
      const raw = warmCache.peek(ds, sess.baseTf) ?? [];
      const out: ChartBar[] = [];
      for (const b of raw) {
        if (b.time <= fromExclusive) continue;
        if (b.time > toInclusive) break;
        if (b.time > cursorTime) break;
        out.push(b);
      }
      return out;
    });
    // Always refresh chart projection — levels stay until SL/TP close, P&L marks each bar.
    // Draft ticket is React-driven while paused; play disables the ticket.
    const chartOrders = bridge.toChartOrders(sessionIdRef.current ?? '');
    for (const pane of panesRef.current) {
      getChart(pane.id)?.setOrders(chartOrders, selectedOrderId);
    }
    if (!replayRef.current.get().playing) {
      syncOrdersFromBridge();
      return;
    }
    // Throttle BottomBar / TradeDock equity+P&L while playing (avoid chrome fight).
    const now = performance.now();
    if (now - lastOrderChromeAtRef.current >= 200) {
      lastOrderChromeAtRef.current = now;
      setOrders(chartOrders);
      setOrderEngineTick((n) => n + 1);
    }
  };

  // Order-level drag context + commit (overlay-only during drag; one modify on up).
  useEffect(() => {
    const bridge = orderBridgeRef.current;
    if (!bridge || loadStatus !== 'ready') return;
    const spec = bridge.getSpec();
    const st = bridge.getState();
    const unsubs: Array<() => void> = [];
    for (const pane of panesRef.current) {
      const chart = getChart(pane.id);
      if (!chart?.setOrderDragContext) continue;
      const container = chart.canvas.parentElement;
      if (!container) continue;
      chart.setOrderDragContext({
        tickSize: spec.tickSize,
        digits: spec.digits,
        pipSize: spec.pipSize,
        contractSize: spec.contractSize,
        lotStep: spec.lotStep,
        minLot: spec.minLot,
        maxLot: spec.maxLot,
        baseCurrency: spec.baseCurrency,
        quoteCurrency: spec.quoteCurrency,
        equity: st.account.equity,
        riskPercent: 0.01,
        riskLocked: true,
        container,
      });
      unsubs.push(
        chart.onOrderLevelCommit((hit) => {
          if (hit.cancelled) {
            syncOrdersFromBridge();
            return;
          }
          // Draft ticket levels → update order form (mouseup only)
          if (hit.orderId === '__draft__') {
            setTicketLevelPatch({
              kind: hit.kind,
              price: hit.price,
            } satisfies OrderLevelPatch);
            return;
          }
          const b = orderBridgeRef.current;
          if (!b) return;
          const cursorTime = replayRef.current.get().cursorTime;
          const last = panesRef.current[0]?.bars.slice(-1)[0];
          const bid = last?.close ?? hit.price;
          const ask = bid + b.getSpec().typicalSpread;
          const state = b.getState();

          // Working entry order (limit/stop) — drag entry / attached SL/TP
          const entryOrd = state.orders[hit.orderId];
          if (entryOrd && !entryOrd.role && !isTerminal(entryOrd.status)) {
            b.modify({
              orderId: entryOrd.id,
              cursorTime,
              price: hit.kind === 'entry' ? hit.price : entryOrd.price,
              stopLoss: hit.kind === 'sl' ? hit.price : entryOrd.stopLoss,
              takeProfit: hit.kind === 'tp' ? hit.price : entryOrd.takeProfit,
              bid,
              ask,
            });
            syncOrdersFromBridge();
            return;
          }

          // Filled position: entry is not draggable — only protective SL/TP
          if (hit.kind === 'entry') {
            syncOrdersFromBridge();
            return;
          }

          const protective = state.workingIds
            .map((id) => state.orders[id])
            .find(
              (o) =>
                o &&
                o.positionId === hit.orderId &&
                ((hit.kind === 'sl' && o.role === 'stopLoss') ||
                  (hit.kind === 'tp' && o.role === 'takeProfit')),
            );
          if (!protective) {
            syncOrdersFromBridge();
            return;
          }
          b.modify({
            orderId: protective.id,
            cursorTime,
            price: hit.price,
            bid,
            ask,
          });
          syncOrdersFromBridge();
        }),
      );
    }
    return () => {
      for (const u of unsubs) u();
      for (const pane of panesRef.current) {
        getChart(pane.id)?.setOrderDragContext?.(null);
      }
    };
  }, [loadStatus, panes, orderEngineTick, syncOrdersFromBridge]);

  /**
   * Before Play: sync session pane configs to the React multi-pane set and warm
   * IDB caches around the cursor so every pair can extendReveal immediately.
   */
  const armReplayPlay = useCallback(async () => {
    detachedPanesRef.current.clear();
    cameraDetachedRef.current = false;
    setCameraDetached(false);

    const s = sessionRef.current.get();
    const list = panesRef.current;
    if (!s || list.length === 0) {
      replayRef.current.play();
      return;
    }

    const cfgs: Record<
      string,
      { datasetId: string; tf: Timeframe; selectedTf: Timeframe; pair: string }
    > = {};
    for (const p of list) {
      cfgs[p.id] = {
        datasetId: p.datasetId,
        tf: p.timeframe,
        selectedTf: p.selectedTf,
        pair: p.pair,
      };
    }

    const views = sessionRef.current.getViews();
    const configsMatch = list.every((p) => {
      const c = s.panes[p.id];
      return !!c && c.datasetId === p.datasetId && c.tf === p.timeframe;
    });
    const allHaveBars = list.every((p) => (views[p.id]?.bars.length ?? 0) > 0);

    try {
      if (!configsMatch || !allHaveBars || list.length !== Object.keys(s.panes).length) {
        await sessionRef.current.replacePanes(cfgs, s.activePaneId);
        commitSessionViews();
        syncEnginesFromSession();
      } else {
        await sessionRef.current.topUpCaches();
      }
    } catch (err) {
      console.warn('[replay] arm multi-pane caches failed', err);
    }

    for (const pane of panesRef.current) {
      const chart = getChart(pane.id);
      if (!chart) continue;
      chart.setReplayFollow(true);
    }
    replayRef.current.play();
  }, [commitSessionViews, syncEnginesFromSession]);

  const loadSessionData = useCallback(
    async (next: BacktestSession) => {
      viewportReloadEnabledRef.current = false;
      lastReplayCursorRef.current = null;
      lastProgressSaveRef.current = 0;
      replayBufferRef.current.clear();
      cameraDetachedRef.current = false;
      setCameraDetached(false);
      replayRef.current.pause();
      sessionRef.current.dispose();
      sessionRef.current = createSessionController();

      // Prefer disk copy so reopen after exit picks up last saved cursor.
      const fresh = getSession(next.id) ?? next;
      sessionIdRef.current = fresh.id;

      setSession(fresh);
      setLoadStatus('loading');
      setLoadError(null);
      setIngestPct(0);
      setView('chart');
      setPanes([]);
      panesRef.current = [];
      seriesRef.current = [];
      setDraftPoints([]);

      try {
        const resolved = resolveBaseDatasetsForSession(fresh);
        if (resolved.length === 0) throw new Error('No dataset found for this session.');

        const seriesList: PaneSeries[] = [];
        for (let i = 0; i < resolved.length; i++) {
          const { leg, dataset } = resolved[i]!;
          const cat = await ensureDatasetIngested(dataset.id, dataset.timeframe, (p) => {
            const base = i / resolved.length;
            setIngestPct(base + p.percent / resolved.length);
          });
          seriesList.push({ pair: leg.pair, datasetId: cat.datasetId, catalog: cat });
        }
        seriesRef.current = seriesList;
        const primary = seriesList[0]!;
        setCatalog(primary.catalog);

        const sharedTfs = intersectTimeframes(seriesList);
        const openTf = sharedTfs.includes(fresh.timeframe)
          ? fresh.timeframe
          : (sharedTfs[0] ?? primary.catalog.baseTf);

        const { timeStart, timeEnd } = replayBounds(fresh, seriesList);
        const baseTf = primary.catalog.baseTf;
        const resumeCursor =
          typeof fresh.cursorTime === 'number' && Number.isFinite(fresh.cursorTime)
            ? Math.min(timeEnd, Math.max(timeStart, fresh.cursorTime))
            : timeStart;
        const resumeSpan = Math.max(
          10,
          Math.min(
            MAX_BARS_IN_MEMORY,
            typeof fresh.span === 'number' && fresh.span > 0
              ? fresh.span
              : REPLAY_VISIBLE_BARS,
          ),
        );
        const windowSec = timeframeSeconds(baseTf) * resumeSpan;

        // Replay clock on base TF; rate from open pane TF.
        replayRef.current.setBaseTf(baseTf);
        replayRef.current.setRateTf(openTf);
        replayRef.current.configure(timeStart, timeEnd, windowSec);
        replayRef.current.seek(resumeCursor, { silent: true });
        lastReplayCursorRef.current = resumeCursor;

        await sessionRef.current.configure({
          baseTf,
          bounds: { start: timeStart, end: timeEnd },
          panes: {
            'pane-0': {
              datasetId: primary.datasetId,
              tf: openTf,
              selectedTf: openTf,
              pair: primary.pair,
            },
          },
          activePaneId: 'pane-0',
          cursorTime: resumeCursor,
          availableTfs: sharedTfs,
          revealMode: 'replay',
          span: resumeSpan,
        });

        const views = sessionRef.current.getViews();
        const v0 = views['pane-0'];
        if (!v0 || v0.bars.length === 0) {
          throw new Error(
            `No bars to display for ${primary.pair}. Re-download or pick a different overlap.`,
          );
        }

        const nextPanes: ChartPaneState[] = [
          {
            id: 'pane-0',
            timeframe: v0.timeframe,
            selectedTf: v0.selectedTf,
            bars: v0.bars,
            range: v0.range,
            windowFrom: 0,
            totalBars: v0.bars.length,
            pair: primary.pair,
            datasetId: primary.datasetId,
          },
        ];
        replayBufferRef.current.set('pane-0', v0.bars);

        panesRef.current = nextPanes;
        setPanes(nextPanes);
        setActivePaneId('pane-0');
        setChartLayout('1');

        const key = `${fresh.id}:${primary.datasetId}`;
        setDrawings(loadDrawings(key));
        orderBridgeRef.current = createOrderSessionBridge({
          sessionId: fresh.id,
          symbol: primary.pair,
          accountCurrency: 'USD',
          balance: 10_000,
        });
        setOrders([]);
        setSelectedOrderId(null);
        setLastOrderReject(null);
        setOrderEngineTick((n) => n + 1);

        setLoadStatus('ready');

        queueMicrotask(() => {
          const tr = timeRangeFromVisible(nextPanes[0]!.bars, nextPanes[0]!.range);
          if (tr) syncStoreRef.current?.setTimeRange(tr, 'session-load');
          viewportReloadEnabledRef.current = true;
        });
      } catch (err) {
        viewportReloadEnabledRef.current = false;
        seriesRef.current = [];
        setLoadStatus('error');
        setLoadError(err instanceof Error ? err.message : 'Failed to load dataset');
      }
    },
    [],
  );

  // Right-click chart → TradingView-style appearance settings
  useEffect(() => {
    const open = () => setChartSettingsOpen(true);
    window.addEventListener('talaria:open-chart-settings', open);
    return () => window.removeEventListener('talaria:open-chart-settings', open);
  }, []);

  // Settings modal ↔ TopBar / volume: keep view state in sync with appearance store
  useEffect(() => {
    return subscribeAppearance((a) => {
      setSeriesType(a.seriesType);
      setCrosshairMode(a.crosshairMode);
      setShowVolume(a.showVolume);
      setVolumeOpacity(a.volumeOpacity);
    });
  }, []);

  const handleSeriesTypeChange = useCallback((t: SeriesType) => {
    setSeriesType(t);
    patchAppearance({ seriesType: t });
  }, []);
  const handleCrosshairModeChange = useCallback((m: CrosshairMode) => {
    setCrosshairMode(m);
    patchAppearance({ crosshairMode: m });
  }, []);
  const handleShowVolumeChange = useCallback((v: boolean) => {
    setShowVolume(v);
    patchAppearance({ showVolume: v });
  }, []);
  const handleVolumeOpacityChange = useCallback((v: number) => {
    setVolumeOpacity(v);
    patchAppearance({ volumeOpacity: v });
  }, []);

  // Flush replay progress on tab close / refresh.
  useEffect(() => {
    const flush = () => persistReplayProgress(true);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [persistReplayProgress]);

  // Session async fills (warm-cache miss) → push views when epoch commits.
  useEffect(() => {
    return sessionRef.current.subscribe(() => {
      if (!viewportReloadEnabledRef.current) return;
      commitSessionViews();
      // Async warm-cache fills (TF/pair) must reach engines even while replayFollow
      // blocks the React → setViewportData path.
      syncEnginesFromSession();
    });
  }, [commitSessionViews, syncEnginesFromSession, catalog?.datasetId, session?.id]);

  // Replay: cursor → engines. React only on discrete play/pause/seek/speed edges.
  const wasPlayingRef = useRef(false);
  const lastSpeedRef = useRef(replayRef.current.get().speed);
  useEffect(() => {
    const ctrl = replayRef.current;
    return ctrl.subscribe((rs) => {
      if (!catalog || !viewportReloadEnabledRef.current) return;

      const playEdge = rs.playing !== wasPlayingRef.current;
      const cursorChanged = lastReplayCursorRef.current !== rs.cursorTime;
      const speedChanged = rs.speed !== lastSpeedRef.current;
      // Pause/speed keep the same cursorTime — must not early-return or chrome
      // (Play/Pause icon, speed slider) stays stale while the controller moved on.
      if (!playEdge && !cursorChanged && !speedChanged) return;

      lastReplayCursorRef.current = rs.cursorTime;
      wasPlayingRef.current = rs.playing;
      lastSpeedRef.current = rs.speed;

      if (rs.playing && rs.cursorTime <= rs.startTime + 1) {
        cameraDetachedRef.current = false;
        setCameraDetached(false);
      }

      if (rs.playing) {
        // React only on play edge or speed change — not every cursor tick.
        if (playEdge || speedChanged) setReplayTick((n) => n + 1);
        if (cursorChanged || playEdge) {
          applyReplayReveal(rs.cursorTime, { playEdge });
          if (cursorChanged) persistReplayProgress(false);
        }
        return;
      }

      setReplayTick((n) => n + 1);
      applyReplayReveal(rs.cursorTime);
      // Pause / seek / step — always flush progress so exit/reopen resumes here.
      if (playEdge || cursorChanged) persistReplayProgress(true);
    });
  }, [catalog, applyReplayReveal, persistReplayProgress]);

  // Pan/zoom sync → edge-prefetch IDB windows when near buffer (not replay/session)
  useEffect(() => {
    if (!catalog || !syncStore) return;
    let lastFrom = Number.NaN;
    let lastTo = Number.NaN;
    const reload = debounce((fromTime: number, toTime: number) => {
      if (!viewportReloadEnabledRef.current) return;
      if (Math.abs(fromTime - lastFrom) < 0.5 && Math.abs(toTime - lastTo) < 0.5) return;
      lastFrom = fromTime;
      lastTo = toTime;
      // Async — never blocks rAF paint; mid-buffer pans return immediately.
      void applyTimeWindowToPanes(fromTime, toTime);
    }, LOD_DEBOUNCE_MS);

    return syncStore.subscribe((state) => {
      if (!state.timeRange) return;
      if (
        state.origin === 'replay' ||
        state.origin === 'session-load' ||
        state.origin === 'tf-switch'
      ) {
        return;
      }
      // User dragged during play → detach camera so pan stays smooth.
      // Still allow edge prefetch while detached (empty pad fix).
      if (
        replayRef.current.get().playing &&
        state.origin != null &&
        state.origin.startsWith('pane')
      ) {
        cameraDetachedRef.current = true;
        setCameraDetached(true);
        reload(state.timeRange.fromTime, state.timeRange.toTime);
        return;
      }
      if (replayRef.current.get().playing && !cameraDetachedRef.current) return;
      reload(state.timeRange.fromTime, state.timeRange.toTime);
    });
  }, [catalog, syncStore, applyTimeWindowToPanes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraftPoints([]);
        freehandActiveRef.current = false;
        setSelectedDrawingId(null);
        setSettingsOpen(false);
        setActiveTool('cursor');
      }
      if (e.key === 'Enter' && isDrawingTool(activeTool)) {
        const def = getTool(activeTool);
        if (def.points.kind === 'polyline' && draftPoints.length >= def.points.min) {
          const result = placeDrawingPoint(activeTool, draftPoints, draftPoints[draftPoints.length - 1]!, {
            finishPolyline: true,
          });
          if (result.status === 'complete') {
            persistDrawings([...drawings, result.drawing]);
            setDraftPoints([]);
            setSelectedDrawingId(result.drawing.id);
            setSettingsOpen(false);
            if (!stayInDrawingMode) setActiveTool('cursor');
          }
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId && !drawingsLocked) {
        const cur = drawings.find((d) => d.id === selectedDrawingId);
        if (cur?.locked) return;
        persistDrawings(drawings.filter((d) => d.id !== selectedDrawingId));
        setSelectedDrawingId(null);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeTool,
    draftPoints,
    drawings,
    drawingsLocked,
    persistDrawings,
    selectedDrawingId,
    stayInDrawingMode,
  ]);

  const handleLayoutChange = (layout: ChartLayout) => {
    setChartLayout(layout);
    if (!catalog || seriesRef.current.length === 0) return;
    const count = paneCountForLayout(layout);
    const sessNow = sessionRef.current.get();
    // Multi-pane must load around the replay cursor — catalog.timeEnd seeds the
    // wrong window and leaves secondary pairs empty until a late async fill.
    const anchor =
      sessNow?.cursorTime ??
      replayRef.current.get().cursorTime ??
      syncStoreRef.current?.get().timeRange?.toTime ??
      catalog.timeEnd;
    const multiPair = seriesRef.current.length > 1 && !layoutSyncRef.current.symbol;
    const syncInterval = layoutSyncRef.current.interval;
    const activeTf = activePane?.selectedTf ?? activePane?.timeframe ?? catalog.baseTf;
    void (async () => {
      const next: ChartPaneState[] = [];
      for (let i = 0; i < count; i++) {
        const id = `pane-${i}`;
        const existing = panesRef.current.find((p) => p.id === id);
        if (existing && existing.bars.length > 0 && i < panesRef.current.length) {
          // Keep existing pane; if interval sync, rebuild floor TF to match active
          if (syncInterval && existing.selectedTf !== activeTf) {
            const rebuilt = await buildPane(
              id,
              activeTf,
              anchor,
              { pair: existing.pair, datasetId: existing.datasetId },
              activeTf,
            );
            next.push(rebuilt ?? existing);
          } else {
            next.push(existing);
          }
          continue;
        }
        const series = seriesRef.current[i % seriesRef.current.length]!;
        const primary = seriesRef.current[0]!;
        const source = multiPair ? series : primary;
        const tf = syncInterval
          ? activeTf
          : multiPair
            ? activeTf
            : (existing?.selectedTf ?? pickTfForPaneIndex(i, activeTf));
        const pane = await buildPane(
          id,
          tf,
          anchor,
          { pair: source.pair, datasetId: source.datasetId },
          tf,
        );
        if (pane) next.push(pane);
      }
      const sess = sessionRef.current.get();
      if (sess) {
        const cfgs: Record<
          string,
          { datasetId: string; tf: Timeframe; selectedTf: Timeframe; pair: string }
        > = {};
        for (const p of next) {
          cfgs[p.id] = {
            datasetId: p.datasetId,
            tf: p.timeframe,
            selectedTf: p.selectedTf,
            pair: p.pair,
          };
        }
        // Await fill+derive around cursor so all panes have revealed bars before paint.
        await sessionRef.current.replacePanes(cfgs, next[0]?.id ?? 'pane-0');
        commitSessionViews();
        syncEnginesFromSession();
        const views = sessionRef.current.getViews();
        const settled = next.map((p) => {
          const v = views[p.id];
          if (!v || v.bars.length === 0) return p;
          return {
            ...p,
            bars: v.bars as ChartBar[],
            range: v.range,
            timeframe: v.timeframe,
            selectedTf: v.selectedTf,
            totalBars: v.bars.length,
          };
        });
        panesRef.current = settled;
        setPanes(settled);
        for (const p of settled) {
          if (p.bars.length > 0) replayBufferRef.current.set(p.id, p.bars);
        }
      } else {
        panesRef.current = next;
        setPanes(next);
      }
      syncReplayClockTf(panesRef.current);
      setActivePaneId((cur) => {
        const idx = Number(cur.replace('pane-', ''));
        return Number.isFinite(idx) && idx < count ? cur : 'pane-0';
      });
    })();
  };

  /**
   * TF switch = capture camera (span + right edge), one field change, push engines.
   * During replay the right edge stays on the cursor candle; bar count is preserved.
   */
  const applyPaneTimeframe = useCallback(
    (paneId: string, tf: Timeframe) => {
      if (!catalog) return;
      const existing = panesRef.current.find((p) => p.id === paneId);
      if (!existing) return;
      if (existing.selectedTf === tf && existing.timeframe === tf) {
        setActivePaneId(paneId);
        return;
      }
      if (!sessionRef.current.get()) return;

      const syncAll = layoutSyncRef.current.interval;
      const targets = syncAll
        ? panesRef.current.map((p) => p.id)
        : [paneId];

      const camera = captureLiveCamera(paneId);
      cameraPreserveRef.current = camera;
      sessionRef.current.setCamera(camera.anchorTime, camera.span);

      for (const id of targets) {
        sessionRef.current.setPaneTimeframe(id, tf);
      }
      setActivePaneId(paneId);
      sessionRef.current.setActivePane(paneId);
      commitSessionViews();
      syncEnginesFromSession();
      syncReplayClockTf(panesRef.current);

      const focus = panesRef.current.find((p) => p.id === paneId);
      if (focus && focus.bars.length > 0) {
        const newTr = timeRangeFromVisible(focus.bars, focus.range);
        if (newTr) syncStoreRef.current?.setTimeRange(newTr, 'tf-switch');
        replayBufferRef.current.set(paneId, focus.bars);
      }
    },
    [
      catalog,
      captureLiveCamera,
      commitSessionViews,
      syncEnginesFromSession,
      syncReplayClockTf,
    ],
  );

  /**
   * Symbol switch via session controller — same camera preserve as TF switch.
   * Truncates at cursor in replay; never loads future bars into the engine.
   */
  const applyPaneSymbol = useCallback(
    (paneId: string, pair: PairSymbol) => {
      if (!catalog) return;
      const series = seriesRef.current.find((s) => s.pair === pair);
      if (!series) return;
      const existing = panesRef.current.find((p) => p.id === paneId);
      if (!existing) return;
      if (existing.pair === pair && existing.datasetId === series.datasetId) {
        setActivePaneId(paneId);
        return;
      }
      if (!sessionRef.current.get()) return;

      const syncAll = layoutSyncRef.current.symbol;
      const targets = syncAll
        ? panesRef.current.map((p) => p.id)
        : [paneId];

      const camera = captureLiveCamera(paneId);
      cameraPreserveRef.current = camera;
      sessionRef.current.setCamera(camera.anchorTime, camera.span);

      const tfs =
        seriesRef.current.length > 0
          ? intersectTimeframes(seriesRef.current)
          : (catalog.timeframes ?? [existing.selectedTf]);

      for (const id of targets) {
        sessionRef.current.setPaneSymbol(
          id,
          { datasetId: series.datasetId, pair: series.pair },
          tfs,
        );
        replayBufferRef.current.delete(id);
      }
      setActivePaneId(paneId);
      sessionRef.current.setActivePane(paneId);
      commitSessionViews();
      syncEnginesFromSession();
      syncReplayClockTf(panesRef.current);

      const focus = panesRef.current.find((p) => p.id === paneId);
      if (focus && focus.bars.length > 0) {
        const newTr = timeRangeFromVisible(focus.bars, focus.range);
        if (newTr) syncStoreRef.current?.setTimeRange(newTr, 'symbol-switch');
        replayBufferRef.current.set(paneId, focus.bars);
      }
    },
    [
      catalog,
      captureLiveCamera,
      commitSessionViews,
      syncEnginesFromSession,
      syncReplayClockTf,
    ],
  );

  const handleChartPoint = useCallback(
    (point: CrosshairPoint, hit: HitResult | null) => {
      if (!session || !catalog) return;
      const bars = panesRef.current.find((p) => p.id === activePaneId)?.bars ?? [];

      // Cursor / global-lock: select drawings (toolbar appears; settings via gear).
      // Move/resize is handled by the chart engine (pointer drag + cursors).
      if (activeTool === 'cursor' || activeTool === 'zoom' || drawingsLocked) {
        if (hit) {
          setSelectedDrawingId(hit.drawingId);
          setSettingsOpen(false);
        } else {
          setSelectedDrawingId(null);
          setSettingsOpen(false);
        }
        return;
      }

      if (!isDrawingTool(activeTool)) return;

      // Clicking an existing drawing while a tool is active → select instead
      if (hit && draftPoints.length === 0) {
        setSelectedDrawingId(hit.drawingId);
        setSettingsOpen(false);
        setActiveTool('cursor');
        return;
      }

      const snapped = magnetSnap(
        { time: point.time, price: point.price },
        bars,
        magnet,
      );

      const toolDef = getTool(activeTool);
      if (toolDef.points.kind === 'freehand') {
        if (!freehandActiveRef.current) {
          freehandActiveRef.current = true;
          setDraftPoints([snapped]);
          return;
        }
        // Second click finishes freehand
        const result = placeDrawingPoint(activeTool, draftPoints, snapped, {
          finishPolyline: true,
        });
        freehandActiveRef.current = false;
        if (result.status === 'complete') {
          persistDrawings([...drawings, result.drawing]);
          setDraftPoints([]);
          setSelectedDrawingId(result.drawing.id);
          setSettingsOpen(false);
          if (!stayInDrawingMode) setActiveTool('cursor');
        }
        return;
      }

      if (toolDef.points.kind === 'polyline') {
        // Double-finish: if last point is very close, finish
        const last = draftPoints[draftPoints.length - 1];
        if (
          last &&
          Math.abs(last.time - snapped.time) < 1 &&
          Math.abs(last.price - snapped.price) < 1e-8 &&
          draftPoints.length >= toolDef.points.min
        ) {
          const result = placeDrawingPoint(activeTool, draftPoints, snapped, {
            finishPolyline: true,
          });
          if (result.status === 'complete') {
            persistDrawings([...drawings, result.drawing]);
            setDraftPoints([]);
            setSelectedDrawingId(result.drawing.id);
            setSettingsOpen(false);
            if (!stayInDrawingMode) setActiveTool('cursor');
          }
          return;
        }
      }

      const result = placeDrawingPoint(activeTool, draftPoints, snapped);
      if (result.status === 'pending') {
        setDraftPoints(result.points);
        return;
      }
      if (result.status === 'complete') {
        persistDrawings([...drawings, result.drawing]);
        setDraftPoints([]);
        setSelectedDrawingId(result.drawing.id);
        setSettingsOpen(false);
        if (!stayInDrawingMode) setActiveTool('cursor');
      }
    },
    [
      activePaneId,
      activeTool,
      catalog,
      draftPoints,
      drawings,
      drawingsLocked,
      magnet,
      persistDrawings,
      session,
      stayInDrawingMode,
    ],
  );

  // Freehand only — rubber-band preview is engine-owned (setPlacement + overlay paint).
  const handleCrosshairForDrawings = useCallback(
    (point: CrosshairPoint | null) => {
      if (!point) return;
      if (
        !freehandActiveRef.current ||
        !isDrawingTool(activeTool) ||
        getTool(activeTool).points.kind !== 'freehand'
      ) {
        return;
      }

      const freePt: DrawingPoint = { time: point.time, price: point.price };
      pendingFreehandRef.current = freePt;
      if (freehandRafRef.current !== 0) return;
      freehandRafRef.current = requestAnimationFrame(() => {
        freehandRafRef.current = 0;
        const pt = pendingFreehandRef.current;
        if (!pt) return;
        setDraftPoints((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            Math.abs(last.time - pt.time) < 0.5 &&
            Math.abs(last.price - pt.price) < 1e-6
          ) {
            return prev;
          }
          return [...prev, pt];
        });
      });
    },
    [activeTool],
  );

  const handleToolChange = (tool: ChartToolId) => {
    setActiveTool(tool);
    setDraftPoints([]);
    freehandActiveRef.current = false;
    pendingFreehandRef.current = null;
    if (freehandRafRef.current !== 0) {
      cancelAnimationFrame(freehandRafRef.current);
      freehandRafRef.current = 0;
    }
    if (tool !== 'cursor') {
      setSelectedDrawingId(null);
      setSettingsOpen(false);
    }
  };

  const handleEngineDrawingsChange = useCallback(
    (next: readonly Drawing[]) => {
      persistDrawings([...next]);
    },
    [persistDrawings],
  );

  const handleEngineDrawingSelect = useCallback((drawingId: string) => {
    setSelectedDrawingId(drawingId);
    setSettingsOpen(false);
  }, []);

  const clearDrawings = () => {
    persistDrawings([]);
    setDraftPoints([]);
    setSelectedDrawingId(null);
    setSettingsOpen(false);
  };

  const patchSelectedDrawing = (patch: Partial<Drawing>) => {
    if (!selectedDrawingId) return;
    persistDrawings(
      drawings.map((d) => (d.id === selectedDrawingId ? { ...d, ...patch } : d)),
    );
  };

  const replaceSelectedDrawing = (next: Drawing) => {
    persistDrawings(drawings.map((d) => (d.id === next.id ? next : d)));
  };

  const deleteSelectedDrawing = () => {
    if (!selectedDrawingId) return;
    const cur = drawings.find((d) => d.id === selectedDrawingId);
    if (cur?.locked) return;
    persistDrawings(drawings.filter((d) => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
    setSettingsOpen(false);
  };

  const teardownChartSession = () => {
    // Flush before disabling viewport — resume cursor on next open.
    persistReplayProgress(true);
    viewportReloadEnabledRef.current = false;
    sessionIdRef.current = null;
    replayBufferRef.current.clear();
    sessionRef.current.dispose();
    sessionRef.current = createSessionController();
    replayRef.current.pause();
    if (import.meta.env.DEV) {
      // charts/observers release async as ChartPane unmounts; defer assert a frame
      requestAnimationFrame(() => {
        const cache = warmCache.stats();
        if (cache.entries !== 0) {
          console.warn('[ledger] warmCache not empty at teardown', cache);
        }
        ledgerAssertTeardown('session-teardown');
      });
    }
    cameraDetachedRef.current = false;
    setCameraDetached(false);
    setSession(null);
    setCatalog(null);
    setLoadStatus('idle');
    setLoadError(null);
    setPanes([]);
    panesRef.current = [];
    seriesRef.current = [];
    setDrawings([]);
    setDraftPoints([]);
    setSelectedDrawingId(null);
    setSettingsOpen(false);
    setEnabledIndicators([]);
    setOrders([]);
    setSelectedOrderId(null);
    setLastOrderReject(null);
    orderBridgeRef.current = null;
    cancelBacktest();
    clearBacktestResult();
    syncStoreRef.current = null;
  };

  const handleExitSession = () => {
    teardownChartSession();
    setView('sessions');
  };

  const handleOpenJournal = (sessionId?: string | null) => {
    const id = sessionId ?? session?.id ?? null;
    // Soft navigate: pause replay but keep session in memory so "Back to chart"
    // does not force a full re-ingest. Explicit Exit / Sessions still teardowns.
    replayRef.current.pause();
    persistReplayProgress(true);
    setJournalSessionId(id);
    setView('journal');
  };

  const handlePlaceOrder = useCallback(() => {
    setTicketOpen(true);
    setActiveTab('open');
  }, []);

  const chartOrdersWithDraft = useMemo(() => {
    if (!ticketDraft || !session) return orders;
    const draftOrder: ChartOrder = {
      id: '__draft__',
      sessionId: session.id,
      pair: session.legs[0]?.pair ?? '',
      side: ticketDraft.side === 'BUY' ? 'buy' : 'sell',
      entry: ticketDraft.entry,
      stopLoss: ticketDraft.stopLoss,
      takeProfit: ticketDraft.takeProfit,
      createdAt: 0,
      draft: true,
      working: true,
    };
    return [...orders, draftOrder];
  }, [orders, ticketDraft, session]);

  const orderCounts = useMemo(
    () => tradeDockCounts(orderBridgeRef.current?.getState() ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives refresh
    [orderEngineTick],
  );

  const liveBidAsk = useMemo(() => {
    const pane = panes.find((p) => p.id === activePaneId) ?? panes[0];
    const last = pane?.bars[pane.bars.length - 1];
    const bid = last?.close ?? 0;
    const spread = orderBridgeRef.current?.getSpec().typicalSpread ?? 0;
    return { bid, ask: bid + spread };
  }, [panes, activePaneId, orderEngineTick]);

  const submitTicket = useCallback(
    (ticket: {
      side: 'BUY' | 'SELL';
      type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TRAILING_STOP';
      size: number;
      price?: number;
      stopLoss?: number;
      takeProfit?: number;
      tif: 'GTC' | 'DAY' | 'GTD' | 'IOC' | 'FOK';
    }) => {
      const bridge = orderBridgeRef.current;
      if (!bridge) return;
      const pane =
        panesRef.current.find((p) => p.id === activePaneId) ?? panesRef.current[0];
      if (!pane || pane.bars.length === 0) return;
      const last = pane.bars[pane.bars.length - 1]!;
      const spread = bridge.getSpec().typicalSpread;
      const cursorTime = replayRef.current.get().cursorTime || last.time;
      const id = `ord-${cursorTime}-${bridge.getState().seq + 1}`;
      bridge.submit({
        cursorTime,
        bid: last.close,
        ask: last.close + spread,
        order: {
          id,
          symbol: bridge.getState().symbol,
          side: ticket.side,
          type: ticket.type,
          size: ticket.size,
          price: ticket.price,
          stopLoss: ticket.stopLoss,
          takeProfit: ticket.takeProfit,
          tif: ticket.tif,
          createdAt: cursorTime,
        },
      });
      syncOrdersFromBridge();
      setSelectedOrderId(id);
      setTicketOpen(false);
      setTicketDraft(null);
      setActiveTab('open');
    },
    [activePaneId, syncOrdersFromBridge],
  );

  useEffect(() => subscribeBacktest(() => setBacktestTick((n) => n + 1)), []);

  const handleRunBacktest = useCallback(() => {
    if (!session) return;
    const pane = panesRef.current.find((p) => p.id === activePaneId) ?? panesRef.current[0];
    if (!pane) return;
    const series = seriesForPane(pane);
    if (!series) return;

    const { timeStart, timeEnd } = replayBounds(session, seriesRef.current);
    setBacktestRunning();

    void runBacktest({
      sessionId: session.id,
      datasetId: series.datasetId,
      timeframe: pane.timeframe,
      timeStart,
      timeEnd,
      params: DEFAULT_BACKTEST_PARAMS,
    })
      .then((result) => {
        const note = result.truncated
          ? `Capped at ${MAX_BACKTEST_BARS.toLocaleString()} bars (newest)`
          : null;
        setBacktestResult(result, note);
        saveJournalResult(session.id, session.name, result);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setBacktestCancelled();
          return;
        }
        setBacktestError(err instanceof Error ? err.message : 'Backtest failed');
      });
  }, [session, activePaneId, seriesForPane]);

  const handleCancelBacktest = useCallback(() => {
    cancelBacktest();
    setBacktestCancelled();
  }, []);

  useEffect(() => {
    return () => {
      cancelBacktest();
      clearBacktestResult();
      replayRef.current.dispose();
    };
  }, []);

  const loadSessionDataRef = useRef(loadSessionData);
  loadSessionDataRef.current = loadSessionData;
  const teardownChartSessionRef = useRef(teardownChartSession);
  teardownChartSessionRef.current = teardownChartSession;
  const sessionNavRef = useRef(session);
  sessionNavRef.current = session;

  // Keep the URL hash in sync so refresh restores chart / sessions / journal.
  useEffect(() => {
    const routeSessionId =
      view === 'chart'
        ? (session?.id ?? null)
        : view === 'journal'
          ? journalSessionId
          : null;
    if (view === 'chart' && !routeSessionId) return;
    const next = formatAppRoute({ view, sessionId: routeSessionId });
    if (window.location.hash === next) return;
    suppressHashRef.current = true;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${next}`,
    );
    queueMicrotask(() => {
      suppressHashRef.current = false;
    });
  }, [view, session?.id, journalSessionId]);

  // Cold start: reopen #/chart/:sessionId after refresh.
  useEffect(() => {
    const route = parseAppRoute();
    if (route.view !== 'chart' || !route.sessionId) return;
    const s = getSession(route.sessionId);
    if (!s) {
      setView('sessions');
      return;
    }
    void loadSessionDataRef.current(s);
  }, []);

  // Back / forward / manual hash edits.
  useEffect(() => {
    const onHashChange = () => {
      if (suppressHashRef.current) return;
      const route = parseAppRoute();
      if (route.view === 'chart') {
        if (!route.sessionId) {
          teardownChartSessionRef.current();
          setView('sessions');
          return;
        }
        if (sessionNavRef.current?.id === route.sessionId) {
          setView('chart');
          return;
        }
        const s = getSession(route.sessionId);
        if (s) void loadSessionDataRef.current(s);
        else {
          teardownChartSessionRef.current();
          setView('sessions');
        }
        return;
      }
      if (route.view === 'journal') {
        replayRef.current.pause();
        setJournalSessionId(route.sessionId);
        setView('journal');
        return;
      }
      if (sessionNavRef.current) {
        teardownChartSessionRef.current();
      }
      setJournalSessionId(null);
      setView(route.view);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (view === 'landing') {
    return (
      <MarketingHome
        onStartFree={() => setView('sessions')}
        onSignIn={() => setView('sessions')}
      />
    );
  }

  if (view === 'datasets') {
    return <DatasetsPage onGoSessions={() => setView('sessions')} />;
  }

  if (view === 'journal') {
    return (
      <JournalPage
        initialSessionId={journalSessionId}
        canReturnToChart={!!session && session.id === (journalSessionId ?? session.id)}
        onGoSessions={() => {
          setJournalSessionId(null);
          if (session) teardownChartSession();
          setView('sessions');
        }}
        onOpenChart={(id) => {
          // Same open session still in memory — remount chart without re-ingest.
          if (session && session.id === id && panesRef.current.length > 0) {
            setJournalSessionId(null);
            setView('chart');
            return;
          }
          const s = getSession(id);
          if (s) void loadSessionData(s);
        }}
      />
    );
  }

  // Refresh restore: #/chart/:id before session state is hydrated.
  if (view === 'chart' && (!session || loadStatus === 'loading')) {
    return (
      <div className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-muted text-center">
          {loadStatus === 'error'
            ? (loadError ?? 'Failed to restore chart session')
            : 'Restoring chart session…'}
        </p>
        {loadStatus === 'error' && (
          <Button
            variant="secondary"
            className="min-h-11"
            onPress={() => {
              teardownChartSession();
              setView('sessions');
            }}
          >
            Back to sessions
          </Button>
        )}
      </div>
    );
  }

  if (view === 'sessions' || !session) {
    return (
      <CreateSessionPage
        onStart={(s) => void loadSessionData(s)}
        onGoDatasets={() => setView('datasets')}
        onGoJournal={(sessionId) => {
          setJournalSessionId(sessionId ?? null);
          setView('journal');
        }}
        onGoHome={() => setView('landing')}
      />
    );
  }

  /** TopBar shows user's selected floor; pane legend shows effective (LOD) TF. */
  const topTf = activePane?.selectedTf ?? activePane?.timeframe ?? '1m';
  const barsInMemory = panes.reduce((n, p) => n + p.bars.length, 0);

  // backtestTick forces re-read when store emits
  void backtestTick;
  const bt = getBacktestState();
  const btResult = bt.result;
  const btRunning = bt.status === 'running';
  const btLabel = btRunning
    ? 'Running…'
    : bt.status === 'error'
      ? bt.error ?? 'Error'
      : btResult
        ? `${btResult.trades.length} trades${bt.note ? ' · capped' : ''}`
        : undefined;
  const equityLabel = btResult ? btResult.finalEquity.toFixed(4) : undefined;
  const pnlPct = btResult ? (btResult.finalEquity - 1) * 100 : null;
  const pnlLabel =
    pnlPct == null ? undefined : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
  const pnlPositive = pnlPct == null ? null : pnlPct >= 0;

  return (
    <div className="h-full min-h-0 bg-surface text-foreground flex flex-col overflow-hidden supports-[height:100dvh]:h-dvh">
      <TopBar
        symbol={topSymbol || session.pair}
        symbolOptions={symbolOptions}
        onSymbolChange={(pair) => applyPaneSymbol(activePaneId, pair)}
        timeframe={topTf}
        onTimeframeChange={(tf) => applyPaneTimeframe(activePaneId, tf)}
        availableTimeframes={availableTimeframes}
        seriesType={seriesType}
        onSeriesTypeChange={handleSeriesTypeChange}
        crosshairMode={crosshairMode}
        onCrosshairModeChange={handleCrosshairModeChange}
        chartLayout={chartLayout}
        onChartLayoutChange={handleLayoutChange}
        layoutSync={layoutSync}
        onLayoutSyncChange={setLayoutSync}
        showVolume={showVolume}
        onShowVolumeChange={handleShowVolumeChange}
        enabledIndicators={enabledIndicators}
        onEnabledIndicatorsChange={setEnabledIndicators}
        onImportCsv={(f) => void importCsv(f)}
        importing={importing}
        onExitSession={handleExitSession}
        sessionLabel={`${session.name} · ${session.startDate} → ${session.endDate}`}
        onPlaceOrder={handlePlaceOrder}
        backtestRunning={btRunning}
        backtestLabel={btLabel}
        onRunBacktest={loadStatus === 'ready' ? handleRunBacktest : undefined}
        onCancelBacktest={handleCancelBacktest}
      />

      <div className="flex-1 min-h-0 flex">
        <LeftToolbar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          onClearDrawings={clearDrawings}
          magnet={magnet}
          onMagnetChange={setMagnet}
          stayInDrawingMode={stayInDrawingMode}
          onStayInDrawingModeChange={setStayInDrawingMode}
          drawingsLocked={drawingsLocked}
          onDrawingsLockedChange={setDrawingsLocked}
          drawingsHidden={drawingsHidden}
          onDrawingsHiddenChange={setDrawingsHidden}
        />

        <div className="flex-1 min-w-0 min-h-0 flex flex-row relative bg-background">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
          {loadStatus === 'loading' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 gap-2">
              <p className="text-sm text-muted">
                Ingesting {session.legs.map((l) => l.pair).join(' + ')} into IndexedDB…{' '}
                {Math.round(ingestPct * 100)}%
              </p>
            </div>
          )}

          {loadStatus === 'error' && (
            <div className="absolute top-10 left-3 right-3 z-30 max-w-md space-y-2">
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Could not load dataset</Alert.Title>
                  <Alert.Description>{loadError}</Alert.Description>
                </Alert.Content>
              </Alert>
              <Button variant="secondary" size="sm" onPress={handleExitSession}>
                Back to sessions
              </Button>
            </div>
          )}

          {loadStatus === 'ready' && bt.status === 'error' && bt.error && (
            <div className="absolute top-10 left-3 right-3 z-30 max-w-md">
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Backtest failed</Alert.Title>
                  <Alert.Description>{bt.error}</Alert.Description>
                </Alert.Content>
              </Alert>
            </div>
          )}

          {loadStatus === 'ready' && panes.length === 0 && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-4">
              <p className="text-sm text-muted text-center max-w-sm">
                No chart data loaded for this session. Check Datasets or re-open the session.
              </p>
              <Button variant="secondary" className="min-h-11" onPress={handleExitSession}>
                Back to sessions
              </Button>
            </div>
          )}

          {(importing || state.status === 'error' || state.status === 'done') && (
            <div className="absolute top-10 left-3 right-3 z-20 max-w-md pointer-events-auto space-y-2">
              <LoadingProgress state={state} />
            </div>
          )}

          {loadStatus === 'ready' && panes.length > 0 && catalog && (
            <>
            <ChartGrid
              key={`${session.id}:${catalog.datasetId}:${session.legs.length}`}
              layout={chartLayout}
              syncStore={syncStore}
              panes={panes}
              activePaneId={activePaneId}
              onSelectPane={setActivePaneId}
              crosshairMode={crosshairMode}
              seriesType={seriesType}
              showVolume={showVolume}
              onShowVolumeChange={handleShowVolumeChange}
              volumeOpacity={volumeOpacity}
              onVolumeOpacityChange={handleVolumeOpacityChange}
              enabledIndicators={enabledIndicators}
              onEnabledIndicatorsChange={setEnabledIndicators}
              orders={chartOrdersWithDraft}
              selectedOrderId={selectedOrderId}
              onOrderSelect={setSelectedOrderId}
              backtestResult={btResult}
              syncCrosshair={layoutSync.crosshair || layoutSync.time}
              syncDateRange={layoutSync.dateRange}
              drawings={drawings}
              placement={placement}
              selectedDrawingId={selectedDrawingId}
              drawingsHidden={drawingsHidden}
              // During play App drives cursor via syncReplayReveal — do not pass a
              // stale React cursor (re-renders would yank cameras / look like pause).
              replayCursorTime={
                replayState.playing ? null : replayState.cursorTime
              }
              // Keep React follow=true while playing so useChart does not clobber
              // engines; per-pane detach is handled imperatively below.
              replayFollow={replayState.playing}
              showFollowControl={
                replayState.cursorTime != null && cameraDetached
              }
              onReattachFollow={() => {
                detachedPanesRef.current.clear();
                cameraDetachedRef.current = false;
                setCameraDetached(false);
                for (const p of panesRef.current) {
                  getChart(p.id)?.setReplayFollow(true);
                }
              }}
              drawingToolActive={isDrawingTool(activeTool)}
              drawingsLocked={drawingsLocked}
              onChartPoint={handleChartPoint}
              onCrosshairSample={handleCrosshairForDrawings}
              onDrawingsChange={handleEngineDrawingsChange}
              onDrawingSelect={handleEngineDrawingSelect}
              onUserGesture={(paneId) => {
                detachedPanesRef.current.add(paneId);
                getChart(paneId)?.setReplayFollow(false);
                cameraDetachedRef.current = true;
                setCameraDetached(true);
              }}
            />
            {import.meta.env.DEV && (
              <PerfOverlay barsInMemory={barsInMemory} paneCount={panes.length} />
            )}
            </>
          )}

          {selectedDrawing && selectedDrawing.visible !== false && (
            <div className="pointer-events-none absolute top-2 left-2 right-2 z-40 sm:left-1/2 sm:right-auto sm:top-3 sm:-translate-x-1/2 flex justify-center sm:block">
              <DrawingFloatingToolbar
                drawing={selectedDrawing}
                disabled={drawingsLocked}
                onChange={patchSelectedDrawing}
                onOpenSettings={() => setSettingsOpen(true)}
                onDelete={deleteSelectedDrawing}
              />
            </div>
          )}

          {settingsOpen && selectedDrawing && (
            <DrawingSettingsModal
              drawing={selectedDrawing}
              onChange={replaceSelectedDrawing}
              onClose={() => setSettingsOpen(false)}
            />
          )}

          {chartSettingsOpen && (
            <ChartSettingsModal onClose={() => setChartSettingsOpen(false)} />
          )}
          </div>

          {loadStatus === 'ready' && ticketOpen && (
            <OrderTicket
              open={ticketOpen}
              onClose={() => {
                setTicketOpen(false);
                setTicketDraft(null);
                setTicketLevelPatch(null);
              }}
              symbol={
                (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair ??
                session.legs[0]?.pair ??
                'EURUSD'
              }
              bid={liveBidAsk.bid}
              ask={liveBidAsk.ask}
              digits={orderBridgeRef.current?.getSpec().digits ?? 5}
              pipSize={orderBridgeRef.current?.getSpec().pipSize ?? 0.01}
              tickSize={orderBridgeRef.current?.getSpec().tickSize ?? 0.00001}
              contractSize={orderBridgeRef.current?.getSpec().contractSize ?? 100_000}
              leverage={
                orderBridgeRef.current?.getState().account.leverage ??
                orderBridgeRef.current?.getSpec().leverage ??
                100
              }
              freeMargin={orderBridgeRef.current?.getState().account.freeMargin ?? 10_000}
              accountCurrency={
                orderBridgeRef.current?.getState().account.currency ?? 'USD'
              }
              lastReject={lastOrderReject}
              disabled={replayState.playing}
              levelPatch={ticketLevelPatch}
              onLevelPatchConsumed={() => setTicketLevelPatch(null)}
              onSubmit={submitTicket}
              onDraftChange={setTicketDraft}
            />
          )}
        </div>
      </div>

      {loadStatus === 'ready' && (
        <TradeDock
          key={orderEngineTick}
          activeTab={activeTab}
          state={orderBridgeRef.current?.getState() ?? null}
          spec={orderBridgeRef.current?.getSpec() ?? null}
          bid={liveBidAsk.bid}
          ask={liveBidAsk.ask}
          onCancel={(orderId) => {
            const bridge = orderBridgeRef.current;
            if (!bridge) return;
            bridge.cancel(orderId, replayRef.current.get().cursorTime);
            syncOrdersFromBridge();
          }}
          onSelectPosition={(id) => setSelectedOrderId(id)}
          onClosePosition={(positionId) => {
            const bridge = orderBridgeRef.current;
            if (!bridge) return;
            const pos = bridge.getState().positions[positionId];
            if (!pos) return;
            const pane =
              panesRef.current.find((p) => p.id === activePaneId) ?? panesRef.current[0];
            const last = pane?.bars[pane.bars.length - 1];
            if (!last) return;
            const spread = bridge.getSpec().typicalSpread;
            const cursorTime = replayRef.current.get().cursorTime || last.time;
            const id = `close-${cursorTime}-${bridge.getState().seq + 1}`;
            bridge.submit({
              cursorTime,
              bid: last.close,
              ask: last.close + spread,
              order: {
                id,
                symbol: pos.symbol,
                side: pos.side === 'BUY' ? 'SELL' : 'BUY',
                type: 'MARKET',
                size: pos.size,
                tif: 'IOC',
                createdAt: cursorTime,
              },
            });
            syncOrdersFromBridge();
          }}
        />
      )}
      <BottomBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'analytics') {
            handleOpenJournal(session.id);
            return;
          }
          setActiveTab(tab);
        }}
        replay={replayState}
        onPlay={() => {
          void armReplayPlay();
        }}
        onPause={() => replayRef.current.pause()}
        onToggle={() => {
          if (replayRef.current.get().playing) {
            replayRef.current.pause();
          } else {
            void armReplayPlay();
          }
        }}
        onStep={(d) => {
          // Keep camera where the user left it — only Play / double-click re-attach
          replayRef.current.step(d);
        }}
        onSpeed={(s) => replayRef.current.setSpeed(s)}
        onSeek={(t) => {
          // Scrub keeps camera detached; Play re-attaches
          const prev = replayRef.current.get().cursorTime;
          if (t < prev) {
            // Backward seek with open book: reset engine (report §11.5).
            orderBridgeRef.current?.onSeekBackward(t);
            syncOrdersFromBridge();
          }
          replayRef.current.seek(t);
        }}
        balanceLabel={
          orderBridgeRef.current
            ? orderBridgeRef.current.getState().account.balance.toFixed(2)
            : undefined
        }
        equityLabel={
          orderBridgeRef.current
            ? orderBridgeRef.current.getState().account.equity.toFixed(2)
            : equityLabel
        }
        pnlLabel={
          orderBridgeRef.current
            ? (
                orderBridgeRef.current.getState().account.equity -
                orderBridgeRef.current.getState().account.balance
              ).toFixed(2)
            : pnlLabel
        }
        pnlPositive={
          orderBridgeRef.current
            ? orderBridgeRef.current.getState().account.equity -
                orderBridgeRef.current.getState().account.balance >=
              0
            : pnlPositive
        }
        tradeCount={orderCounts.history}
        pendingCount={orderCounts.pending}
        openCount={orderCounts.open}
        historyCount={orderCounts.history}
      />
    </div>
  );
}
