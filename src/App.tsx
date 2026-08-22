import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Button, toast } from '@heroui/react';
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
import { AdminPage } from '@/components/admin/AdminPage';
import { DrawingFloatingToolbar } from '@/components/drawings/DrawingFloatingToolbar';
import { DrawingSettingsModal } from '@/components/drawings/DrawingSettingsModal';
import { InlineTextEditor } from '@/components/drawings/InlineTextEditor';
import { ObjectTreePanel } from '@/components/drawings/ObjectTreePanel';
import { ChartContextMenu, type ChartContextMenuState } from '@/components/chart/ChartContextMenu';
import { ChartSettingsModal } from '@/components/chart/ChartSettingsModal';
import { ensureExampleAnalyticsSession } from '@/analytics/exampleSession';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { BottomBar } from '@/components/layout/BottomBar';
import { ChartGrid } from '@/components/layout/ChartGrid';
import { LeftToolbar } from '@/components/layout/LeftToolbar';
import { TopBar } from '@/components/layout/TopBar';
import { MarketingHome } from '@/components/landing/MarketingHome';
import { NotFoundPage } from '@/components/NotFoundPage';
import { getSession, updateSessionProgress } from '@/sessions/sessionStore';
import { resolveOpenTimeframe } from '@/sessions/sessionTf';
import { barsMatchTimeframe } from '@/session/barTfGuard';
import { ChartLoadingScreen } from '@/components/ChartLoadingScreen';
import { PerfOverlay } from '@/components/perf/PerfOverlay';
import { getChart } from '@/chart';
import {
  cameraSpanForTf,
  preservedVisibleRange,
} from '@/chart/preserveCamera';
import {
  isViewportRightAnchoredOnTip,
  rangeRightAnchored,
} from '@/chart/rangeAnchor';
/**
 * Per-switch camera preserve.
 * Wall-clock from/to pin the place; tipRatio/span are fallbacks only.
 */
type LiveCamera = {
  anchorTime: number;
  span: number;
  tipRatio: number;
  fromTime?: number;
  toTime?: number;
};
import {
  canAggregateFrom,
  smallestTimeframe,
  timeframeSeconds,
  visibleRangeFromTimeWindow,
} from '@/data/timeframeAgg';
import { createSessionController, needsViewportHeal } from '@/session';
import { truncateAtCursor } from '@/session/derivePane';
import { ledgerAssertTeardown } from '@/dev/resourceLedger';
import { warmCache } from '@/session/warmCache';
import {
  loadDrawings,
  saveDrawings,
  type Drawing,
  type DrawingPoint,
} from '@/drawings/drawingStore';

const EMPTY_DRAWINGS: Drawing[] = [];
import {
  bringDrawingsToFront,
  copyDrawings,
  duplicateDrawings,
  pasteDrawingsFromClipboard,
  sendDrawingsToBack,
} from '@/drawings/drawingClipboard';
import { DrawingHistory } from '@/drawings/drawingHistory';
import {
  capDrawingPoints,
  enforceDrawingBookLimits,
  MAX_DRAWINGS_PER_BOOK,
} from '@/drawings/drawingLimits';
import { applyShiftConstrainIfNeeded } from '@/drawings/constrain';
import { placeDrawingPoint } from '@/drawings/drawingInteraction';
import type { HitResult } from '@/drawings/hitTest';
import {
  magnetSnap,
  type MagnetMode,
} from '@/drawings/magnet';
import { getTool, TOOLS, type DrawingToolId } from '@/drawings/toolRegistry';
import { ensureDatasetIngested } from '@/datasets/ingestDataset';
import {
  ensureRemoteTimeCoverage,
  ensureSessionDataFromServer,
} from '@/datasets/ingestRemoteChunks';
import { getDataset, registerRemoteDataset } from '@/datasets/datasetStore';
import { getRemoteDataset } from '@/datasets/remoteApi';
import { resolveBaseDatasetsForSession } from '@/datasets/resolveBaseDataset';
import { getSeriesMeta, openDb } from '@/data/idbStore';
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
import { mergeAbResults } from '@/backtest/mergeAbResults';
import { getJournalRun, saveJournalResult } from '@/journal/journalStore';
import {
  DEFAULT_BACKTEST_PARAMS,
  normalizeBacktestParams,
  type BacktestEvent,
  type BacktestParams,
  type BacktestResult,
} from '@/types/backtest';
import { compileGraph, firstTfMismatch } from '@/strategy/compileGraph';
import { rulesFromStrategyNodes } from '@/strategy/riskFromGraph';
import { getStrategy } from '@/strategy/strategyStore';
import { isLogicKind } from '@/strategy/pieceRegistry';
import { StrategyRunHud } from '@/components/strategy/StrategyRunHud';
import { ensureOrderBars } from '@/orders/ensureOrderBars';
import { loadJournal } from '@/orders/journal';
import {
  createOrderSessionBridge,
  type OrderSessionBridge,
  type SymbolBarProvider,
} from '@/orders/sessionBridge';
import { isTerminal } from '@/orders/orderTypes';
import {
  OrderTicket,
  type OrderLevelPatch,
  type OrderTicketDraft,
} from '@/components/orders/OrderTicket';
import { TradeDock, tradeDockCounts } from '@/components/orders/TradeDock';
import type { EnabledIndicator } from '@/types/indicator';
import { chartPairKey, ordersForPair, type ChartOrder } from '@/types/order';
import {
  loadViewportAroundTime,
  loadViewportForTimeRange,
  paneNeedsViewportPrefetch,
  timeRangeFromVisible,
  timeToLogicalIndex,
} from '@/datasets/seriesViewport';
import { pickLodTimeframe } from '@/datasets/zoomLod';
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
  BUFFER_BARS,
  CHUNK_SIZE,
  LOD_DEBOUNCE_MS,
  MAX_BACKTEST_BARS,
  MAX_BARS_IN_MEMORY,
  REPLAY_VISIBLE_BARS,
  VISIBLE_BARS_TARGET,
} from '@/utils/constants';
import {
  formatAppRoute,
  parseAppRoute,
  routeRequiresAdmin,
  routeRequiresAuth,
  DEFAULT_APP_TAB,
  type AppTab,
  type AppView,
  type AuthMode,
} from '@/navigation/appRoute';
import { AppShell } from '@/components/shell/AppShell';
import { ProfilePage } from '@/components/shell/ProfilePage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { useChromeTheme } from '@/v9/useChromeTheme';
import { StrategyPage } from '@/components/strategy/StrategyPage';
import { CreateSessionPage } from '@/components/session/CreateSessionPage';
import { JournalPage } from '@/components/journal/JournalPage';
import { LogbookPage } from '@/components/logbook/LogbookPage';
import { ResourcesPage } from '@/components/resources/ResourcesPage';
import { AuthFormPage } from '@/components/auth/AuthFormPage';
import { AuthGate } from '@/components/auth/AuthGate';
import {
  consumeAuthNext,
  rememberAuthNext,
  useAuth,
} from '@/auth/AuthContext';
/** Throttle localStorage writes while replay is playing. */
const REPLAY_PROGRESS_SAVE_MS = 2500;

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

function bootRoute(): {
  view: AppView;
  appTab: AppTab;
  authMode: AuthMode;
  journalSessionId: string | null;
  logbookRouteKey: string | null;
} {
  const route = parseAppRoute();
  if (route.view === 'chart') {
    // Chart restore runs after loadSessionData is ready; keep view=chart.
    return {
      view: route.sessionId ? 'chart' : 'app',
      appTab: 'backtest',
      authMode: 'signin',
      journalSessionId: null,
      logbookRouteKey: null,
    };
  }
  if (route.view === 'app') {
    return {
      view: 'app',
      appTab: route.appTab ?? DEFAULT_APP_TAB,
      authMode: 'signin',
      journalSessionId: route.appTab === 'trades' ? route.sessionId : null,
      logbookRouteKey: route.appTab === 'journal' ? route.journalTradeId ?? null : null,
    };
  }
  if (route.view === 'auth') {
    return {
      view: 'auth',
      appTab: DEFAULT_APP_TAB,
      authMode: route.authMode ?? 'signin',
      journalSessionId: null,
      logbookRouteKey: null,
    };
  }
  return {
    view: route.view,
    appTab: DEFAULT_APP_TAB,
    authMode: 'signin',
    journalSessionId: null,
    logbookRouteKey: null,
  };
}

interface PaneSeries {
  pair: PairSymbol;
  datasetId: string;
  catalog: SeriesCatalog;
}

const SUGGESTED_PANE_TFS: Timeframe[] = ['1m', '5m', '15m', '1h'];

/**
 * Apply preserved camera onto a new TF/symbol buffer.
 * Wall-clock window first (avoids blank tip-only view on 1m→15m).
 */
function applyPreservedCamera(
  chart: {
    setVisibleRange: (
      from: number,
      to: number,
      opts?: { silent?: boolean },
    ) => void;
  },
  bars: readonly ChartBar[],
  preserved: LiveCamera | null,
  span: number,
  tipRatio: number,
): void {
  if (bars.length === 0) return;
  const range = preservedVisibleRange(bars, preserved, span, tipRatio);
  chart.setVisibleRange(range.fromIndex, range.toIndex, { silent: true });
}

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
  const auth = useAuth();
  const [authBusy, setAuthBusy] = useState(false);

  const boot = useMemo(() => bootRoute(), []);
  const [view, setView] = useState<AppView>(boot.view);
  const [appTab, setAppTab] = useState<AppTab>(boot.appTab);
  /** Bump to open New Session modal from the shell Create button. */
  const [createSessionNonce, setCreateSessionNonce] = useState(0);
  const [authMode, setAuthMode] = useState<AuthMode>(boot.authMode);
  const [journalSessionId, setJournalSessionId] = useState<string | null>(
    boot.journalSessionId,
  );
  const [logbookRouteKey, setLogbookRouteKey] = useState<string | null>(
    boot.logbookRouteKey,
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
  /** Collapsed = compact replay strip only; expanded = TradeDock + full bottom chrome. */
  const [tradeChromeExpanded, setTradeChromeExpanded] = useState(() => {
    try {
      return localStorage.getItem('talaria.tradeChrome.expanded') === '1';
    } catch {
      return false;
    }
  });
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
  const ticketOpenRef = useRef(false);
  const ticketDraftRef = useRef<OrderTicketDraft | null>(null);
  ticketOpenRef.current = ticketOpen;
  ticketDraftRef.current = ticketDraft;
  const [ticketLevelPatch, setTicketLevelPatch] = useState<{
    kind: 'entry' | 'sl' | 'tp';
    price: number;
  } | null>(null);
  const orderBridgeRef = useRef<OrderSessionBridge | null>(null);
  const stepOrderEngineRef = useRef<(cursorTime: number) => void>(() => {});
  void orderEngineTick;
  const [backtestTick, setBacktestTick] = useState(0);
  const [backtestParams, setBacktestParams] = useState<BacktestParams>(
    () => ({
      ...DEFAULT_BACKTEST_PARAMS,
      sma: { ...DEFAULT_BACKTEST_PARAMS.sma },
      donchian: { ...DEFAULT_BACKTEST_PARAMS.donchian },
      costs: { ...DEFAULT_BACKTEST_PARAMS.costs },
      rules: { ...DEFAULT_BACKTEST_PARAMS.rules },
    }),
  );
  /** Fingerprints of indicators auto-added by Strategy Run (cleared on Stop). */
  const autoStrategyIndicatorKeysRef = useRef<string[]>([]);
  /** Last puzzle strategy id (watch / A-B). */
  const lastGraphStrategyIdRef = useRef<string | null>(null);
  const [explainEvent, setExplainEvent] = useState<BacktestEvent | null>(null);
  const [watchTip, setWatchTip] = useState(false);
  const [compareResult, setCompareResult] = useState<BacktestResult | null>(null);
  const [abPickMode, setAbPickMode] = useState(false);
  /** Unmerged primary run while A/B overlay is active. */
  const primaryResultRef = useRef<BacktestResult | null>(null);
  const compareResultRef = useRef<BacktestResult | null>(null);
  compareResultRef.current = compareResult;
  const watchTipRef = useRef(false);
  watchTipRef.current = watchTip;
  const watchTimerRef = useRef(0);
  const watchLastCursorRef = useRef<number | null>(null);
  const handleRunGraphStrategyRef = useRef<
    (
      strategyId: string,
      opts?: {
        skipTfPrompt?: boolean;
        asCompare?: boolean;
        tipOnly?: boolean;
      },
    ) => void
  >(() => {});
  const [chartLayout, setChartLayout] = useState<ChartLayout>('1');
  const [layoutSync, setLayoutSync] = useState<LayoutSyncOptions>(DEFAULT_LAYOUT_SYNC);
  const layoutSyncRef = useRef(layoutSync);
  layoutSyncRef.current = layoutSync;
  const { themeAttr: chromeThemeAttr, presetId: chromePresetId } = useChromeTheme();

  /** Per-dataset drawing books — multi-pane/symbol isolation. */
  const [drawingBooks, setDrawingBooks] = useState<Record<string, Drawing[]>>(
    {},
  );
  const drawingBooksRef = useRef(drawingBooks);
  drawingBooksRef.current = drawingBooks;
  const drawingHistoryByDsRef = useRef(new Map<string, DrawingHistory>());
  const historyForDataset = useCallback((datasetId: string) => {
    let h = drawingHistoryByDsRef.current.get(datasetId);
    if (!h) {
      h = new DrawingHistory();
      drawingHistoryByDsRef.current.set(datasetId, h);
    }
    return h;
  }, []);
  const [draftPoints, setDraftPoints] = useState<DrawingPoint[]>([]);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const selectedDrawingId =
    selectedDrawingIds.length > 0
      ? selectedDrawingIds[selectedDrawingIds.length - 1]!
      : null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [chartContextMenu, setChartContextMenu] = useState<ChartContextMenuState | null>(null);
  const [magnetMode, setMagnetMode] = useState<MagnetMode>('off');
  const [drawingShiftHeld, setDrawingShiftHeld] = useState(false);
  const [stayInDrawingMode, setStayInDrawingMode] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [objectTreeOpen, setObjectTreeOpen] = useState(false);
  const [inlineTextId, setInlineTextId] = useState<string | null>(null);
  const [replayTick, setReplayTick] = useState(0);
  /** Engine owns live freehand samples — React only tracks mode for placement tool id. */
  const freehandActiveRef = useRef(false);
  const drawingsRef = useRef<Drawing[]>([]);

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
   * Mirror of replay.playing for edge detection. Must stay in sync even while
   * viewport reload is disabled (teardown/load pause) or the next Play looks stuck.
   */
  const wasPlayingRef = useRef(false);
  /** Invalidates overlapping loadSessionData (Start/Resume race). */
  const loadSessionGenRef = useRef(0);
  /** Bumps when sessionRef is replaced so subscribe rebinds to the live controller. */
  const [sessionCtrlGen, setSessionCtrlGen] = useState(0);
  /**
   * Legacy replay buffers — retained as a safety net for pan LOD path until
   * applyTimeWindowToPanes is fully session-owned. Reveal/TF paths use session.
   */
  const replayBufferRef = useRef<Map<string, ChartBar[]>>(new Map());
  /** Invalidates in-flight pan/zoom IDB window refills (edge prefetch). */
  const prefetchGenRef = useRef(0);
  /** Cancel pending pan/zoom LOD debounce (TF/symbol switch must win). */
  const lodReloadCancelRef = useRef<(() => void) | null>(null);
  /** Bumps on each TF/symbol switch — ignore stale async completions. */
  const paneSwitchGenRef = useRef(0);
  /** Soft completeness heal — one in flight per pane; backoff between attempts. */
  const viewportHealInflightRef = useRef(new Set<string>());
  const viewportHealLastAtRef = useRef(new Map<string, number>());
  /** While set, session notify must not commit (avoids stomping mid-switch). */
  const suppressSessionCommitRef = useRef(false);
  /** User pan/zoom during play detaches camera follow (stops fighting the drag). */
  const [cameraDetached, setCameraDetached] = useState(false);
  /**
   * Imperative detach flag — do NOT mirror from React state every render
   * (that overwrote true→false before setState flushed and re-armed follow,
   * snapping daily charts back to the tip mid-pan).
   */
  const cameraDetachedRef = useRef(false);
  /** Pane ids showing legend … while TF / ticker fills. */
  const [loadingPaneIds, setLoadingPaneIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Per-pane follow detach — panning one chart must not freeze the others. */
  const detachedPanesRef = useRef(new Set<string>());
  /** Per-pane bar-count zoom for Play tip-follow (interval sync off). */
  const paneSpanByIdRef = useRef<Record<string, number>>({});
  /**
   * Last TF/pair switch camera: keep tip candle at the same horizontal fraction
   * and the same bar-count zoom after derive (incl. async warm-cache fills).
   */
  const cameraPreserveRef = useRef<LiveCamera | null>(null);
  /** Open session id for progress persist (survives teardown order). */
  const sessionIdRef = useRef<string | null>(null);
  const lastProgressSaveRef = useRef(0);

  /**
   * Push session PaneViews into React pane state (preserves pane order).
   * `adoptRangePaneIds`: only those panes take session-derived ranges; others keep
   * their prior camera so independent pan/zoom survives TF/pair switches.
   */
  const commitSessionViews = useCallback((opts?: { adoptRangePaneIds?: string[] }) => {
    const views = sessionRef.current.getViews();
    const s = sessionRef.current.get();
    if (!s) return;
    const adopt =
      opts?.adoptRangePaneIds != null
        ? new Set(opts.adoptRangePaneIds)
        : null;
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
        // TF/ticker fill in flight — keep last candles instead of wiping the pane.
        if (
          v.bars.length === 0 &&
          old &&
          old.bars.length > 0 &&
          old.datasetId === cfg.datasetId
        ) {
          next.push({
            ...old,
            timeframe: cfg.tf,
            selectedTf: cfg.selectedTf,
            pair: cfg.pair as PairSymbol,
            datasetId: cfg.datasetId,
          });
          continue;
        }
        // Sync-off TF/symbol switch: non-targets keep bars + camera (shared session
        // camera must not slide sibling buffers / auto Y-scale).
        if (adopt != null && old && !adopt.has(id)) {
          next.push({
            ...old,
            timeframe: cfg.tf,
            selectedTf: cfg.selectedTf,
            pair: cfg.pair as PairSymbol,
            datasetId: cfg.datasetId,
          });
          continue;
        }
        // Keep each pane's camera unless it was an explicit TF/pair target.
        const takeSessionRange = !old || (adopt != null && adopt.has(id));
        next.push({
          id,
          timeframe: v.timeframe,
          selectedTf: v.selectedTf,
          bars: v.bars,
          range: takeSessionRange ? v.range : old.range,
          windowFrom: old?.windowFrom ?? 0,
          totalBars: Math.max(old?.totalBars ?? 0, v.bars.length),
          pair: v.pair as PairSymbol,
          datasetId: v.datasetId,
        });
      }
      panesRef.current = next;
      return next;
    });
  }, []);

  /**
   * Imperative engine sync after TF/pair switch / warm-cache fills.
   * Required during replay: useChart skips React bar props while replayFollow is on.
   * By default only updates bars — never yanks sibling cameras (multi-pane independence).
   *
   * Camera apply: prefer preserved wall-clock window so coarse TF upgrades
   * (1m→15m) keep candles filling the plot. Bar-count span is fallback only.
   */
  const syncEnginesFromSession = useCallback(
    (opts?: {
      paneIds?: readonly string[];
      applyCamera?: boolean;
      /** Keep preserve for a later final apply (heal mid TF-switch). */
      keepPreserve?: boolean;
    }) => {
      const s = sessionRef.current.get();
      const views = sessionRef.current.getViews();
      if (!s) return;
      const replay = replayRef.current.get();
      const cursor = replay.cursorTime;
      const preserved = cameraPreserveRef.current;
      const applyCamera = opts?.applyCamera === true;
      // Wall-clock uses from/to; tipRatio fallback uses converted preserve.span
      // (never the pre-TF 1m bar count once cameraSpanForTf has run).
      const span = Math.max(10, preserved?.span ?? s.span);
      const tipRatio = preserved?.tipRatio ?? 0.9;
      const only =
        opts?.paneIds != null ? new Set(opts.paneIds) : null;

      for (const pane of panesRef.current) {
        if (only && !only.has(pane.id)) continue;
        const chart = getChart(pane.id);
        const v = views[pane.id];
        if (!chart) continue;
        // Empty view during TF/ticker warm-up — leave engine candles alone.
        if (!v || v.bars.length === 0) continue;

        const tipTime = Number.isFinite(cursor)
          ? cursor
          : v.bars[v.bars.length - 1]!.time;
        chart.syncReplayReveal(v.bars, tipTime);

        // Follow before camera apply — setReplayFollow can right-anchor and
        // must not run after we restore the preserved TF-switch viewport.
        if (replay.playing && !detachedPanesRef.current.has(pane.id)) {
          chart.setReplayFollow(true);
        }

        if (applyCamera) {
          applyPreservedCamera(chart, v.bars, preserved, span, tipRatio);
        }
      }

      // Stamp engine cameras back into React panes so adopt/sync don't fight.
      if (applyCamera) {
        const stamped = panesRef.current.map((p) => {
          if (only && !only.has(p.id)) return p;
          const chart = getChart(p.id);
          if (!chart || chart.getBars().length === 0) return p;
          return { ...p, range: chart.getVisibleRange() };
        });
        panesRef.current = stamped;
        setPanes(stamped);
      }

      if (applyCamera && opts?.keepPreserve !== true) {
        cameraPreserveRef.current = null;
      }
    },
    [],
  );

  /**
   * Soft completeness heal — history-biased refresh when the viewport is
   * tip-only / empty-left (e.g. 1m→5m before Play). Coalesced per pane.
   */
  const healViewportIfNeeded = useCallback(
    async (
      paneIds: readonly string[],
      opts?: { force?: boolean; applyCamera?: boolean },
    ): Promise<boolean> => {
      if (!sessionRef.current.get()) return false;
      const force = opts?.force === true;
      const now = performance.now();
      const needy: string[] = [];
      const span = Math.max(10, sessionRef.current.get()?.span ?? 120);
      const cursor = replayRef.current.get().cursorTime;
      const views = sessionRef.current.getViews();

      for (const id of paneIds) {
        if (!force) {
          if (viewportHealInflightRef.current.has(id)) continue;
          const last = viewportHealLastAtRef.current.get(id) ?? 0;
          if (now - last < 1500) continue;
        }
        const v = views[id];
        const engine = getChart(id);
        const bars =
          engine && engine.getBars().length > 0
            ? engine.getBars()
            : (v?.bars ?? []);
        const range = engine?.getVisibleRange() ?? v?.range ?? null;
        const tf =
          v?.timeframe ??
          panesRef.current.find((p) => p.id === id)?.timeframe;
        if (!tf) continue;
        // Count/pad/integrity gate; session healViewportHistory also runs
        // cross-TF candle scan against warm-cache base bars.
        if (
          needsViewportHeal({
            bars,
            span,
            cursorTime: cursor,
            tf,
            range,
          })
        ) {
          needy.push(id);
        }
      }
      if (needy.length === 0) return false;

      for (const id of needy) {
        viewportHealInflightRef.current.add(id);
        viewportHealLastAtRef.current.set(id, now);
      }
      try {
        // Full viewport history refill (not tip-biased topUp) + bar integrity.
        await sessionRef.current.healViewportHistory(needy);
        commitSessionViews({ adoptRangePaneIds: needy });
        syncEnginesFromSession({
          paneIds: needy,
          applyCamera: opts?.applyCamera === true,
        });
        return true;
      } catch (err) {
        console.warn('[viewport] completeness heal failed', err);
        return false;
      } finally {
        for (const id of needy) viewportHealInflightRef.current.delete(id);
      }
    },
    [commitSessionViews, syncEnginesFromSession],
  );

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
      // Never store ≤0 — that maps to a 100% empty future pad after TF switch.
      let tipRatio = (tipIndex - liveRange.fromIndex) / span;
      if (!Number.isFinite(tipRatio) || tipRatio <= 0.05) tipRatio = 0.9;
      else tipRatio = Math.min(1.2, tipRatio);

      // While following replay, the tip time IS the cursor (last revealed candle).
      const following =
        replay.playing && !detachedPanesRef.current.has(paneId);
      const tr = bars.length > 0 ? timeRangeFromVisible(bars, liveRange) : null;
      let anchorTime: number;
      if (following && Number.isFinite(cursor)) {
        anchorTime = cursor;
      } else {
        anchorTime =
          tr?.toTime ??
          bars[bars.length - 1]?.time ??
          (Number.isFinite(cursor) ? cursor : (catalog?.timeEnd ?? 0));
        if (Number.isFinite(cursor)) {
          anchorTime = Math.min(anchorTime, cursor);
        }
      }
      return {
        anchorTime,
        span,
        tipRatio,
        fromTime: tr?.fromTime,
        toTime: tr?.toTime,
      };
    },
    [catalog?.timeEnd],
  );

  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0] ?? null;
  const activeDatasetId =
    activePane?.datasetId ?? catalog?.datasetId ?? '';
  const drawings = drawingBooks[activeDatasetId] ?? EMPTY_DRAWINGS;
  drawingsRef.current = drawings;

  /**
   * TF picker list: active pane’s catalog when interval sync is off;
   * intersection of all pairs when syncing intervals across the layout.
   */
  const availableTimeframes = useMemo(() => {
    const list = seriesRef.current;
    if (layoutSync.interval && list.length > 1) {
      return intersectTimeframes(list);
    }
    const s =
      (activePane &&
        (list.find((x) => x.datasetId === activePane.datasetId) ??
          list.find((x) => x.pair === activePane.pair))) ||
      null;
    return s?.catalog.timeframes ?? catalog?.timeframes ?? [];
  }, [
    layoutSync.interval,
    activePane?.datasetId,
    activePane?.pair,
    catalog?.datasetId,
    catalog?.timeframes,
    panes.length,
    session?.id,
  ]);
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
    // Freehand points live in the engine while stroking.
    if (getTool(activeTool).points.kind === 'freehand') {
      return {
        tool: activeTool,
        points: freehandActiveRef.current ? draftPoints : [],
        freehandActive: freehandActiveRef.current,
      };
    }
    return {
      tool: activeTool,
      points: draftPoints,
      freehandActive: false,
    };
  }, [activeTool, draftPoints]);

  /** Armed for fixed-2 tools; engine skips when a click-click point is already pending. */
  const placeDragEnabled = useMemo(() => {
    if (!isDrawingTool(activeTool)) return false;
    const mode = getTool(activeTool).points;
    return mode.kind === 'fixed' && mode.count === 2;
  }, [activeTool]);

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) ?? null;
  const selectedDrawings = useMemo(
    () => drawings.filter((d) => selectedDrawingIds.includes(d.id)),
    [drawings, selectedDrawingIds],
  );

  const persistDrawings = useCallback(
    (
      next: Drawing[],
      opts?: { skipHistory?: boolean; datasetId?: string },
    ) => {
      const ds = opts?.datasetId ?? activeDatasetId;
      if (!ds) return;
      const prev = drawingBooksRef.current[ds] ?? [];
      // Soft book cap — refuse growth past limit (deletes / edits still apply).
      // Undo/redo (skipHistory) may restore a legacy oversized book → trim on load rules.
      if (opts?.skipHistory) {
        const loaded = enforceDrawingBookLimits(next, { forLoad: true }).drawings;
        setDrawingBooks((prevBooks) => ({ ...prevBooks, [ds]: loaded }));
        if (session) saveDrawings(`${session.id}:${ds}`, loaded);
        return;
      }
      const capped = enforceDrawingBookLimits(next);
      if (!capped.ok && next.length > prev.length) {
        toast.info('Drawing limit reached', {
          description:
            capped.reason === 'count'
              ? `Max ${MAX_DRAWINGS_PER_BOOK} drawings per symbol. Delete some to add more.`
              : 'Drawing book is too large to save. Simplify freehand strokes or delete some.',
          timeout: 4500,
        });
        return;
      }
      const list = capped.ok ? capped.drawings : next.map(capDrawingPoints);
      if (!opts?.skipHistory) {
        historyForDataset(ds).push(prev);
      }
      setDrawingBooks((prevBooks) => ({ ...prevBooks, [ds]: list }));
      if (session) {
        saveDrawings(`${session.id}:${ds}`, list);
      }
    },
    [session, activeDatasetId, historyForDataset],
  );

  /** Ensure a dataset book is loaded (symbol switch / new pane). */
  const ensureDrawingBook = useCallback(
    (datasetId: string) => {
      if (!session || !datasetId) return;
      if (drawingBooksRef.current[datasetId]) return;
      const loaded = loadDrawings(`${session.id}:${datasetId}`);
      setDrawingBooks((prev) =>
        prev[datasetId] ? prev : { ...prev, [datasetId]: loaded },
      );
    },
    [session],
  );

  // Drop selection that does not belong to the focused instrument book.
  useEffect(() => {
    if (!activeDatasetId) return;
    const book = drawingBooksRef.current[activeDatasetId] ?? EMPTY_DRAWINGS;
    setSelectedDrawingIds((ids) => {
      const next = ids.filter((id) => book.some((d) => d.id === id));
      return next.length === ids.length ? ids : next;
    });
  }, [activeDatasetId]);

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
   * Clock grid = dataset base TF.
   * Advance rate = finest (smallest) pane TF among all charts — e.g. 1m/5m/1h/4h
   * → play at 1m speed so every pane stays in sync, not the focused pane’s TF.
   */
  const syncReplayClockTf = useCallback((paneList?: readonly ChartPaneState[]) => {
    const list = paneList ?? panesRef.current;
    const base = catalog?.baseTf ?? '1m';
    replayRef.current.setBaseTf(base);
    if (list.length === 0) return;
    const rate = smallestTimeframe(
      list.map((p) => p.selectedTf ?? p.timeframe),
    );
    replayRef.current.setRateTf(rate);
  }, [catalog?.baseTf]);

  /**
   * Pan/zoom IDB refill + zoom LOD:
   * - Mid-buffer sync ticks skip IDB (engines already remapped via chart sync).
   * - Near buffer edge → refetch same TF (Step 9).
   * - Zoom density → switch to coarser/finer pre-agg TF (≥ selectedTf floor).
   * Generation-token guarded; wall-clock window preserved across TF switches.
   */
  /**
   * Edge-prefetch / LOD reload for a wall-clock window.
   * When `onlyPaneId` is set (sync off), only that pane is touched.
   * `skipLod`: history fill only (session-load / left-pad) — never coarsen TF.
   * Empty-pad wall-clock can span months via index extrapolation and used to
   * arm LOD → 1D while TopBar still showed selectedTf (e.g. 1m) after reload.
   * While Play tip-follow is active: warm-cache merge only — never stomp engines.
   */
  const applyTimeWindowToPanes = useCallback(
    async (
      fromTime: number,
      toTime: number,
      onlyPaneId?: string,
      opts?: { skipLod?: boolean },
    ) => {
      if (!catalog || !viewportReloadEnabledRef.current) return;
      const current = panesRef.current;
      if (current.length === 0) return;

      const windowSec = Math.max(0, toTime - fromTime);
      const skipLod = opts?.skipLod === true;
      const lodTfs = current.map((p) => {
        const floor = p.selectedTf ?? p.timeframe;
        if (skipLod) return floor;
        const series = seriesForPane(p);
        const available = series?.catalog.timeframes ?? [p.timeframe];
        return pickLodTimeframe({
          windowSec,
          selectedTf: floor,
          available,
          currentTf: p.timeframe,
        });
      });

      const needsFetch = current.map((p, i) => {
        if (onlyPaneId && p.id !== onlyPaneId) return false;
        if (!skipLod && lodTfs[i] !== p.timeframe) return true;
        return paneNeedsViewportPrefetch(p, fromTime, toTime);
      });
      if (!needsFetch.some(Boolean)) return;

      const gen = ++prefetchGenRef.current;

      const updated = await Promise.all(
        current.map(async (p, i) => {
          if (!needsFetch[i]) return p; // keep buffer + identity — no React churn

          const loadTf = lodTfs[i]!;
          const ds = getDataset(p.datasetId);
          const period = timeframeSeconds(loadTf);
          // Pan: IDB window covering [fromTime, toTime]; top up remote if history/tip short.
          let vp = await loadViewportForTimeRange(
            p.datasetId,
            loadTf,
            fromTime,
            toTime,
          );
          const historyShort =
            vp.bars.length === 0 || vp.bars[0]!.time > fromTime + period;
          const tipShort =
            vp.bars.length > 0 &&
            vp.bars[vp.bars.length - 1]!.time < toTime - period;
          if ((!ds || ds.source === 'remote') && (historyShort || tipShort)) {
            try {
              const fetchFrom = historyShort
                ? fromTime - period * Math.max(64, Math.floor(BUFFER_BARS * 0.5))
                : fromTime;
              await ensureRemoteTimeCoverage(
                p.datasetId,
                loadTf,
                fetchFrom,
                toTime,
                { maxBars: CHUNK_SIZE },
              );
              vp = await loadViewportForTimeRange(
                p.datasetId,
                loadTf,
                fromTime,
                toTime,
              );
            } catch {
              // keep prior window if server top-up fails
            }
          }
          if (vp.bars.length === 0) return p; // keep previous window

          // Replay: never paint bars ahead of the cursor (no lookahead).
          const sess = sessionRef.current.get();
          const cursor = replayRef.current.get().cursorTime;
          let bars = vp.bars;
          let range = vp.range;
          if (
            sess?.revealMode === 'replay' &&
            Number.isFinite(cursor) &&
            cursor > 0
          ) {
            const baseBars =
              warmCache.peek(p.datasetId, sess.baseTf) ?? [];
            const truncated = truncateAtCursor(
              bars,
              cursor,
              loadTf,
              'replay',
              sess.baseTf,
              baseBars,
            );
            if (truncated.length > 0) {
              bars = truncated;
              range = visibleRangeFromTimeWindow(
                bars,
                fromTime,
                Math.min(toTime, cursor),
              );
            }
          }

          // Merge full IDB window into warm cache — never replace with a shorter
          // tip (left-pad used to wipe Play fill-ahead runway on cold devices).
          // Never put truncated reveal bars (shared key starves every pane).
          warmCache.mergePut(
            p.datasetId,
            loadTf,
            vp.bars,
            Number.isFinite(cursor) && cursor > 0
              ? Math.min(toTime, cursor)
              : toTime,
          );

          const next = paneFromViewport(
            p.id,
            loadTf,
            { ...vp, bars, range },
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

      // Play tip-follow owns engines via syncReplayReveal. Session-load left-pad
      // (slow on new browser/IDB) must not finish mid-Play and setViewportBars /
      // replace React panes with a cursor-truncated snapshot — that froze replay
      // until TF switch or Pause→Play rebuilt from cache.
      const followPlay =
        replayRef.current.get().playing &&
        !cameraDetachedRef.current &&
        detachedPanesRef.current.size === 0;
      if (followPlay) {
        return;
      }

      // Merge against latest identity — a TF/symbol switch may have won mid-await.
      // Never stomp selectedTf / dataset / pair from a pre-switch snapshot.
      const latest = panesRef.current;
      const merged = updated.map((p, i) => {
        const snap = current[i]!;
        const now = latest.find((x) => x.id === p.id);
        if (!now) return p;
        if (
          now.selectedTf !== snap.selectedTf ||
          now.datasetId !== snap.datasetId ||
          now.pair !== snap.pair
        ) {
          return now;
        }
        return p;
      });

      const tfChanged = merged.some(
        (p, i) => p.timeframe !== current[i]!.timeframe,
      );

      // Push engines immediately (don't wait on React) so left-pan history shows.
      // Preserve live *candle count* (bar span) — wall-clock-only remap on gappy
      // 1m (weekends) inflated the span after TV-style LOD pin and looked like
      // zoom/scale broke.
      for (let i = 0; i < merged.length; i++) {
        if (!needsFetch[i]) continue;
        const p = merged[i]!;
        const chart = getChart(p.id);
        if (!chart || p.bars.length === 0) continue;
        const prevBars = chart.getBars();
        const prevRange = chart.getVisibleRange();
        const prevSpan =
          prevBars.length > 0
            ? Math.max(
                10,
                Math.min(
                  VISIBLE_BARS_TARGET,
                  prevRange.toIndex - prevRange.fromIndex,
                ),
              )
            : 0;
        const keep =
          prevBars.length > 0
            ? timeRangeFromVisible(prevBars, prevRange)
            : null;
        chart.setViewportBars(p.bars);

        let nextRange = p.range;
        if (prevSpan > 0) {
          if (isViewportRightAnchoredOnTip(prevRange, prevBars.length)) {
            nextRange = rangeRightAnchored(
              Math.max(0, p.bars.length - 1),
              prevSpan,
            );
          } else if (keep) {
            const mapped = visibleRangeFromTimeWindow(
              p.bars,
              keep.fromTime,
              keep.toTime,
            );
            if (mapped.toIndex > mapped.fromIndex) {
              const mappedSpan = mapped.toIndex - mapped.fromIndex;
              if (
                mappedSpan > prevSpan * 1.25 ||
                mappedSpan > VISIBLE_BARS_TARGET
              ) {
                const mid = (mapped.fromIndex + mapped.toIndex) / 2;
                nextRange = {
                  fromIndex: mid - prevSpan / 2,
                  toIndex: mid + prevSpan / 2,
                };
              } else {
                nextRange = mapped;
              }
            }
          }
        }

        chart.setVisibleRange(nextRange.fromIndex, nextRange.toIndex, {
          silent: true,
        });
        merged[i] = { ...p, range: nextRange };
      }

      panesRef.current = merged;
      setPanes(merged);

      // Keep session pane TFs in sync when zoom LOD mutates effective timeframe.
      // No rederive — React already holds the LOD-loaded bars.
      const sess = sessionRef.current.get();
      if (sess) {
        const nextCfgs = { ...sess.panes };
        for (const p of merged) {
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
      if (tfChanged) syncReplayClockTf(merged);
    },
    [catalog, paneFromViewport, seriesForPane, syncReplayClockTf],
  );

  /** Save replay cursor (+ zoom + TopBar TF) so exit/refresh resumes mid-session. */
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
    const activeId = sess?.activePaneId ?? panesRef.current[0]?.id;
    const activePane =
      panesRef.current.find((p) => p.id === activeId) ?? panesRef.current[0];
    const selectedTf = activePane?.selectedTf ?? activePane?.timeframe;
    const updated = updateSessionProgress(id, {
      cursorTime: rs.cursorTime,
      span: sess?.span,
      ...(selectedTf ? { selectedTf } : {}),
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

      if (playing) {
        // Snapshot live bar-count zooms so 1m vs 1h panes keep independent spans.
        for (const pane of panesRef.current) {
          const live = getChart(pane.id)?.getVisibleRange();
          if (!live) continue;
          const span = live.toIndex - live.fromIndex;
          if (span >= 10) {
            paneSpanByIdRef.current[pane.id] = span;
          }
        }

        // Default follow while playing; detachedPaneIds keeps siblings tip-chasing.
        sessionRef.current.setCursorTime(cursorTime, {
          follow: true,
          react: false,
          detachedPaneIds: detachedPanesRef.current,
          paneSpans: paneSpanByIdRef.current,
        });

        // Skip weekend / holiday dead air once the next session is cached.
        // Independent of camera follow — a detached pan must not leave the
        // clock crawling wall-time through Saturday (looks like Play died).
        const gapJump = sessionRef.current.suggestGapJump();
        if (gapJump != null && gapJump > cursorTime) {
          replayRef.current.seek(gapJump, { keepPlaying: true });
          return;
        }

        // Step order engine on every base bar the cursor passes (§4.1).
        stepOrderEngineRef.current(cursorTime);
        const views = sessionRef.current.getViews();
        if (opts?.playEdge) {
          detachedPanesRef.current.clear();
          cameraDetachedRef.current = false;
          setCameraDetached(false);
        }

        for (const pane of panesRef.current) {
          const chart = getChart(pane.id);
          if (!chart) continue;
          const v = views[pane.id];
          const paneDetached = detachedPanesRef.current.has(pane.id);

          // Keep follow alive on every tick for panes the user hasn't panned.
          // Never re-attach a detached pane here (that snaps 1D back to the tip).
          if (!paneDetached) {
            chart.setReplayFollow(true);
          }

          if (v && v.bars.length > 0) {
            // Append/patch revealed bars as cursor advances.
            // Detached panes still get bars, but syncReplayReveal won't recenter
            // when engine replayFollow is false.
            chart.syncReplayReveal(v.bars, cursorTime);
          } else {
            // Cache/view not ready — advance paint mask on whatever the engine has.
            chart.setReplayCursorTime(cursorTime);
          }

          if (opts?.playEdge && v && v.bars.length > 0 && !paneDetached) {
            // Ensure zoom is not a collapsed 1-bar window after a cold start.
            const span = Math.max(
              10,
              paneSpanByIdRef.current[pane.id] ??
                sessionRef.current.get()?.span ??
                120,
            );
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
      for (const pane of panesRef.current) {
        const r = getChart(pane.id)?.getVisibleRange();
        if (!r) continue;
        const sp = r.toIndex - r.fromIndex;
        if (sp >= 10) paneSpanByIdRef.current[pane.id] = sp;
      }
      sessionRef.current.setCursorTime(cursorTime, {
        follow: detachedPanesRef.current.size === 0,
        react: true,
        detachedPaneIds: detachedPanesRef.current,
        paneSpans: paneSpanByIdRef.current,
      });
      stepOrderEngineRef.current(cursorTime);
      commitSessionViews();
      // Remap engines by wall-clock (step/seek) — React index ranges go stale when
      // the warm-cache window slides under the tip.
      syncEnginesFromSession({ applyCamera: false });
    },
    [activePaneId, catalog, commitSessionViews, syncEnginesFromSession],
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

  /** Resolve datasetId for an order-engine symbol key. */
  const datasetIdForOrderSymbol = useCallback((symbol: string): string | null => {
    const key = chartPairKey(symbol);
    return (
      seriesRef.current.find((s) => chartPairKey(s.pair) === key)?.datasetId ??
      panesRef.current.find((p) => chartPairKey(p.pair) === key)?.datasetId ??
      null
    );
  }, []);

  /** Merge open-ticket Preview into engine book for imperative Play pushes. */
  const ordersWithTicketDraft = useCallback(
    (engineOrders: readonly ChartOrder[]): ChartOrder[] => {
      const draft = ticketDraftRef.current;
      if (!ticketOpenRef.current || !draft) return [...engineOrders];
      const pair =
        panesRef.current.find((p) => p.id === activePaneId)?.pair ??
        panesRef.current[0]?.pair ??
        '';
      if (!pair) return [...engineOrders];
      const draftOrder: ChartOrder = {
        id: '__draft__',
        sessionId: sessionIdRef.current ?? '',
        pair,
        side: draft.side === 'BUY' ? 'buy' : 'sell',
        entry: draft.entry,
        stopLoss: draft.stopLoss,
        takeProfit: draft.takeProfit,
        createdAt: 0,
        draft: true,
        working: false,
      };
      return [...engineOrders, draftOrder];
    },
    [activePaneId],
  );

  /** Push engine orders to each pane, filtered to that pane's symbol. */
  const pushOrdersToPanes = useCallback(
    (chartOrders: readonly ChartOrder[], selectedId: string | null) => {
      const withDraft = ordersWithTicketDraft(chartOrders);
      for (const pane of panesRef.current) {
        const forPane = ordersForPair(withDraft, pane.pair);
        const sel =
          selectedId && forPane.some((o) => o.id === selectedId)
            ? selectedId
            : null;
        getChart(pane.id)?.setOrders(forPane, sel);
      }
    },
    [ordersWithTicketDraft],
  );

  /**
   * Keep base-TF runway warm for every open/working symbol so Play cannot
   * silently stall fills on an off-focus multi-pane pair.
   */
  const ensureExposureRunway = useCallback(
    async (cursorTime: number) => {
      const bridge = orderBridgeRef.current;
      const sess = sessionRef.current.get();
      if (!bridge || !sess || !(cursorTime > 0)) return;
      const symbols = bridge.getExposureSymbols();
      if (symbols.length === 0) {
        warmCache.pinExtra([]);
        return;
      }
      const period = timeframeSeconds(sess.baseTf);
      const lookback = Math.max(60, sess.span) * period;
      const ahead = Math.max(180, sess.span) * period;
      const fromTime = Math.max(0, cursorTime - lookback);
      const toTime = cursorTime + ahead;
      const pins: { datasetId: string; tf: Timeframe }[] = [];
      await Promise.all(
        symbols.map(async (sym) => {
          const ds = datasetIdForOrderSymbol(sym);
          if (!ds) return;
          pins.push({ datasetId: ds, tf: sess.baseTf });
          const peek = warmCache.peek(ds, sess.baseTf);
          const tip = peek && peek.length > 0 ? peek[peek.length - 1]!.time : 0;
          if (tip >= toTime - period) return;
          await ensureOrderBars(ds, sess.baseTf, fromTime, toTime);
        }),
      );
      warmCache.pinExtra(pins);
    },
    [datasetIdForOrderSymbol],
  );

  /**
   * Sync bar provider: prefer an explicit preload map (rebuild/seek), else warmCache.
   */
  const makeOrderBarProvider = useCallback(
    (
      baseTf: Timeframe,
      cursorCap: number,
      preload?: ReadonlyMap<string, readonly ChartBar[]>,
    ): SymbolBarProvider => {
      return (symbol, fromExclusive, toInclusive) => {
        const ds = datasetIdForOrderSymbol(symbol);
        if (!ds) return [];
        const raw = preload?.get(ds) ?? warmCache.peek(ds, baseTf) ?? [];
        const out: ChartBar[] = [];
        for (const b of raw) {
          if (b.time <= fromExclusive) continue;
          if (b.time > toInclusive) break;
          if (b.time > cursorCap) break;
          out.push(b);
        }
        return out;
      };
    },
    [datasetIdForOrderSymbol],
  );

  /** Load IDB bars for every session leg covering [fromTime, toTime]. */
  const ensureAllOrderBars = useCallback(
    async (
      baseTf: Timeframe,
      fromTime: number,
      toTime: number,
    ): Promise<Map<string, ChartBar[]>> => {
      const map = new Map<string, ChartBar[]>();
      const legs =
        seriesRef.current.length > 0
          ? seriesRef.current.map((s) => ({
              datasetId: s.datasetId,
            }))
          : panesRef.current.map((p) => ({ datasetId: p.datasetId }));
      const seen = new Set<string>();
      await Promise.all(
        legs.map(async ({ datasetId }) => {
          if (!datasetId || seen.has(datasetId)) return;
          seen.add(datasetId);
          const bars = await ensureOrderBars(
            datasetId,
            baseTf,
            fromTime,
            toTime,
          );
          map.set(datasetId, bars);
        }),
      );
      return map;
    },
    [],
  );

  const lastOrderOverlayAtRef = useRef(0);
  const lastOrderChromeAtRef = useRef(0);
  const lastExposureEnsureAtRef = useRef(0);
  const selectedOrderIdRef = useRef(selectedOrderId);
  selectedOrderIdRef.current = selectedOrderId;
  stepOrderEngineRef.current = (cursorTime: number) => {
    const bridge = orderBridgeRef.current;
    const sess = sessionRef.current.get();
    if (!bridge || !sess) return;
    // Multi-pair: each symbol steps on its own base-TF bars (not the viewed pane).
    bridge.advanceTo(
      cursorTime,
      makeOrderBarProvider(sess.baseTf, cursorTime),
    );
    const playing = replayRef.current.get().playing;
    if (!playing) {
      const chartOrders = bridge.toChartOrders(sessionIdRef.current ?? '');
      pushOrdersToPanes(chartOrders, selectedOrderIdRef.current);
      syncOrdersFromBridge();
      return;
    }
    const now = performance.now();
    // Keep traded-pair runway warm (~2Hz) without blocking the play clock.
    if (now - lastExposureEnsureAtRef.current >= 500) {
      lastExposureEnsureAtRef.current = now;
      void ensureExposureRunway(cursorTime);
    }
    // Engine advances every bar; overlays ~10Hz, React chrome ~5Hz (Play budget).
    if (now - lastOrderOverlayAtRef.current >= 100) {
      lastOrderOverlayAtRef.current = now;
      const chartOrders = bridge.toChartOrders(sessionIdRef.current ?? '');
      pushOrdersToPanes(chartOrders, selectedOrderIdRef.current);
      if (now - lastOrderChromeAtRef.current >= 200) {
        lastOrderChromeAtRef.current = now;
        setOrders(chartOrders);
        setOrderEngineTick((n) => n + 1);
      }
    }
  };

  // Order-level drag context + commit (overlay-only during drag; one modify on up).
  useEffect(() => {
    const bridge = orderBridgeRef.current;
    if (!bridge || loadStatus !== 'ready') return;
    const st = bridge.getState();
    const unsubs: Array<() => void> = [];
    for (const pane of panesRef.current) {
      const chart = getChart(pane.id);
      if (!chart?.setOrderDragContext) continue;
      const container = chart.canvas.parentElement;
      if (!container) continue;
      const spec = bridge.getSpec(pane.pair);
      const last = pane.bars[pane.bars.length - 1];
      const bid = last?.close ?? 0;
      const ask = bid > 0 ? bid + spec.typicalSpread : 0;
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
        assetClass: spec.assetClass,
        quantityUnit: spec.quantityUnit,
        equity: st.account.equity,
        riskPercent: 0.01,
        riskLocked: true,
        container,
        bid,
        ask,
      });
      unsubs.push(
        chart.onOrderLevelLive((hit) => {
          // Draft ticket: live price/pips while dragging (rAF-coalesced).
          if (hit.orderId === '__draft__') {
            setTicketLevelPatch({
              kind: hit.kind,
              price: hit.price,
            } satisfies OrderLevelPatch);
          }
        }),
      );
      unsubs.push(
        chart.onOrderLevelCommit((hit) => {
          if (hit.cancelled) {
            syncOrdersFromBridge();
            return;
          }
          // Draft ticket levels → final sync on mouseup
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
          const state = b.getState();
          const hitOrder =
            state.orders[hit.orderId] ??
            state.workingIds
              .map((id) => state.orders[id])
              .find((o) => o && o.positionId === hit.orderId);
          const hitSym =
            hitOrder?.symbol ??
            state.positions[hit.orderId]?.symbol ??
            pane.pair;
          const paneForSym =
            panesRef.current.find(
              (p) => chartPairKey(p.pair) === chartPairKey(hitSym),
            ) ?? pane;
          const last = paneForSym.bars[paneForSym.bars.length - 1];
          const bid = last?.close ?? hit.price;
          const ask = bid + b.getSpec(hitSym).typicalSpread;

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
    // Never start the clock on a half-loaded chart (wasPlayingRef desync / empty play).
    if (!viewportReloadEnabledRef.current) return;
    // TF/symbol switch owns suppress — do not clear it or play mid-swap.
    if (suppressSessionCommitRef.current) return;
    const s0 = sessionRef.current.get();
    if (!s0 || panesRef.current.length === 0) return;
    const armSessionId = sessionIdRef.current;
    const armLoadGen = loadSessionGenRef.current;

    detachedPanesRef.current.clear();
    cameraDetachedRef.current = false;
    setCameraDetached(false);
    // Lock play rate to finest pane TF before the first tick.
    syncReplayClockTf();

    const s = sessionRef.current.get();
    const list = panesRef.current;
    if (!s || list.length === 0) return;

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

    // Sync session zoom to the live engine before Play so tip-follow / fills
    // don't use a stale 1m bar-count left over from a TF switch.
    const focusId = s.activePaneId || list[0]!.id;
    const liveZoom = getChart(focusId)?.getVisibleRange();
    if (liveZoom) {
      sessionRef.current.setSpan(
        Math.max(10, liveZoom.toIndex - liveZoom.fromIndex),
      );
    }
    // Capture each pane's bar-count zoom (multi-TF layouts stay independent).
    for (const p of list) {
      const live = getChart(p.id)?.getVisibleRange();
      if (!live) continue;
      const span = live.toIndex - live.fromIndex;
      if (span >= 10) paneSpanByIdRef.current[p.id] = span;
    }

    try {
      if (!configsMatch || !allHaveBars || list.length !== Object.keys(s.panes).length) {
        await sessionRef.current.replacePanes(cfgs, s.activePaneId);
        const ids = list.map((p) => p.id);
        commitSessionViews({ adoptRangePaneIds: ids });
        // Bars only — do not re-apply a stale preserve / huge span camera.
        syncEnginesFromSession({ paneIds: ids, applyCamera: false });
      } else {
        // Never block the clock on cache top-up (was freezing Play after 1m→15m).
        void sessionRef.current.topUpCaches().catch((err) => {
          console.warn('[replay] background top-up failed', err);
        });
      }
    } catch (err) {
      console.warn('[replay] arm multi-pane caches failed', err);
    }

    // Session may have been torn down / switched during await.
    if (!viewportReloadEnabledRef.current) return;
    if (sessionIdRef.current !== armSessionId) return;
    if (loadSessionGenRef.current !== armLoadGen) return;
    if (suppressSessionCommitRef.current) return;
    if (!sessionRef.current.get()) return;

    // Wait until every pane has a mounted engine + revealed bars (8-layout
    // expand can finish replacePanes before ChartPane registers). Does not
    // change cameras — only gates when the clock may start.
    {
      const deadline =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) +
        2500;
      for (;;) {
        if (!viewportReloadEnabledRef.current) return;
        if (sessionIdRef.current !== armSessionId) return;
        if (loadSessionGenRef.current !== armLoadGen) return;
        const latest = panesRef.current;
        const viewsNow = sessionRef.current.getViews();
        const ready =
          latest.length > 0 &&
          latest.every(
            (p) =>
              getChart(p.id) != null && (viewsNow[p.id]?.bars.length ?? 0) > 0,
          );
        if (ready) break;
        const now =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now >= deadline) break;
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
    }

    for (const pane of panesRef.current) {
      const chart = getChart(pane.id);
      if (!chart) continue;
      chart.setReplayFollow(true);
    }
    // Ticket is disabled during Play — close Preview so it cannot look like a
    // stuck Pending, and so imperative pushes stay clean.
    setTicketOpen(false);
    setTicketDraft(null);
    ticketOpenRef.current = false;
    ticketDraftRef.current = null;

    // Warm + pin every open/working symbol before the clock starts.
    const cursor = replayRef.current.get().cursorTime || s.cursorTime;
    await ensureExposureRunway(cursor);
    if (!viewportReloadEnabledRef.current) return;
    if (sessionIdRef.current !== armSessionId) return;

    // Push current book before the first play tick so levels don't flash empty
    // while replayFollow blocks React → setOrders.
    const bridge = orderBridgeRef.current;
    if (bridge) {
      pushOrdersToPanes(
        bridge.toChartOrders(sessionIdRef.current ?? ''),
        selectedOrderIdRef.current,
      );
    }
    replayRef.current.play();
  }, [
    commitSessionViews,
    ensureExposureRunway,
    pushOrdersToPanes,
    syncEnginesFromSession,
    syncReplayClockTf,
  ]);

  /** Journal → chart deep link (consumed once per open / soft return). */
  const pendingJournalFocusRef = useRef<{
    time: number;
    tradeId?: string | null;
    runId?: string | null;
  } | null>(null);
  const focusHighlightTimerRef = useRef(0);

  const clearChartFocusHash = useCallback((sessionId: string) => {
    const clean = formatAppRoute({
      view: 'chart',
      appTab: null,
      authMode: null,
      sessionId,
      focusTime: null,
      focusTradeId: null,
    });
    if (window.location.hash === clean) return;
    suppressHashRef.current = true;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${clean}`,
    );
    queueMicrotask(() => {
      suppressHashRef.current = false;
    });
  }, []);

  const applyJournalFocus = useCallback(
    (focus: { time: number; tradeId?: string | null }) => {
      if (!sessionRef.current.get()) return;
      const rs = replayRef.current.get();
      if (!(rs.endTime > rs.startTime)) return;
      const t = Math.min(rs.endTime, Math.max(rs.startTime, focus.time));
      replayRef.current.pause();
      cameraDetachedRef.current = false;
      setCameraDetached(false);
      detachedPanesRef.current.clear();
      replayRef.current.seek(t, { silent: true });
      lastReplayCursorRef.current = t;

      void (async () => {
        const sess = sessionRef.current.get();
        if (!sess) return;
        for (const cfg of Object.values(sess.panes)) {
          await warmCache.fill(cfg.datasetId, cfg.tf, t, sess.span);
          if (cfg.tf !== sess.baseTf) {
            await warmCache.fill(cfg.datasetId, sess.baseTf, t, sess.span);
          }
        }
        if (!sessionRef.current.get()) return;
        sessionRef.current.setCursorTime(t, { follow: true, react: true });
        const ids = Object.keys(sessionRef.current.getViews());
        commitSessionViews({ adoptRangePaneIds: ids });
        syncEnginesFromSession({ applyCamera: true });
        applyReplayReveal(t, { playEdge: true });
        persistReplayProgress(true);
      })();

      if (focus.tradeId) {
        setSelectedOrderId(focus.tradeId);
        if (focusHighlightTimerRef.current) {
          window.clearTimeout(focusHighlightTimerRef.current);
        }
        const tid = focus.tradeId;
        focusHighlightTimerRef.current = window.setTimeout(() => {
          setSelectedOrderId((prev) => (prev === tid ? null : prev));
        }, 5000);
      }
    },
    [applyReplayReveal, commitSessionViews, persistReplayProgress, syncEnginesFromSession],
  );

  const loadSessionData = useCallback(
    async (
      next: BacktestSession,
      focus?: { time: number; tradeId?: string | null },
    ) => {
      const loadGen = ++loadSessionGenRef.current;
      viewportReloadEnabledRef.current = false;
      wasPlayingRef.current = false;
      lastReplayCursorRef.current = null;
      lastProgressSaveRef.current = 0;
      replayBufferRef.current.clear();
      cameraDetachedRef.current = false;
      setCameraDetached(false);
      // Pause before gate stays false so subscribe can still sync wasPlayingRef;
      // we also reset the mirror above in case a prior notify was swallowed.
      replayRef.current.pause();
      sessionRef.current.dispose();
      sessionRef.current = createSessionController();
      setSessionCtrlGen((n) => n + 1);

      // Prefer disk copy so reopen after exit picks up last saved cursor.
      const fresh = getSession(next.id) ?? next;
      sessionIdRef.current = fresh.id;

      // Capture journal deep link before awaits (hash sync may strip ?t=).
      const routeAtStart = parseAppRoute();
      const journalFocus =
        focus ??
        pendingJournalFocusRef.current ??
        (routeAtStart.view === 'chart' &&
        routeAtStart.sessionId === fresh.id &&
        routeAtStart.focusTime != null
          ? {
              time: routeAtStart.focusTime,
              tradeId: routeAtStart.focusTradeId ?? null,
            }
          : null);
      pendingJournalFocusRef.current = null;

      setSession(fresh);
      setLoadStatus('loading');
      setLoadError(null);
      setIngestPct(0);
      setView('chart');
      setPanes([]);
      panesRef.current = [];
      seriesRef.current = [];
      setDraftPoints([]);

      // Strategy automation only when Create Session picked a playbook.
      if (fresh.strategyId) {
        const strat = getStrategy(fresh.strategyId);
        if (strat) {
          const compiled = compileGraph(strat.nodes, strat.edges);
          if (compiled.ok && compiled.graph) {
            setBacktestParams({
              ...DEFAULT_BACKTEST_PARAMS,
              sma: { ...DEFAULT_BACKTEST_PARAMS.sma },
              donchian: { ...DEFAULT_BACKTEST_PARAMS.donchian },
              costs: { ...DEFAULT_BACKTEST_PARAMS.costs },
              rules: rulesFromStrategyNodes(strat.nodes, {
                ...DEFAULT_BACKTEST_PARAMS.rules,
              }),
              strategyId: 'graph',
              graph: compiled.graph,
            });
            lastGraphStrategyIdRef.current = fresh.strategyId;
          } else {
            setBacktestParams({
              ...DEFAULT_BACKTEST_PARAMS,
              sma: { ...DEFAULT_BACKTEST_PARAMS.sma },
              donchian: { ...DEFAULT_BACKTEST_PARAMS.donchian },
              costs: { ...DEFAULT_BACKTEST_PARAMS.costs },
              rules: { ...DEFAULT_BACKTEST_PARAMS.rules },
            });
            lastGraphStrategyIdRef.current = null;
          }
        } else {
          // Named strategy missing from bank — keep defaults but still show menu.
          setBacktestParams({
            ...DEFAULT_BACKTEST_PARAMS,
            sma: { ...DEFAULT_BACKTEST_PARAMS.sma },
            donchian: { ...DEFAULT_BACKTEST_PARAMS.donchian },
            costs: { ...DEFAULT_BACKTEST_PARAMS.costs },
            rules: { ...DEFAULT_BACKTEST_PARAMS.rules },
          });
          lastGraphStrategyIdRef.current = null;
        }
      } else {
        lastGraphStrategyIdRef.current = null;
      }

      try {
        // Rehydrate catalog stubs from server when localStorage was cleared.
        for (const leg of fresh.legs) {
          if (!getDataset(leg.datasetId)) {
            try {
              registerRemoteDataset(await getRemoteDataset(leg.datasetId));
            } catch {
              // Local-only dataset or API down — resolve may still find CSV rows.
            }
          }
        }

        const resolved = resolveBaseDatasetsForSession(fresh);
        if (resolved.length === 0) {
          throw new Error(
            'No dataset found for this session. Publish it from Datasets, then create a new session.',
          );
        }

        const seriesList: PaneSeries[] = [];
        for (let i = 0; i < resolved.length; i++) {
          const { leg, dataset } = resolved[i]!;
          const base = i / resolved.length;
          const slice = 1 / resolved.length;

          let cat;
          if (dataset.source === 'remote') {
            cat = await ensureSessionDataFromServer(
              dataset.id,
              fresh.startDate,
              fresh.endDate,
              {
                openTf: fresh.timeframe,
                onProgress: (p) => {
                  // Session fetch reports 0–100; chart loader expects 0–1.
                  setIngestPct(base + (p.percent / 100) * slice);
                },
              },
            );
          } else {
            cat = await ensureDatasetIngested(dataset.id, dataset.timeframe, (p) => {
              // CSV ingest reports 0–1.
              setIngestPct(base + p.percent * slice);
            });
          }
          seriesList.push({ pair: leg.pair, datasetId: cat.datasetId, catalog: cat });
          if (loadGen !== loadSessionGenRef.current) return;
        }
        if (loadGen !== loadSessionGenRef.current) return;
        seriesRef.current = seriesList;
        const primary = seriesList[0]!;
        setCatalog(primary.catalog);

        const sharedTfs = intersectTimeframes(seriesList);
        // Resume last TopBar TF when persisted; else create TF.
        const openTf = resolveOpenTimeframe(
          fresh,
          sharedTfs,
          primary.catalog.baseTf,
        );

        const { timeStart, timeEnd } = replayBounds(fresh, seriesList);
        const baseTf = primary.catalog.baseTf;
        const resumeCursor =
          journalFocus != null && Number.isFinite(journalFocus.time)
            ? Math.min(timeEnd, Math.max(timeStart, journalFocus.time))
            : typeof fresh.cursorTime === 'number' && Number.isFinite(fresh.cursorTime)
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

        if (loadGen !== loadSessionGenRef.current) return;
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
          // Keep every session leg warm so Play can hit SL/TP off-screen.
          retainedDatasets: seriesList.map((s) => s.datasetId),
        });
        if (loadGen !== loadSessionGenRef.current) return;

        let views = sessionRef.current.getViews();
        let v0 = views['pane-0'];
        if (!v0 || v0.bars.length === 0) {
          throw new Error(
            `No bars to display for ${primary.pair}. Re-download or pick a different overlap.`,
          );
        }
        // Guard: warm cache must not paint a coarser TF (e.g. 1D) under a 1m label.
        if (
          v0.bars.length >= 3 &&
          !barsMatchTimeframe(v0.bars, openTf)
        ) {
          await sessionRef.current.setPaneTimeframe('pane-0', openTf);
          if (loadGen !== loadSessionGenRef.current) return;
          views = sessionRef.current.getViews();
          const fixed = views['pane-0'];
          if (fixed && fixed.bars.length > 0) {
            v0 = fixed;
          }
          if (
            v0.bars.length >= 3 &&
            !barsMatchTimeframe(v0.bars, openTf)
          ) {
            console.warn(
              `[session-load] bars still mismatch openTf=${openTf} after refill`,
            );
          }
        }

        // Propagate real series length so edge-prefetch / pan can fire.
        let windowFrom = 0;
        let totalBars = v0.bars.length;
        try {
          const db = await openDb();
          const meta = await getSeriesMeta(db, primary.datasetId, v0.timeframe);
          if (meta && meta.rowCount > 0) {
            totalBars = meta.rowCount;
            const firstT = v0.bars[0]?.time;
            if (firstT != null) {
              windowFrom = await timeToLogicalIndex(
                primary.datasetId,
                v0.timeframe,
                firstT,
              );
            }
          }
        } catch {
          // keep defaults
        }

        const barsOk =
          v0.bars.length < 3 || barsMatchTimeframe(v0.bars, openTf);
        const nextPanes: ChartPaneState[] = [
          {
            id: 'pane-0',
            // Never label openTf when bars are clearly another period (1D under 1m).
            timeframe: barsOk ? openTf : v0.timeframe,
            selectedTf: openTf,
            bars: v0.bars,
            range: v0.range,
            windowFrom,
            totalBars,
            pair: primary.pair,
            datasetId: primary.datasetId,
          },
        ];
        if (loadGen !== loadSessionGenRef.current) return;
        replayBufferRef.current.set('pane-0', v0.bars);

        panesRef.current = nextPanes;
        setPanes(nextPanes);
        setActivePaneId('pane-0');
        setChartLayout('1');
        // Persist resumed TF so the next reload is sticky even if create TF differed.
        updateSessionProgress(fresh.id, { selectedTf: openTf }, { skipCloud: true });

        const books: Record<string, Drawing[]> = {};
        for (const s of seriesList) {
          books[s.datasetId] = loadDrawings(`${fresh.id}:${s.datasetId}`);
        }
        if (!books[primary.datasetId]) {
          books[primary.datasetId] = loadDrawings(
            `${fresh.id}:${primary.datasetId}`,
          );
        }
        drawingHistoryByDsRef.current.clear();
        setDrawingBooks(books);
        const startingBalance =
          typeof fresh.startingBalance === 'number' &&
          Number.isFinite(fresh.startingBalance) &&
          fresh.startingBalance > 0
            ? fresh.startingBalance
            : 10_000;
        const bridge = createOrderSessionBridge({
          sessionId: fresh.id,
          symbol: primary.pair,
          symbols: seriesList.map((s) => s.pair),
          accountCurrency: 'USD',
          balance: startingBalance,
          sourceFileId: primary.datasetId,
        });
        orderBridgeRef.current = bridge;

        // Rebuild open book from persisted command log (if any).
        const storedJournal = loadJournal(fresh.id);
        if (storedJournal) {
          bridge.hydrateJournal(storedJournal);
          const cmds = storedJournal.commands;
          if (cmds.length > 0) {
            let fromT = resumeCursor;
            for (const c of cmds) {
              if (c.cursorTime < fromT) fromT = c.cursorTime;
            }
            const preload = await ensureAllOrderBars(baseTf, fromT, resumeCursor);
            if (loadGen !== loadSessionGenRef.current) return;
            bridge.rebuildTo(
              resumeCursor,
              makeOrderBarProvider(baseTf, resumeCursor, preload),
            );
          }
        }

        const chartOrders = bridge.toChartOrders(fresh.id);
        setOrders(chartOrders);
        setSelectedOrderId(null);
        setLastOrderReject(bridge.getLastReject());
        setOrderEngineTick((n) => n + 1);
        pushOrdersToPanes(chartOrders, null);

        setLoadStatus('ready');

        if (journalFocus?.tradeId) {
          setSelectedOrderId(journalFocus.tradeId);
          if (focusHighlightTimerRef.current) {
            window.clearTimeout(focusHighlightTimerRef.current);
          }
          const tid = journalFocus.tradeId;
          focusHighlightTimerRef.current = window.setTimeout(() => {
            setSelectedOrderId((prev) => (prev === tid ? null : prev));
          }, 5000);
        }

        clearChartFocusHash(fresh.id);

        queueMicrotask(() => {
          if (loadGen !== loadSessionGenRef.current) return;
          const p0 = nextPanes[0]!;
          const tr = timeRangeFromVisible(p0.bars, p0.range);
          if (tr) syncStoreRef.current?.setTimeRange(tr, 'session-load');
          viewportReloadEnabledRef.current = true;
          wasPlayingRef.current = false;
          // Right-anchored load often shows empty left pad — pull history now
          // (same path as TradingView-style drag-left), not only after user pans.
          // skipLod: must not coarsen 1m→1D from extrapolated pad wall-clock.
          if (tr && p0.range.fromIndex < 8) {
            void applyTimeWindowToPanes(tr.fromTime, tr.toTime, p0.id, {
              skipLod: true,
            });
          }
          if (journalFocus != null) {
            // Ensure viewport/follow settle on the journal entry time after chrome mounts.
            applyJournalFocus(journalFocus);
          }
        });
      } catch (err) {
        if (loadGen !== loadSessionGenRef.current) return;
        viewportReloadEnabledRef.current = false;
        wasPlayingRef.current = false;
        seriesRef.current = [];
        setLoadStatus('error');
        setLoadError(err instanceof Error ? err.message : 'Failed to load dataset');
      }
    },
    [
      applyJournalFocus,
      applyTimeWindowToPanes,
      clearChartFocusHash,
      ensureAllOrderBars,
      makeOrderBarProvider,
      pushOrdersToPanes,
    ],
  );

  // Example analytics session (200 enriched closed trades) for Dashboard/Trades.
  useEffect(() => {
    ensureExampleAnalyticsSession();
  }, []);

  // Right-click / long-press chart → context menu (crosshair + settings)
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ x?: number; y?: number }>).detail;
      const x = typeof detail?.x === 'number' ? detail.x : window.innerWidth / 2;
      const y = typeof detail?.y === 'number' ? detail.y : window.innerHeight / 2;
      setChartContextMenu({ x, y });
    };
    window.addEventListener('talaria:open-chart-settings', open);
    return () => window.removeEventListener('talaria:open-chart-settings', open);
  }, []);

  useEffect(() => {
    const onUndo = () => {
      const ds = activeDatasetId;
      if (!ds) return;
      const prev = historyForDataset(ds).undo(
        drawingBooksRef.current[ds] ?? [],
      );
      if (prev) {
        persistDrawings(prev, { skipHistory: true, datasetId: ds });
        setSelectedDrawingIds([]);
        setSettingsOpen(false);
      }
    };
    const onRedo = () => {
      const ds = activeDatasetId;
      if (!ds) return;
      const next = historyForDataset(ds).redo(
        drawingBooksRef.current[ds] ?? [],
      );
      if (next) {
        persistDrawings(next, { skipHistory: true, datasetId: ds });
        setSelectedDrawingIds([]);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('talaria:drawings-undo', onUndo);
    window.addEventListener('talaria:drawings-redo', onRedo);
    return () => {
      window.removeEventListener('talaria:drawings-undo', onUndo);
      window.removeEventListener('talaria:drawings-redo', onRedo);
    };
  }, [persistDrawings, activeDatasetId, historyForDataset]);

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
  // Bars only — never re-apply a shared camera to every pane (sync-off independence).
  // Rebind when the controller instance is replaced (same session id on Resume).
  useEffect(() => {
    return sessionRef.current.subscribe(() => {
      if (!viewportReloadEnabledRef.current) return;
      // TF/symbol switch owns the commit/sync so mid-await notifies cannot revert UI.
      if (suppressSessionCommitRef.current) return;
      // Play ticks own engines via applyReplayReveal — setPanes mid-Play hitchs rAF.
      if (replayRef.current.get().playing) return;
      commitSessionViews();
      syncEnginesFromSession({ applyCamera: false });
    });
  }, [
    commitSessionViews,
    syncEnginesFromSession,
    catalog?.datasetId,
    session?.id,
    sessionCtrlGen,
  ]);

  // Replay: cursor → engines. React only on discrete play/pause/seek/speed edges.
  const lastSpeedRef = useRef(replayRef.current.get().speed);
  useEffect(() => {
    const ctrl = replayRef.current;
    return ctrl.subscribe((rs) => {
      const playEdge = rs.playing !== wasPlayingRef.current;
      const cursorChanged = lastReplayCursorRef.current !== rs.cursorTime;
      const speedChanged = rs.speed !== lastSpeedRef.current;
      // Pause/speed keep the same cursorTime — must not early-return or chrome
      // (Play/Pause icon, speed slider) stays stale while the controller moved on.
      if (!playEdge && !cursorChanged && !speedChanged) return;

      // Always mirror play/pause/speed — even while viewport is gated (teardown/load).
      // Swallowing pause left wasPlayingRef=true so the next session's Play was a no-op.
      lastSpeedRef.current = rs.speed;
      wasPlayingRef.current = rs.playing;
      if (playEdge || speedChanged) setReplayTick((n) => n + 1);

      if (!catalog || !viewportReloadEnabledRef.current) {
        if (cursorChanged) lastReplayCursorRef.current = rs.cursorTime;
        return;
      }

      lastReplayCursorRef.current = rs.cursorTime;

      if (rs.playing && rs.cursorTime <= rs.startTime + 1) {
        cameraDetachedRef.current = false;
        setCameraDetached(false);
      }

      if (rs.playing) {
        // React only on play edge or speed change — not every cursor tick.
        if (cursorChanged || playEdge) {
          applyReplayReveal(rs.cursorTime, { playEdge });
          if (cursorChanged) persistReplayProgress(false);
        }
        return;
      }

      // Session calendar end (Play reached endDate) — soft Hero toast.
      if (
        playEdge &&
        !rs.playing &&
        rs.endTime > rs.startTime &&
        rs.cursorTime >= rs.endTime - 1
      ) {
        const sess = sessionIdRef.current
          ? getSession(sessionIdRef.current)
          : null;
        toast.info('Backtest period finished', {
          description: sess
            ? `${sess.startDate} → ${sess.endDate}`
            : 'Reached the session end date.',
          timeout: 5500,
        });
      }

      applyReplayReveal(rs.cursorTime);
      // Pause / seek / step — always flush progress so exit/reopen resumes here.
      if (playEdge || cursorChanged) persistReplayProgress(true);

      // Soft completeness scan + neighbor TF warm on Play→Pause.
      // Skip while playing so Play rAF never waits on history fills.
      if (playEdge && !rs.playing) {
        const activeId =
          sessionRef.current.get()?.activePaneId ??
          panesRef.current[0]?.id;
        if (activeId) {
          void healViewportIfNeeded([activeId], { applyCamera: false });
          // 1m→5m (etc.) hits warm cache on the next click.
          void sessionRef.current.prefetchNeighborTimeframes(activeId);
          // Empty left pad → load another history chunk (TV pan-left).
          const pane = panesRef.current.find((p) => p.id === activeId);
          if (pane && pane.bars.length > 0 && pane.range.fromIndex < 8) {
            const tr = timeRangeFromVisible(pane.bars, pane.range);
            if (tr) {
              void applyTimeWindowToPanes(tr.fromTime, tr.toTime, activeId, {
                skipLod: true,
              });
            }
          }
        }
      }
    });
  }, [
    applyTimeWindowToPanes,
    catalog,
    applyReplayReveal,
    healViewportIfNeeded,
    persistReplayProgress,
  ]);

  // Pan/zoom → edge-prefetch. With date-range sync OFF, only the origin pane reloads.
  useEffect(() => {
    if (!catalog || !syncStore) return;
    let lastFrom = Number.NaN;
    let lastTo = Number.NaN;
    let lastOrigin: string | null = null;
    const reload = debounce(
      (fromTime: number, toTime: number, origin: string | null) => {
        if (!viewportReloadEnabledRef.current) return;
        if (
          Math.abs(fromTime - lastFrom) < 0.5 &&
          Math.abs(toTime - lastTo) < 0.5 &&
          origin === lastOrigin
        ) {
          return;
        }
        lastFrom = fromTime;
        lastTo = toTime;
        lastOrigin = origin;
        const syncAll =
          layoutSyncRef.current.dateRange || layoutSyncRef.current.time;
        const onlyPane =
          !syncAll && origin != null && origin.startsWith('pane')
            ? origin
            : undefined;
        void applyTimeWindowToPanes(fromTime, toTime, onlyPane);
      },
      LOD_DEBOUNCE_MS,
    );
    lodReloadCancelRef.current = reload.cancel;

    const unsub = syncStore.subscribe((state) => {
      if (!state.timeRange) return;
      if (
        state.origin === 'replay' ||
        state.origin === 'session-load' ||
        state.origin === 'tf-switch' ||
        state.origin === 'symbol-switch'
      ) {
        return;
      }
      // During Play, only edge-prefetch when the user already pan-detached.
      // Do NOT auto-detach here — wheel/zoom publishes pane timeRanges too, and
      // that used to kill tip-follow + weekend gap-jumps until Pause→Play.
      if (
        replayRef.current.get().playing &&
        state.origin != null &&
        state.origin.startsWith('pane')
      ) {
        const detached =
          cameraDetachedRef.current || detachedPanesRef.current.size > 0;
        if (detached) {
          reload(
            state.timeRange.fromTime,
            state.timeRange.toTime,
            state.origin,
          );
        }
        return;
      }
      if (replayRef.current.get().playing && !cameraDetachedRef.current) return;
      reload(
        state.timeRange.fromTime,
        state.timeRange.toTime,
        state.origin,
      );
    });

    return () => {
      reload.cancel();
      lodReloadCancelRef.current = null;
      unsub();
    };
  }, [catalog, syncStore, applyTimeWindowToPanes]);

  /** After placing a drawing: select it; inline-edit text tools. */
  const finishPlacedDrawing = useCallback((drawing: Drawing) => {
    setDraftPoints([]);
    setSelectedDrawingIds([drawing.id]);
    if (getTool(drawing.type).needsText || drawing.type === 'callout') {
      setInlineTextId(drawing.id);
      setSettingsOpen(false);
    } else {
      setSettingsOpen(false);
    }
    if (!stayInDrawingMode) setActiveTool('cursor');
  }, [stayInDrawingMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (e.key === 'Escape') {
        setDraftPoints([]);
        freehandActiveRef.current = false;
        setSelectedDrawingIds([]);
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
            finishPlacedDrawing(result.drawing);
          }
        }
      }
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('talaria:drawings-undo'));
        return;
      }
      if (mod && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('talaria:drawings-redo'));
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('talaria:drawings-redo'));
        return;
      }
      if (mod && (e.key === 'c' || e.key === 'C') && selectedDrawingIds.length > 0) {
        e.preventDefault();
        copyDrawings(selectedDrawings);
      }
      if (mod && (e.key === 'v' || e.key === 'V') && !drawingsLocked) {
        e.preventDefault();
        const pasted = pasteDrawingsFromClipboard();
        if (pasted.length === 0) return;
        persistDrawings([...drawings, ...pasted]);
        setSelectedDrawingIds(pasted.map((d) => d.id));
      }
      if (mod && (e.key === 'd' || e.key === 'D') && selectedDrawingIds.length > 0 && !drawingsLocked) {
        e.preventDefault();
        const dupes = duplicateDrawings(selectedDrawings);
        persistDrawings([...drawings, ...dupes]);
        setSelectedDrawingIds(dupes.map((d) => d.id));
      }
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedDrawingIds.length > 0 &&
        !drawingsLocked
      ) {
        const locked = new Set(
          drawings.filter((d) => d.locked).map((d) => d.id),
        );
        const remove = new Set(
          selectedDrawingIds.filter((id) => !locked.has(id)),
        );
        if (remove.size === 0) return;
        persistDrawings(drawings.filter((d) => !remove.has(d.id)));
        setSelectedDrawingIds([]);
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
    finishPlacedDrawing,
    persistDrawings,
    selectedDrawingIds,
    selectedDrawings,
  ]);

  const handleLayoutChange = (layout: ChartLayout) => {
    setChartLayout(layout);
    if (!catalog || seriesRef.current.length === 0) return;
    lodReloadCancelRef.current?.();
    prefetchGenRef.current += 1;
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
        const layoutIds = next.map((p) => p.id);
        commitSessionViews({ adoptRangePaneIds: layoutIds });
        syncEnginesFromSession({ paneIds: layoutIds, applyCamera: true });
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
            // Keep series length ≥ buffer so pan/replay edge-prefetch can fire.
            totalBars: Math.max(p.totalBars || 0, v.bars.length),
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

  const markPanesLoading = useCallback((ids: readonly string[], on: boolean) => {
    setLoadingPaneIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  /**
   * TF switch = capture camera, await target TF fill, then push engines.
   * Never blanks the chart when the new interval is not yet in warm cache.
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

      const paneSeries = seriesForPane(existing);
      // Allow switch when catalog omits a TF that can still be served (remote agg).
      if (
        paneSeries &&
        paneSeries.catalog.timeframes.length > 0 &&
        !paneSeries.catalog.timeframes.includes(tf) &&
        !canAggregateFrom(paneSeries.catalog.baseTf, tf)
      ) {
        return;
      }

      // Drop in-flight / pending pan-LOD so it cannot overwrite this TF switch.
      lodReloadCancelRef.current?.();
      prefetchGenRef.current += 1;
      const switchGen = ++paneSwitchGenRef.current;

      const syncAll = layoutSyncRef.current.interval;
      const targets = syncAll
        ? panesRef.current.map((p) => p.id)
        : [paneId];
      const targetSet = new Set(targets);

      // Optimistic UI — TopBar + pane legend update on first click.
      const optimistic = panesRef.current.map((p) =>
        targetSet.has(p.id) ? { ...p, selectedTf: tf, timeframe: tf } : p,
      );
      panesRef.current = optimistic;
      setPanes(optimistic);
      // Sticky TopBar TF for reload (do not wait for async fill).
      const sid = sessionIdRef.current;
      if (sid) {
        const updated = updateSessionProgress(sid, { selectedTf: tf });
        if (updated) {
          setSession((prev) =>
            prev && prev.id === sid ? { ...prev, ...updated } : prev,
          );
        }
      }

      const camera = captureLiveCamera(paneId);
      const fromTf = existing.timeframe;
      const convertedSpan = cameraSpanForTf(camera, fromTf, tf);
      // Explicit TF pick: tip-anchor with converted bar count — do NOT keep the
      // old months-wide from/to. That remapped onto 1m/5m as a crushed pad
      // (hairline candles / wild spikes) and immediately re-armed LOD → 4h
      // while TopBar still said 1m.
      cameraPreserveRef.current = {
        anchorTime: camera.anchorTime,
        span: convertedSpan,
        tipRatio: camera.tipRatio,
      };
      // Fill sizing always uses converted (clamped) span for the target TF.
      sessionRef.current.setCamera(camera.anchorTime, convertedSpan);
      setActivePaneId(paneId);
      // Only suppress the setActivePane notify — never hold this across awaits
      // (a stuck lock freezes session commits and looks like replay is dead).
      suppressSessionCommitRef.current = true;
      sessionRef.current.setActivePane(paneId);
      suppressSessionCommitRef.current = false;
      markPanesLoading(targets, true);

      void (async () => {
        // Hold session→React commits until the first paint of the new TF.
        suppressSessionCommitRef.current = true;
        try {
          // IDB-first flip (session no longer awaits remote before return).
          await Promise.all(
            targets.map((id) => sessionRef.current.setPaneTimeframe(id, tf)),
          );
          if (switchGen !== paneSwitchGenRef.current) return;

          // Immediate paint: bars + camera + auto Y (1m scale must not stick).
          commitSessionViews({ adoptRangePaneIds: targets });
          syncEnginesFromSession({
            paneIds: targets,
            applyCamera: true,
            keepPreserve: true,
          });
          for (const id of targets) {
            getChart(id)?.resetPriceScale();
          }
          // Keep the converted (clamped) span — never restore the pre-TF bar
          // count (e.g. 120 on 1h). That made session heal tip-anchor a short
          // window while the engine still showed a wide 5m camera → first pan jump.
          const live = getChart(paneId)?.getVisibleRange();
          const liveSpan = live
            ? Math.max(10, live.toIndex - live.fromIndex)
            : convertedSpan;
          sessionRef.current.setSpan(
            Math.min(VISIBLE_BARS_TARGET, Math.max(10, liveSpan)),
          );
          syncReplayClockTf(panesRef.current);
          markPanesLoading(targets, false);

          const focus = panesRef.current.find((p) => p.id === paneId);
          if (focus && focus.bars.length > 0) {
            const newTr = timeRangeFromVisible(focus.bars, focus.range);
            if (newTr && layoutSyncRef.current.dateRange) {
              syncStoreRef.current?.setTimeRange(newTr, 'tf-switch');
            }
            replayBufferRef.current.set(paneId, focus.bars);
          }

          // Background history top-up — do not block the first paint.
          // Keep suppress through heal so tip-anchored session views cannot
          // stomp React mid-switch; never adopt tip ranges onto the live camera.
          const healed = await healViewportIfNeeded(targets, {
            force: true,
            applyCamera: false,
          });
          if (switchGen !== paneSwitchGenRef.current) return;
          if (healed) {
            commitSessionViews(); // bars only — keep engine/React camera
            syncEnginesFromSession({
              paneIds: targets,
              applyCamera: true,
              keepPreserve: true,
            });
            for (const id of targets) {
              getChart(id)?.resetPriceScale();
            }
          }
          cameraPreserveRef.current = null;
        } finally {
          suppressSessionCommitRef.current = false;
          if (switchGen === paneSwitchGenRef.current) {
            markPanesLoading(targets, false);
          }
        }
      })();
    },
    [
      catalog,
      captureLiveCamera,
      commitSessionViews,
      healViewportIfNeeded,
      markPanesLoading,
      seriesForPane,
      syncEnginesFromSession,
      syncReplayClockTf,
    ],
  );

  /**
   * Symbol switch — await new dataset fill before swapping engines.
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

      // Load this instrument's drawing book before the pane paints it.
      ensureDrawingBook(series.datasetId);

      // Drop in-flight / pending pan-LOD so it cannot overwrite this symbol switch.
      lodReloadCancelRef.current?.();
      prefetchGenRef.current += 1;
      const switchGen = ++paneSwitchGenRef.current;

      const syncAll = layoutSyncRef.current.symbol;
      const targets = syncAll
        ? panesRef.current.map((p) => p.id)
        : [paneId];

      const camera = captureLiveCamera(paneId);
      cameraPreserveRef.current = camera;
      sessionRef.current.setCamera(camera.anchorTime, camera.span);

      const tfs = layoutSyncRef.current.interval
        ? seriesRef.current.length > 0
          ? intersectTimeframes(seriesRef.current)
          : (catalog.timeframes ?? [existing.selectedTf])
        : (series.catalog.timeframes ?? [existing.selectedTf]);

      setActivePaneId(paneId);
      suppressSessionCommitRef.current = true;
      sessionRef.current.setActivePane(paneId);
      suppressSessionCommitRef.current = false;
      markPanesLoading(targets, true);

      void (async () => {
        suppressSessionCommitRef.current = true;
        try {
          await Promise.all(
            targets.map(async (id) => {
              await sessionRef.current.setPaneSymbol(
                id,
                { datasetId: series.datasetId, pair: series.pair },
                tfs,
              );
              replayBufferRef.current.delete(id);
            }),
          );
          if (switchGen !== paneSwitchGenRef.current) return;
          await healViewportIfNeeded(targets, {
            force: true,
            applyCamera: false,
          });
          if (switchGen !== paneSwitchGenRef.current) return;

          commitSessionViews({ adoptRangePaneIds: targets });
          syncEnginesFromSession({ paneIds: targets, applyCamera: true });
          // Different instrument → drop previous pair's manual Y scale so candles
          // aren't off-screen until the user double-clicks the price axis.
          for (const id of targets) {
            getChart(id)?.resetPriceScale();
          }
          syncReplayClockTf(panesRef.current);

          const bridge = orderBridgeRef.current;
          if (bridge) {
            const all = bridge.toChartOrders(sessionIdRef.current ?? '');
            setOrders(all);
            pushOrdersToPanes(all, selectedOrderIdRef.current);
            // Deselect if the selected level belongs to the previous symbol.
            const focusPair =
              panesRef.current.find((p) => p.id === paneId)?.pair ?? pair;
            const sel = selectedOrderIdRef.current;
            if (
              sel &&
              !ordersForPair(all, focusPair).some((o) => o.id === sel)
            ) {
              setSelectedOrderId(null);
            }
          } else {
            pushOrdersToPanes([], null);
          }

          const focus = panesRef.current.find((p) => p.id === paneId);
          if (focus && focus.bars.length > 0) {
            const newTr = timeRangeFromVisible(focus.bars, focus.range);
            if (newTr && layoutSyncRef.current.dateRange) {
              syncStoreRef.current?.setTimeRange(newTr, 'symbol-switch');
            }
            replayBufferRef.current.set(paneId, focus.bars);
          }
        } finally {
          suppressSessionCommitRef.current = false;
          if (switchGen === paneSwitchGenRef.current) {
            markPanesLoading(targets, false);
          }
        }
      })();
    },
    [
      catalog,
      captureLiveCamera,
      commitSessionViews,
      ensureDrawingBook,
      healViewportIfNeeded,
      markPanesLoading,
      pushOrdersToPanes,
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
          setSelectedDrawingIds([hit.drawingId]);
          setSettingsOpen(false);
        } else {
          setSelectedDrawingIds([]);
          setSettingsOpen(false);
        }
        return;
      }

      if (!isDrawingTool(activeTool)) return;

      // Active tool owns the plot — place on top; do not steal into select/deselect.
      // (Cursor tool still selects via the branch above; fills are stroke-hit only.)

      let snapped = magnetSnap(
        { time: point.time, price: point.price },
        bars,
        magnetMode,
      );
      snapped = applyShiftConstrainIfNeeded(
        activeTool,
        draftPoints,
        snapped,
        bars,
        drawingShiftHeld,
      );

      const toolDef = getTool(activeTool);
      // Brush / highlighter: press-drag via onFreehandStroke (not click-click).
      if (toolDef.points.kind === 'freehand') return;

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
            finishPlacedDrawing(result.drawing);
          }
          return;
        }
      }

      // Click-click: 1st click anchors + rubber-band preview; Nth click commits.
      // (2-point tools also support press-drag via onPlaceDrag.)
      const result = placeDrawingPoint(activeTool, draftPoints, snapped);
      if (result.status === 'pending') {
        setDraftPoints(result.points);
        return;
      }
      if (result.status === 'complete') {
        persistDrawings([...drawings, result.drawing]);
        finishPlacedDrawing(result.drawing);
      }
    },
    [
      activePaneId,
      activeTool,
      catalog,
      draftPoints,
      drawings,
      finishPlacedDrawing,
      drawingsLocked,
      magnetMode,
      drawingShiftHeld,
      persistDrawings,
      session,
      stayInDrawingMode,
    ],
  );

  // Shift → H/V/45° constrain while placing / resizing drawings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      setDrawingShiftHeld(e.type === 'keydown');
    };
    const onBlur = () => setDrawingShiftHeld(false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /** Brush / highlighter: engine owns samples; React commits on end only. */
  const handleFreehandStroke = useCallback(
    (
      phase: 'start' | 'move' | 'end',
      _point: DrawingPoint | null,
      points?: readonly DrawingPoint[],
    ) => {
      if (!session || !catalog) return;
      if (!isDrawingTool(activeTool) || getTool(activeTool).points.kind !== 'freehand') {
        return;
      }

      if (phase === 'start') {
        freehandActiveRef.current = true;
        return;
      }

      if (phase === 'move') {
        // Engine paints the stroke — no React updates.
        return;
      }

      freehandActiveRef.current = false;
      const pts = points ?? [];
      setDraftPoints([]);
      if (pts.length < 2) return;

      const tip = pts[pts.length - 1]!;
      const result = placeDrawingPoint(activeTool, [...pts], tip, {
        finishPolyline: true,
      });
      if (result.status === 'complete') {
        persistDrawings([...drawingsRef.current, result.drawing]);
        finishPlacedDrawing(result.drawing);
      }
    },
    [activeTool, catalog, finishPlacedDrawing, persistDrawings, session],
  );

  /**
   * Fixed-2 press-drag place (trend/rect/fib…):
   * hold+drag → live preview → release commits.
   * Tap (no move) is handled as click-click via onChartPoint instead.
   */
  const handlePlaceDrag = useCallback(
    (phase: 'start' | 'end', points: readonly DrawingPoint[]) => {
      if (!session || !catalog) return;
      if (!isDrawingTool(activeTool)) return;
      const def = getTool(activeTool);
      if (def.points.kind !== 'fixed' || def.points.count !== 2) return;

      if (phase === 'start') {
        // Sync React draft so tool switch / Esc can cancel; engine paints live tip.
        setDraftPoints(points.length ? [points[0]!] : []);
        return;
      }

      setDraftPoints([]);
      if (points.length < 2) return;
      const tip = points[points.length - 1]!;
      const result = placeDrawingPoint(activeTool, [points[0]!], tip);
      if (result.status === 'complete') {
        persistDrawings([...drawingsRef.current, result.drawing]);
        finishPlacedDrawing(result.drawing);
      } else if (result.status === 'pending') {
        setDraftPoints(result.points);
      }
    },
    [activeTool, catalog, finishPlacedDrawing, persistDrawings, session],
  );

  const handleToolChange = (tool: ChartToolId) => {
    setActiveTool(tool);
    setDraftPoints([]);
    freehandActiveRef.current = false;
    if (tool !== 'cursor') {
      setSelectedDrawingIds([]);
      setSettingsOpen(false);
    }
  };

  const handleEngineDrawingsChange = useCallback(
    (datasetId: string, next: readonly Drawing[]) => {
      persistDrawings([...next], { datasetId });
    },
    [persistDrawings],
  );

  const handleEngineDrawingSelect = useCallback((drawingIds: readonly string[]) => {
    setSelectedDrawingIds([...drawingIds]);
    setSettingsOpen(false);
  }, []);

  const clearDrawings = () => {
    persistDrawings([]);
    setDraftPoints([]);
    setSelectedDrawingIds([]);
    setSettingsOpen(false);
    setObjectTreeOpen(false);
  };

  const patchDrawingById = useCallback(
    (id: string, patch: Partial<Drawing>) => {
      const ds = activeDatasetId;
      if (!ds) return;
      const prev = drawingBooksRef.current[ds] ?? [];
      persistDrawings(
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        { datasetId: ds },
      );
    },
    [activeDatasetId, persistDrawings],
  );

  const deleteDrawingById = useCallback(
    (id: string) => {
      const ds = activeDatasetId;
      if (!ds) return;
      const prev = drawingBooksRef.current[ds] ?? [];
      const cur = prev.find((d) => d.id === id);
      if (cur?.locked) return;
      persistDrawings(
        prev.filter((d) => d.id !== id),
        { datasetId: ds },
      );
      setSelectedDrawingIds((curIds) => curIds.filter((x) => x !== id));
      setSettingsOpen(false);
    },
    [activeDatasetId, persistDrawings],
  );

  const patchSelectedDrawing = useCallback(
    (patch: Partial<Drawing>) => {
      if (selectedDrawingIds.length === 0) return;
      const ds = activeDatasetId;
      if (!ds) return;
      const idSet = new Set(selectedDrawingIds);
      const prev = drawingBooksRef.current[ds] ?? [];
      persistDrawings(
        prev.map((d) => (idSet.has(d.id) ? { ...d, ...patch } : d)),
        { datasetId: ds },
      );
    },
    [selectedDrawingIds, activeDatasetId, persistDrawings],
  );

  const reorderSelected = useCallback(
    (dir: 'front' | 'back') => {
      if (selectedDrawingIds.length === 0) return;
      const next =
        dir === 'front'
          ? bringDrawingsToFront(drawings, selectedDrawingIds)
          : sendDrawingsToBack(drawings, selectedDrawingIds);
      persistDrawings(next);
    },
    [drawings, persistDrawings, selectedDrawingIds],
  );

  const replaceSelectedDrawing = useCallback(
    (next: Drawing) => {
      const ds = activeDatasetId;
      if (!ds) return;
      const prev = drawingBooksRef.current[ds] ?? [];
      persistDrawings(
        prev.map((d) => (d.id === next.id ? next : d)),
        { datasetId: ds },
      );
    },
    [activeDatasetId, persistDrawings],
  );

  const deleteSelectedDrawing = () => {
    if (selectedDrawingIds.length === 0) return;
    const locked = new Set(drawings.filter((d) => d.locked).map((d) => d.id));
    const remove = new Set(selectedDrawingIds.filter((id) => !locked.has(id)));
    if (remove.size === 0) return;
    persistDrawings(drawings.filter((d) => !remove.has(d.id)));
    setSelectedDrawingIds([]);
    setSettingsOpen(false);
  };

  const teardownChartSession = () => {
    // Flush before disabling viewport — resume cursor on next open.
    persistReplayProgress(true);
    viewportReloadEnabledRef.current = false;
    wasPlayingRef.current = false;
    sessionIdRef.current = null;
    replayBufferRef.current.clear();
    sessionRef.current.dispose();
    sessionRef.current = createSessionController();
    setSessionCtrlGen((n) => n + 1);
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
    setDrawingBooks({});
    drawingHistoryByDsRef.current.clear();
    setDraftPoints([]);
    setSelectedDrawingIds([]);
    setSettingsOpen(false);
    setEnabledIndicators([]);
    setOrders([]);
    setSelectedOrderId(null);
    setLastOrderReject(null);
    orderBridgeRef.current = null;
    cancelBacktest();
    clearBacktestResult();
    autoStrategyIndicatorKeysRef.current = [];
    syncStoreRef.current = null;
  };

  const handleExitSession = () => {
    teardownChartSession();
    setAppTab('backtest');
    setView('app');
  };

  const openJournalView = (sessionId?: string | null) => {
    const id = sessionId ?? session?.id ?? null;
    // Soft navigate: pause replay but keep session in memory so "Back to chart"
    // does not force a full re-ingest. Explicit Exit / Backtest still teardowns.
    replayRef.current.pause();
    persistReplayProgress(true);
    setJournalSessionId(id);
    setAppTab('trades');
    setView('app');
  };

  const goAppTab = (tab: AppTab, journalId: string | null = null) => {
    if (auth.status !== 'authenticated') {
      rememberAuthNext(
        formatAppRoute({
          view: 'app',
          appTab: tab,
          authMode: null,
          sessionId: tab === 'trades' ? journalId : null,
          journalTradeId: tab === 'journal' ? journalId : null,
        }),
      );
      setAuthMode('signin');
      setView('auth');
      return;
    }
    if (tab === 'admin' && auth.user?.role !== 'admin') {
      setAppTab(DEFAULT_APP_TAB);
      setJournalSessionId(null);
      setLogbookRouteKey(null);
      setView('app');
      return;
    }
    setAppTab(tab);
    setJournalSessionId(tab === 'trades' ? journalId : null);
    setLogbookRouteKey(tab === 'journal' ? journalId : null);
    setView('app');
  };

  const goAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setView('auth');
  };

  const finishAuthRedirect = () => {
    const next = consumeAuthNext('#/app/journal');
    const route = parseAppRoute(next);
    if (route.view === 'chart' && route.sessionId) {
      const s = getSession(route.sessionId);
      if (s) {
        void loadSessionData(
          s,
          route.focusTime != null
            ? {
                time: route.focusTime,
                tradeId: route.focusTradeId ?? null,
              }
            : undefined,
        );
        return;
      }
      setAppTab('backtest');
      setView('app');
      return;
    }
    if (route.view === 'app') {
      setAppTab(route.appTab ?? DEFAULT_APP_TAB);
      setJournalSessionId(
        route.appTab === 'trades' ? route.sessionId : null,
      );
      setLogbookRouteKey(
        route.appTab === 'journal' ? route.journalTradeId ?? null : null,
      );
      setView('app');
      return;
    }
    setAppTab(DEFAULT_APP_TAB);
    setView('app');
  };

  const handlePlaceOrder = useCallback(() => {
    setLastOrderReject(null);
    setTicketOpen(true);
    setSelectedOrderId('__draft__');
    setActiveTab('open');
  }, []);

  const chartOrdersWithDraft = useMemo(() => {
    if (!ticketDraft || !session) return orders;
    const activePair =
      panes.find((p) => p.id === activePaneId)?.pair ??
      session.legs[0]?.pair ??
      '';
    const draftOrder: ChartOrder = {
      id: '__draft__',
      sessionId: session.id,
      pair: activePair,
      side: ticketDraft.side === 'BUY' ? 'buy' : 'sell',
      entry: ticketDraft.entry,
      stopLoss: ticketDraft.stopLoss,
      takeProfit: ticketDraft.takeProfit,
      createdAt: 0,
      draft: true,
      // Not a booked working order — opening the ticket must not look like Pending.
      working: false,
    };
    return [...orders, draftOrder];
  }, [orders, ticketDraft, session, panes, activePaneId]);

  const orderCounts = useMemo(
    () =>
      tradeDockCounts(orderBridgeRef.current?.getState() ?? null, {
        sessionId: session?.id ?? null,
        liveJournal: orderBridgeRef.current?.getJournal() ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives refresh
    [orderEngineTick, session?.id],
  );

  const liveBidAsk = useMemo(() => {
    const pane = panes.find((p) => p.id === activePaneId) ?? panes[0];
    const last = pane?.bars[pane.bars.length - 1];
    const bid = last?.close ?? 0;
    const spread =
      orderBridgeRef.current?.getSpec(pane?.pair).typicalSpread ?? 0;
    return { bid, ask: bid + spread };
  }, [panes, activePaneId, orderEngineTick]);

  /** Per-symbol mark for TradeDock — never reuse the active pane's bid on JPY. */
  const resolveOrderMark = useCallback((symbol: string) => {
    const bridge = orderBridgeRef.current;
    const fromBridge = bridge?.getMark(symbol) ?? null;
    if (fromBridge && fromBridge.bid > 0) return fromBridge;
    const key = chartPairKey(symbol);
    const pane = panesRef.current.find((p) => chartPairKey(p.pair) === key);
    const last = pane?.bars[pane.bars.length - 1];
    if (last && last.close > 0) {
      const spread = bridge?.getSpec(symbol).typicalSpread ?? 0;
      return { bid: last.close, ask: last.close + spread };
    }
    return null;
  }, []);

  const resolveOrderSpec = useCallback((symbol: string) => {
    return orderBridgeRef.current?.getSpec(symbol) ?? null;
  }, []);

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
      // Trade the active pane's pair — enables concurrent multi-pair positions.
      const tradeSymbol = pane.pair;
      const spread = bridge.getSpec(tradeSymbol).typicalSpread;
      const cursorTime = replayRef.current.get().cursorTime || last.time;
      const id = `ord-${cursorTime}-${bridge.getState().seq + 1}`;
      bridge.submit({
        cursorTime,
        bid: last.close,
        ask: last.close + spread,
        order: {
          id,
          symbol: tradeSymbol,
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
      const reject = bridge.getLastReject();
      if (reject) {
        // Keep ticket + draft levels so the user can fix and resubmit.
        const all = bridge.toChartOrders(sessionIdRef.current ?? '');
        setOrders(all);
        setLastOrderReject(reject);
        setOrderEngineTick((n) => n + 1);
        setSelectedOrderId(null);
        pushOrdersToPanes(all, null);
        return;
      }

      const finishBooked = (selectId: string) => {
        const all = bridge.toChartOrders(sessionIdRef.current ?? '');
        const openId =
          all.find(
            (o) =>
              !o.draft &&
              !o.closed &&
              !o.working &&
              chartPairKey(o.pair) === chartPairKey(tradeSymbol),
          )?.id ?? selectId;
        setOrders(all);
        setLastOrderReject(null);
        setOrderEngineTick((n) => n + 1);
        pushOrdersToPanes(all, openId);
        setSelectedOrderId(openId);
        setTicketOpen(false);
        setTicketDraft(null);
        setActiveTab('open');
      };

      // Engine fills MARKET on the *next* base bar open. While paused, Buy used
      // to leave a stuck Pending — step once (and preload if cache missed).
      // During Play the next tick fills naturally; do not yank the clock here.
      if (
        ticket.type === 'MARKET' &&
        !replayRef.current.get().playing &&
        cursorTime < replayRef.current.get().endTime
      ) {
        replayRef.current.step(1);
        if (!bridge.getState().workingIds.includes(id)) {
          finishBooked(id);
          return;
        }
        // Cache may not have the next base bar yet — ensure + advance.
        const sess = sessionRef.current.get();
        if (sess) {
          const to = Math.max(
            replayRef.current.get().cursorTime,
            cursorTime + timeframeSeconds(sess.baseTf),
          );
          void ensureAllOrderBars(sess.baseTf, cursorTime, to).then((preload) => {
            if (orderBridgeRef.current !== bridge) return;
            bridge.advanceTo(
              to,
              makeOrderBarProvider(sess.baseTf, to, preload),
            );
            if (replayRef.current.get().cursorTime < to) {
              replayRef.current.seek(to);
            }
            finishBooked(id);
          });
          return;
        }
      }

      finishBooked(id);
    },
    [
      activePaneId,
      ensureAllOrderBars,
      makeOrderBarProvider,
      pushOrdersToPanes,
    ],
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
      params: backtestParams,
    })
      .then((result) => {
        const note = result.truncated
          ? `Capped at ${MAX_BACKTEST_BARS.toLocaleString()} bars (newest)`
          : `${result.trades.length} trades · ${result.events.length} marks`;
        setBacktestResult(result, note);
        saveJournalResult(session.id, session.name, result);
        // Auto-show strategy indicators (+ RSI when gate on) so conditions are readable
        const keys: string[] = [];
        setEnabledIndicators((prev) => {
          const next = [...prev];
          const upsert = (
            id: 'sma' | 'donchian' | 'rsi',
            period: number,
            colors?: string[],
          ) => {
            const key = `${id}:${period}`;
            keys.push(key);
            const i = next.findIndex(
              (e) => e.id === id && Number(e.params.period) === period,
            );
            if (i >= 0) {
              next[i] = { ...next[i]!, visible: true };
              return;
            }
            next.push({
              id,
              params: { period },
              visible: true,
              colors,
            });
          };
          if (backtestParams.strategyId === 'sma_cross') {
            upsert('sma', backtestParams.sma.fastPeriod, ['#38bdf8']);
            upsert('sma', backtestParams.sma.slowPeriod, ['#f472b6']);
          } else {
            upsert('donchian', backtestParams.donchian.period);
          }
          if (backtestParams.rules.rsiEnabled) {
            upsert('rsi', backtestParams.rules.rsiPeriod, ['#a78bfa']);
          }
          return next;
        });
        autoStrategyIndicatorKeysRef.current = keys;
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setBacktestCancelled();
          return;
        }
        setBacktestError(err instanceof Error ? err.message : 'Strategy run failed');
      });
  }, [session, activePaneId, seriesForPane, backtestParams]);

  const handleCancelBacktest = useCallback(() => {
    cancelBacktest();
    setBacktestCancelled();
  }, []);

  /** Stop: remove strategy marks + auto-added indicators from the chart. */
  const handleStopStrategy = useCallback(() => {
    cancelBacktest();
    clearBacktestResult();
    setExplainEvent(null);
    setWatchTip(false);
    setCompareResult(null);
    setAbPickMode(false);
    primaryResultRef.current = null;
    lastGraphStrategyIdRef.current = null;
    const keys = new Set(autoStrategyIndicatorKeysRef.current);
    autoStrategyIndicatorKeysRef.current = [];
    if (keys.size === 0) return;
    setEnabledIndicators((prev) =>
      prev.filter((e) => !keys.has(`${e.id}:${Number(e.params.period)}`)),
    );
  }, []);

  /** Run a saved puzzle strategy on the open chart (Worker → marks). */
  const handleRunGraphStrategy = useCallback(
    (
      strategyId: string,
      opts?: {
        skipTfPrompt?: boolean;
        /** Keep existing result as lane A; this run becomes B. */
        asCompare?: boolean;
        /** Tip-window only (watch mode) — last ~800 bars. */
        tipOnly?: boolean;
      },
    ) => {
      const strat = getStrategy(strategyId);
      if (!strat) {
        toast.info('Strategy not found', { timeout: 3500 });
        return;
      }
      if (!session || loadStatus !== 'ready') {
        toast.info('Open a chart session to run', {
          description: 'Start a Backtest session, then Run again.',
          timeout: 5000,
        });
        return;
      }

      const compiled = compileGraph(strat.nodes, strat.edges);
      if (!compiled.ok || !compiled.graph) {
        const msg =
          compiled.issues.find((i) => i.level === 'error')?.message ??
          'Puzzle is incomplete';
        toast.info('Cannot run puzzle', { description: msg, timeout: 5500 });
        return;
      }

      const pane =
        panesRef.current.find((p) => p.id === activePaneId) ?? panesRef.current[0];
      if (!pane) return;
      const series = seriesForPane(pane);
      if (!series) {
        toast.info('No series on chart', { timeout: 3500 });
        return;
      }

      const mismatch = firstTfMismatch(
        compiled.requiredTimeframes,
        pane.timeframe,
      );
      if (mismatch && !opts?.skipTfPrompt) {
        toast.info(`This piece needs ${mismatch}`, {
          description: `Chart is on ${pane.timeframe}. Switch timeframe, then continue.`,
          timeout: 9000,
          actionProps: {
            children: 'Switch TF',
            onPress: () => {
              applyPaneTimeframe(pane.id, mismatch);
              window.setTimeout(() => {
                handleRunGraphStrategy(strategyId, { skipTfPrompt: true });
              }, 700);
            },
          },
        });
        return;
      }

      const params: BacktestParams = {
        ...DEFAULT_BACKTEST_PARAMS,
        sma: { ...DEFAULT_BACKTEST_PARAMS.sma },
        donchian: { ...DEFAULT_BACKTEST_PARAMS.donchian },
        costs: { ...DEFAULT_BACKTEST_PARAMS.costs },
        rules: rulesFromStrategyNodes(strat.nodes, {
          ...DEFAULT_BACKTEST_PARAMS.rules,
        }),
        strategyId: 'graph',
        graph: compiled.graph,
      };

      lastGraphStrategyIdRef.current = strategyId;
      const asCompare = opts?.asCompare === true || abPickMode;
      const tipOnly = opts?.tipOnly === true;
      if (!asCompare && !tipOnly) {
        setCompareResult(null);
        setAbPickMode(false);
        primaryResultRef.current = null;
      }
      if (!tipOnly) setView('chart');
      if (!asCompare && !tipOnly) setBacktestRunning();
      const bounds = replayBounds(session, seriesRef.current);
      let timeStart = bounds.timeStart;
      let timeEnd = bounds.timeEnd;
      if (tipOnly) {
        const cursor =
          replayRef.current.get().cursorTime ||
          bounds.timeEnd;
        // ~800 bars on current TF (cheap tip re-eval for watch)
        const period =
          pane.timeframe === '1D'
            ? 86400
            : pane.timeframe === '4h'
              ? 14400
              : pane.timeframe === '1h'
                ? 3600
                : pane.timeframe === '15m'
                  ? 900
                  : pane.timeframe === '5m'
                    ? 300
                    : 60;
        timeEnd = cursor;
        timeStart = Math.max(bounds.timeStart, cursor - period * 800);
      }

      void runBacktest({
        sessionId: session.id,
        datasetId: series.datasetId,
        timeframe: pane.timeframe,
        timeStart,
        timeEnd,
        params,
      })
        .then((result) => {
          const withName: BacktestResult = {
            ...result,
            strategyName: strat.name,
          };
          if (asCompare) {
            const primary =
              primaryResultRef.current ?? getBacktestState().result;
            if (!primary) {
              setBacktestResult(withName, 'A/B needs a primary run first');
              return;
            }
            // Drop prior merge if present
            const base =
              primaryResultRef.current ??
              (primary.strategyName?.includes(' vs ')
                ? primary
                : primary);
            primaryResultRef.current = base;
            setCompareResult(withName);
            const merged = mergeAbResults(base, withName);
            setBacktestResult(
              merged,
              `A/B · A ${base.trades.length} / B ${withName.trades.length} trades`,
            );
            setAbPickMode(false);
            toast.info('A/B overlay ready', {
              description: 'Lane B marks are labeled B·…',
              timeout: 4000,
            });
            return;
          }
          if (tipOnly) {
            const prevPrimary = primaryResultRef.current;
            const prevEntries =
              prevPrimary?.events.filter((e) => e.kind === 'entry').length ?? 0;
            const nextEntries = withName.events.filter(
              (e) => e.kind === 'entry',
            ).length;
            primaryResultRef.current = withName;
            const b = compareResultRef.current;
            if (b) {
              setBacktestResult(mergeAbResults(withName, b), 'Watch tip · A/B');
            } else {
              setBacktestResult(withName, 'Watch tip');
            }
            if (nextEntries > prevEntries) {
              toast.info('Watch: new entry signal', {
                description: strat.name,
                timeout: 4500,
              });
            }
            return;
          }
          const note = withName.truncated
            ? `Capped at ${MAX_BACKTEST_BARS.toLocaleString()} bars (newest)`
            : `${withName.trades.length} trades · ${withName.events.length} marks`;
          primaryResultRef.current = withName;
          setBacktestResult(withName, note);
          saveJournalResult(session.id, session.name, withName);
          setExplainEvent(null);

          const keys: string[] = [];
          setEnabledIndicators((prev) => {
            const next = [...prev];
            const upsert = (
              id: EnabledIndicator['id'],
              period: number,
              colors?: string[],
              extra?: Record<string, number>,
            ) => {
              const key = `${id}:${period}`;
              keys.push(key);
              const i = next.findIndex(
                (e) => e.id === id && Number(e.params.period) === period,
              );
              if (i >= 0) {
                next[i] = { ...next[i]!, visible: true };
                return;
              }
              next.push({
                id,
                params: { period, ...extra },
                visible: true,
                colors,
              });
            };
            for (const p of compiled.graph!.pieces) {
              if (isLogicKind(p.kind)) continue;
              switch (p.kind) {
                case 'sma_cross':
                  upsert('sma', Number(p.params.fastPeriod) || 10, ['#38bdf8']);
                  upsert('sma', Number(p.params.slowPeriod) || 30, ['#f472b6']);
                  break;
                case 'ema_cross':
                  upsert('ema', Number(p.params.fastPeriod) || 9, ['#38bdf8']);
                  upsert('ema', Number(p.params.slowPeriod) || 21, ['#f472b6']);
                  break;
                case 'wma_cross':
                  upsert('wma', Number(p.params.fastPeriod) || 10);
                  upsert('wma', Number(p.params.slowPeriod) || 30);
                  break;
                case 'hma_cross':
                  upsert('hma', Number(p.params.fastPeriod) || 9);
                  upsert('hma', Number(p.params.slowPeriod) || 16);
                  break;
                case 'donchian_break':
                  upsert('donchian', Number(p.params.period) || 20);
                  break;
                case 'rsi_gate':
                case 'rsi_cross':
                  upsert('rsi', Number(p.params.period) || 14, ['#a78bfa']);
                  break;
                case 'macd_cross':
                case 'macd_hist_flip':
                  upsert(
                    'macd',
                    Number(p.params.slowPeriod) || 26,
                    undefined,
                    {
                      fast: Number(p.params.fastPeriod) || 12,
                      slow: Number(p.params.slowPeriod) || 26,
                      signal: Number(p.params.signalPeriod) || 9,
                    },
                  );
                  break;
                case 'bb_touch':
                case 'bb_squeeze':
                case 'bb_walk':
                  upsert('bb', Number(p.params.period) || 20, undefined, {
                    stdDev: Number(p.params.stdDev) || 2,
                  });
                  break;
                case 'keltner_break':
                  upsert('keltner', Number(p.params.period) || 20);
                  break;
                case 'envelopes_touch':
                  upsert('envelopes', Number(p.params.period) || 20);
                  break;
                case 'price_vs_ma':
                case 'ma_stack':
                case 'ma_slope': {
                  const maType = String(p.params.maType || 'ema');
                  const per =
                    Number(p.params.period) ||
                    Number(p.params.fastPeriod) ||
                    50;
                  upsert(maType === 'sma' ? 'sma' : 'ema', per);
                  break;
                }
                case 'stoch_cross':
                case 'stoch_gate':
                  upsert('stoch', Number(p.params.kPeriod) || 14, undefined, {
                    smoothK: Number(p.params.dPeriod) || 3,
                    smoothD: Number(p.params.dPeriod) || 3,
                  });
                  break;
                case 'cci_gate':
                case 'cci_cross':
                  upsert('cci', Number(p.params.period) || 20);
                  break;
                case 'willr_gate':
                  upsert('willr', Number(p.params.period) || 14);
                  break;
                case 'adx_trend':
                  upsert('adx', Number(p.params.period) || 14);
                  break;
                case 'ao_cross':
                  upsert('ao', 34);
                  break;
                case 'supertrend_flip':
                  upsert('supertrend', Number(p.params.period) || 10);
                  break;
                case 'psar_flip':
                  upsert('psar', 2);
                  break;
                case 'ichimoku_tk_cross':
                case 'ichimoku_cloud':
                  upsert('ichimoku', Number(p.params.kijun) || 26);
                  break;
                case 'trix_cross':
                  upsert('trix', Number(p.params.period) || 15);
                  break;
                case 'ppo_cross':
                  upsert('ppo', Number(p.params.slowPeriod) || 26);
                  break;
                case 'aroon_cross':
                  upsert('aroon', Number(p.params.period) || 25);
                  break;
                case 'chop_filter':
                  upsert('chop', Number(p.params.period) || 14);
                  break;
                default:
                  break;
              }
            }
            return next;
          });
          autoStrategyIndicatorKeysRef.current = keys;
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setBacktestCancelled();
            return;
          }
          setBacktestError(
            err instanceof Error ? err.message : 'Puzzle run failed',
          );
        });
    },
    [
      session,
      loadStatus,
      activePaneId,
      seriesForPane,
      applyPaneTimeframe,
      abPickMode,
    ],
  );

  // Keep latest runner for watch subscription (avoids stale closures).
  handleRunGraphStrategyRef.current = handleRunGraphStrategy;

  /**
   * Tip-bar watch: subscribe to replay controller directly so play/seek
   * re-eval even when App does not React-render each cursor tick.
   */
  useEffect(() => {
    const ctrl = replayRef.current;
    return ctrl.subscribe((rs) => {
      if (!watchTipRef.current) return;
      const id = lastGraphStrategyIdRef.current;
      if (!id || !Number.isFinite(rs.cursorTime)) return;
      if (watchLastCursorRef.current === rs.cursorTime) return;
      window.clearTimeout(watchTimerRef.current);
      watchTimerRef.current = window.setTimeout(() => {
        if (!watchTipRef.current) return;
        const cur = ctrl.get().cursorTime;
        if (watchLastCursorRef.current === cur) return;
        watchLastCursorRef.current = cur;
        handleRunGraphStrategyRef.current(id, {
          tipOnly: true,
          skipTfPrompt: true,
        });
      }, 1200);
    });
  }, []);

  useEffect(() => {
    if (!watchTip) {
      window.clearTimeout(watchTimerRef.current);
      watchLastCursorRef.current = null;
      return;
    }
    // Kick once when Watch is turned on (even if cursor is idle).
    const id = lastGraphStrategyIdRef.current;
    if (!id) return;
    watchLastCursorRef.current = null;
    handleRunGraphStrategyRef.current(id, {
      tipOnly: true,
      skipTfPrompt: true,
    });
  }, [watchTip]);

  useEffect(() => {
    return () => {
      cancelBacktest();
      clearBacktestResult();
      replayRef.current.dispose();
    };
  }, []);

  const loadSessionDataRef = useRef(loadSessionData);
  loadSessionDataRef.current = loadSessionData;
  const applyJournalFocusRef = useRef(applyJournalFocus);
  applyJournalFocusRef.current = applyJournalFocus;
  const teardownChartSessionRef = useRef(teardownChartSession);
  teardownChartSessionRef.current = teardownChartSession;
  const sessionNavRef = useRef(session);
  sessionNavRef.current = session;

  // Keep the URL hash in sync so refresh restores chart / app / auth tabs.
  useEffect(() => {
    if (view === 'chart') {
      const routeSessionId = session?.id ?? null;
      if (!routeSessionId) return;
      const next = formatAppRoute({
        view: 'chart',
        appTab: null,
        authMode: null,
        sessionId: routeSessionId,
      });
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
      return;
    }
    if (view === 'app') {
      const next = formatAppRoute({
        view: 'app',
        appTab,
        authMode: null,
        sessionId: appTab === 'trades' ? journalSessionId : null,
        journalTradeId: appTab === 'journal' ? logbookRouteKey : null,
      });
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
      return;
    }
    if (view === 'auth') {
      const next = formatAppRoute({
        view: 'auth',
        appTab: null,
        authMode,
        sessionId: null,
      });
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
      return;
    }
    const next = formatAppRoute({
      view,
      appTab: null,
      authMode: null,
      sessionId: null,
    });
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
  }, [view, appTab, authMode, session?.id, journalSessionId, logbookRouteKey]);

  // Guard: app + chart require a signed-in account; admin tab requires admin role.
  useEffect(() => {
    if (auth.status === 'loading') return;
    if (auth.status === 'authenticated') {
      // After sign-in/up, leave #/auth/* for the saved destination once.
      if (view === 'auth') finishAuthRedirect();
      else if (view === 'landing') {
        setAppTab(DEFAULT_APP_TAB);
        setView('app');
      } else if (
        view === 'app' &&
        appTab === 'admin' &&
        auth.user?.role !== 'admin'
      ) {
        setAppTab(DEFAULT_APP_TAB);
      }
      return;
    }
    // anonymous — never render app/chart chrome
    if (view !== 'app' && view !== 'chart') return;
    rememberAuthNext(
      formatAppRoute({
        view,
        appTab: view === 'app' ? appTab : null,
        authMode: null,
        sessionId:
          view === 'chart'
            ? (session?.id ?? parseAppRoute().sessionId)
            : appTab === 'trades'
              ? journalSessionId
              : null,
        journalTradeId: view === 'app' && appTab === 'journal' ? logbookRouteKey : null,
      }),
    );
    if (view === 'chart') {
      teardownChartSessionRef.current();
    }
    setAuthMode('signin');
    setView('auth');
  }, [auth.status, auth.user?.role, view, appTab, journalSessionId, logbookRouteKey, session?.id]);

  // Cold start: reopen #/chart/:sessionId after refresh (auth must be ready).
  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    const route = parseAppRoute();
    if (route.view !== 'chart' || !route.sessionId) return;
    const s = getSession(route.sessionId);
    if (!s) {
      setAppTab('backtest');
      setView('app');
      return;
    }
    void loadSessionDataRef.current(s);
  }, [auth.status]);

  // Back / forward / manual hash edits.
  useEffect(() => {
    const onHashChange = () => {
      if (suppressHashRef.current) return;
      const route = parseAppRoute();
      if (routeRequiresAuth(route) && auth.status !== 'authenticated') {
        rememberAuthNext(formatAppRoute(route));
        setAuthMode('signin');
        setView('auth');
        return;
      }
      if (
        routeRequiresAdmin(route) &&
        auth.user?.role !== 'admin'
      ) {
        setAppTab(DEFAULT_APP_TAB);
        setView('app');
        return;
      }
      if (route.view === 'chart') {
        if (!route.sessionId) {
          teardownChartSessionRef.current();
          setAppTab('backtest');
          setView('app');
          return;
        }
        if (sessionNavRef.current?.id === route.sessionId) {
          setView('chart');
          if (route.focusTime != null) {
            applyJournalFocusRef.current({
              time: route.focusTime,
              tradeId: route.focusTradeId ?? null,
            });
            clearChartFocusHash(route.sessionId);
          }
          return;
        }
        const s = getSession(route.sessionId);
        if (s) {
          void loadSessionDataRef.current(
            s,
            route.focusTime != null
              ? {
                  time: route.focusTime,
                  tradeId: route.focusTradeId ?? null,
                }
              : undefined,
          );
        } else {
          teardownChartSessionRef.current();
          setAppTab('backtest');
          setView('app');
        }
        return;
      }
      if (route.view === 'app') {
        // Soft navigate: pause replay but keep session in memory (same as journal soft-exit).
        replayRef.current.pause();
        setAppTab(route.appTab ?? DEFAULT_APP_TAB);
        setJournalSessionId(
          route.appTab === 'trades' ? route.sessionId : null,
        );
        setLogbookRouteKey(
          route.appTab === 'journal' ? route.journalTradeId ?? null : null,
        );
        setView('app');
        return;
      }
      if (route.view === 'auth') {
        setAuthMode(route.authMode ?? 'signin');
        setView('auth');
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
  }, [auth.status]);

  if (view === 'landing') {
    return (
      <AuthGate>
        <MarketingHome
          onStartFree={() => {
            if (auth.status === 'authenticated') goAppTab('backtest');
            else goAuth('signup');
          }}
          onOpenApp={() => {
            if (auth.status === 'authenticated') goAppTab('journal');
            else goAuth('signin');
          }}
        />
      </AuthGate>
    );
  }

  if (view === 'auth') {
    return (
      <AuthGate>
        <AuthFormPage
          mode={authMode}
          busy={authBusy}
          error={auth.error}
          onGoHome={() => setView('landing')}
          onSwitchMode={(mode) => {
            auth.clearError();
            goAuth(mode);
          }}
          onSubmit={async (input) => {
            setAuthBusy(true);
            auth.clearError();
            try {
              if (authMode === 'signup') {
                await auth.signUp(
                  input.email,
                  input.password,
                  input.displayName,
                );
              } else {
                await auth.signIn(input.email, input.password);
              }
            } finally {
              setAuthBusy(false);
            }
          }}
        />
      </AuthGate>
    );
  }

  if (view === 'notFound') {
    return (
      <AuthGate>
        <NotFoundPage
          onGoHome={() => setView('landing')}
          onGoBacktest={() => goAppTab('backtest')}
        />
      </AuthGate>
    );
  }

  // Refresh restore / session open: #/chart/:id before chart chrome is ready.
  if (view === 'chart' && (!session || loadStatus === 'loading')) {
    return (
      <AuthGate>
        <ChartLoadingScreen
          progress={ingestPct}
          error={loadStatus === 'error' ? (loadError ?? 'Failed to restore chart session') : null}
          onBack={() => {
            teardownChartSession();
            goAppTab('backtest');
          }}
        />
      </AuthGate>
    );
  }

  // Single Hero AppShell — one page per tab (no V8b host, no duplicate paths).
  if (view === 'app' || !session) {
    const openChartFromJournal = (
      id: string,
      focus?: {
        time: number;
        tradeId?: string | null;
        runId?: string | null;
      },
    ) => {
      if (focus?.runId) {
        const run = getJournalRun(focus.runId);
        if (run) {
          setBacktestResult(run.result, null);
          const p = normalizeBacktestParams(run.result.params);
          setBacktestParams({
            ...p,
            sma: { ...p.sma },
            donchian: { ...p.donchian },
            costs: { ...p.costs },
            rules: { ...p.rules },
          });
        }
      }
      if (focus) pendingJournalFocusRef.current = focus;
      if (focus) {
        const hash = formatAppRoute({
          view: 'chart',
          appTab: null,
          authMode: null,
          sessionId: id,
          focusTime: focus.time,
          focusTradeId: focus.tradeId ?? null,
        });
        if (window.location.hash !== hash) {
          suppressHashRef.current = true;
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${window.location.search}${hash}`,
          );
          queueMicrotask(() => {
            suppressHashRef.current = false;
          });
        }
      }
      if (session && session.id === id && panesRef.current.length > 0) {
        setJournalSessionId(null);
        setView('chart');
        if (focus) {
          applyJournalFocus(focus);
          clearChartFocusHash(id);
        }
        pendingJournalFocusRef.current = null;
        return;
      }
      const s = getSession(id);
      if (s) void loadSessionData(s, focus);
    };

    let shellBody: ReactNode;
    switch (appTab) {
      case 'dashboard':
        shellBody = (
          <DashboardPage
            liveJournal={orderBridgeRef.current?.getJournal() ?? null}
            onGoBacktest={() => goAppTab('backtest')}
            onGoTrades={() => goAppTab('trades')}
            onGoJournal={() => goAppTab('journal')}
            onGoStrategy={() => goAppTab('strategy')}
          />
        );
        break;
      case 'journal':
        shellBody = (
          <LogbookPage
            routeKey={logbookRouteKey}
            onRouteKeyChange={setLogbookRouteKey}
            onOpenChart={openChartFromJournal}
            onGoSessions={() => goAppTab('backtest')}
          />
        );
        break;
      case 'trades':
        shellBody = (
          <JournalPage
            embedded
            initialSessionId={journalSessionId}
            liveJournal={orderBridgeRef.current?.getJournal() ?? null}
            canReturnToChart={
              !!session && session.id === (journalSessionId ?? session.id)
            }
            onGoHome={() => {
              setJournalSessionId(null);
              if (session) teardownChartSession();
              setView('landing');
            }}
            onGoBacktest={() => goAppTab('backtest')}
            onOpenChart={openChartFromJournal}
          />
        );
        break;
      case 'backtest':
        shellBody = (
          <CreateSessionPage
            onStart={(s) => void loadSessionData(s)}
            onGoJournal={(sessionId) => goAppTab('trades', sessionId ?? null)}
            onGoLogbook={() => goAppTab('journal')}
            onGoDashboard={() => goAppTab('dashboard')}
            openCreateNonce={createSessionNonce}
          />
        );
        break;
      case 'admin':
        shellBody = (
          <AdminPage onGoBacktest={() => goAppTab('backtest')} />
        );
        break;
      case 'strategy':
        shellBody = (
          <StrategyPage
            onGoBacktest={() => goAppTab('backtest')}
            onRunStrategy={(id) => handleRunGraphStrategy(id)}
            chartReady={!!session && loadStatus === 'ready'}
            chartTimeframe={
              panes.find((p) => p.id === activePaneId)?.timeframe ??
              panes[0]?.timeframe ??
              null
            }
          />
        );
        break;
      case 'resources':
        shellBody = <ResourcesPage />;
        break;
      case 'profile':
        shellBody = (
          <ProfilePage
            onSignedOut={() => {
              if (session) teardownChartSession();
              setView('landing');
            }}
          />
        );
        break;
      default:
        shellBody = null;
    }

    return (
      <AuthGate>
        <AppShell
          tab={appTab}
          showAdmin={auth.user?.role === 'admin'}
          onTabChange={(tab) =>
            goAppTab(tab, tab === 'trades' ? journalSessionId : null)
          }
          onCreateSession={() => {
            goAppTab('backtest');
            setCreateSessionNonce((n) => n + 1);
          }}
          onGoHome={() => {
            if (session) teardownChartSession();
            setView('landing');
          }}
        >
          {shellBody}
        </AppShell>
      </AuthGate>
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
      ? (bt.error ?? 'Error')
      : btResult
        ? `${btResult.trades.length} trades${bt.note ? ' · capped' : ''}`
        : undefined;
  const equityLabel = btResult ? btResult.finalEquity.toFixed(4) : undefined;
  const pnlPct = btResult ? (btResult.finalEquity - 1) * 100 : null;
  const pnlLabel =
    pnlPct == null ? undefined : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
  const pnlPositive = pnlPct == null ? null : pnlPct >= 0;

  return (
    <AuthGate>
    <div
      data-v9-app="1"
      data-chrome-theme={chromeThemeAttr}
      data-chrome-preset={String(chromePresetId)}
      className="h-full min-h-0 bg-surface text-foreground flex flex-col overflow-hidden supports-[height:100dvh]:h-dvh"
      style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-ui)' }}
    >
      <TopBar
        symbol={topSymbol || session.pair}
        symbolOptions={symbolOptions}
        onSymbolChange={(pair) => applyPaneSymbol(activePaneId, pair)}
        timeframe={topTf}
        onTimeframeChange={(tf) => applyPaneTimeframe(activePaneId, tf)}
        availableTimeframes={availableTimeframes}
        seriesType={seriesType}
        onSeriesTypeChange={handleSeriesTypeChange}
        chartLayout={chartLayout}
        onChartLayoutChange={handleLayoutChange}
        layoutSync={layoutSync}
        onLayoutSyncChange={setLayoutSync}
        showVolume={showVolume}
        onShowVolumeChange={handleShowVolumeChange}
        enabledIndicators={enabledIndicators}
        onEnabledIndicatorsChange={setEnabledIndicators}
        onPlaceOrder={handlePlaceOrder}
        onExitSession={handleExitSession}
        backtestRunning={btRunning}
        backtestLabel={btLabel}
        backtestParams={session.strategyId ? backtestParams : undefined}
        onBacktestParamsChange={
          session.strategyId ? setBacktestParams : undefined
        }
        onRunBacktest={
          session.strategyId && loadStatus === 'ready'
            ? () => {
                if (
                  session.strategyId &&
                  backtestParams.strategyId === 'graph'
                ) {
                  handleRunGraphStrategy(session.strategyId);
                } else {
                  handleRunBacktest();
                }
              }
            : undefined
        }
        onCancelBacktest={handleCancelBacktest}
        backtestHasResult={!!btResult}
        onStopBacktest={handleStopStrategy}
      />

      {/* Rail full-height beside chart + bottom chrome (not under the replay bar). */}
      <div className="flex-1 min-h-0 flex">
        <LeftToolbar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          onOpenObjectTree={() => setObjectTreeOpen(true)}
          onClearDrawings={clearDrawings}
          drawingCount={drawings.length}
          magnetMode={magnetMode}
          onMagnetModeChange={setMagnetMode}
          stayInDrawingMode={stayInDrawingMode}
          onStayInDrawingModeChange={setStayInDrawingMode}
          drawingsLocked={drawingsLocked}
          onDrawingsLockedChange={setDrawingsLocked}
          drawingsHidden={drawingsHidden}
          onDrawingsHiddenChange={setDrawingsHidden}
        />

        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative bg-background">
        <div className="flex-1 min-w-0 min-h-0 flex flex-row relative min-h-0">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
          {loadStatus === 'loading' && (
            <div className="absolute inset-0 z-30 bg-background">
              <ChartLoadingScreen progress={ingestPct} />
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
                Back to Backtest
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
                Back to Backtest
              </Button>
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
              syncCrosshair={layoutSync.crosshair}
              syncDateRange={layoutSync.dateRange || layoutSync.time}
              loadingPaneIds={loadingPaneIds}
              drawingBooks={drawingBooks}
              activeDatasetId={activeDatasetId}
              placement={placement}
              selectedDrawingId={selectedDrawingId}
              selectedDrawingIds={selectedDrawingIds}
              drawingsHidden={drawingsHidden}
              drawingMagnetMode={magnetMode}
              drawingShiftHeld={drawingShiftHeld}
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
              freehandStrokeEnabled={
                isDrawingTool(activeTool) &&
                getTool(activeTool).points.kind === 'freehand'
              }
              placeDragEnabled={placeDragEnabled}
              marqueeZoomEnabled={activeTool === 'zoom'}
              drawingsLocked={drawingsLocked}
              onChartPoint={handleChartPoint}
              onBacktestEventSelect={setExplainEvent}
              onFreehandStroke={handleFreehandStroke}
              onPlaceDrag={handlePlaceDrag}
              onDrawingsChange={handleEngineDrawingsChange}
              onDrawingSelect={handleEngineDrawingSelect}
              onUserGesture={(paneId) => {
                detachedPanesRef.current.add(paneId);
                getChart(paneId)?.setReplayFollow(false);
                cameraDetachedRef.current = true;
                setCameraDetached(true);
                // Remember this pane's bar zoom so re-attach / siblings stay correct.
                const chart = getChart(paneId);
                if (!chart) return;
                const liveBars = chart.getBars();
                const liveRange = chart.getVisibleRange();
                const span = liveRange.toIndex - liveRange.fromIndex;
                if (span >= 10) paneSpanByIdRef.current[paneId] = span;
                // Only prefetch when the left pad is truly empty (index < 0).
                // Firing at fromIndex < 24 mid-drag reloaded buffers after TF
                // switch and made the chart jump under the pointer.
                if (liveBars.length > 0 && liveRange.fromIndex < 0) {
                  const tr = timeRangeFromVisible(liveBars, liveRange);
                  if (tr) {
                    void applyTimeWindowToPanes(
                      tr.fromTime,
                      tr.toTime,
                      paneId,
                      { skipLod: true },
                    );
                  }
                }
              }}
            />
            {btResult && (
              <StrategyRunHud
                result={primaryResultRef.current ?? btResult}
                compareResult={compareResult}
                explainEvent={explainEvent}
                onClearExplain={() => setExplainEvent(null)}
                watchEnabled={watchTip}
                onWatchChange={setWatchTip}
                onRunAsB={() => {
                  setAbPickMode(true);
                  toast.info('Pick lane B', {
                    description:
                      'Open Strategies and Run another puzzle — it overlays as B.',
                    timeout: 6000,
                  });
                }}
                onClearCompare={() => {
                  setCompareResult(null);
                  setAbPickMode(false);
                  const primary = primaryResultRef.current;
                  if (primary) {
                    setBacktestResult(primary, null);
                  }
                }}
                onStop={handleStopStrategy}
              />
            )}
            {import.meta.env.DEV && (
              <PerfOverlay barsInMemory={barsInMemory} paneCount={panes.length} />
            )}
            </>
          )}

          {selectedDrawing &&
            selectedDrawing.visible !== false &&
            !settingsOpen &&
            inlineTextId == null && (
            <div className="pointer-events-none absolute top-2 left-2 right-2 z-40 sm:left-1/2 sm:right-auto sm:top-3 sm:-translate-x-1/2 flex justify-center sm:block">
              <DrawingFloatingToolbar
                drawing={selectedDrawing}
                disabled={drawingsLocked}
                onChange={patchSelectedDrawing}
                onOpenSettings={() => setSettingsOpen(true)}
                onDelete={deleteSelectedDrawing}
                onCopy={() => copyDrawings(selectedDrawings)}
                onClone={() => {
                  const dupes = duplicateDrawings(selectedDrawings);
                  persistDrawings([...drawings, ...dupes]);
                  setSelectedDrawingIds(dupes.map((d) => d.id));
                }}
                onHide={() => {
                  for (const id of selectedDrawingIds) {
                    patchDrawingById(id, { visible: false });
                  }
                  setSelectedDrawingIds([]);
                }}
                onBringToFront={() => reorderSelected('front')}
                onSendToBack={() => reorderSelected('back')}
                onEditText={() => {
                  if (selectedDrawingId) setInlineTextId(selectedDrawingId);
                }}
              />
            </div>
          )}

          {inlineTextId &&
            (() => {
              const d = drawings.find((x) => x.id === inlineTextId);
              if (!d) return null;
              return (
                <InlineTextEditor
                  drawing={d}
                  anchor={{
                    clientX:
                      typeof window !== 'undefined' ? window.innerWidth / 2 - 80 : 80,
                    clientY: typeof window !== 'undefined' ? 96 : 96,
                  }}
                  onCommit={(text) => {
                    patchDrawingById(d.id, { text: text.trim() || d.text || 'Text' });
                    setInlineTextId(null);
                  }}
                  onCancel={() => setInlineTextId(null)}
                />
              );
            })()}

          {settingsOpen && selectedDrawing && (
            <DrawingSettingsModal
              drawing={selectedDrawing}
              onLiveChange={replaceSelectedDrawing}
              onCancel={(snapshot) => {
                replaceSelectedDrawing(snapshot);
                setSettingsOpen(false);
              }}
              onOk={(next) => {
                replaceSelectedDrawing(next);
                setSettingsOpen(false);
              }}
            />
          )}

          <ObjectTreePanel
            open={objectTreeOpen}
            onClose={() => setObjectTreeOpen(false)}
            drawings={drawings}
            selectedIds={selectedDrawingIds}
            onSelect={(id, additive) => {
              setSelectedDrawingIds((prev) => {
                if (additive) {
                  const set = new Set(prev);
                  if (set.has(id)) set.delete(id);
                  else set.add(id);
                  return [...set];
                }
                return [id];
              });
              setSettingsOpen(false);
              // Selecting a hidden drawing keeps it hidden — unhide via eye.
              setActiveTool('cursor');
            }}
            onToggleVisible={(id) => {
              const d = drawings.find((x) => x.id === id);
              if (!d) return;
              patchDrawingById(id, { visible: d.visible === false });
            }}
            onToggleLock={(id) => {
              const d = drawings.find((x) => x.id === id);
              if (!d) return;
              patchDrawingById(id, { locked: !d.locked });
            }}
            onDelete={deleteDrawingById}
            onDeleteAll={clearDrawings}
            onBulkHide={(ids) => {
              const ds = activeDatasetId;
              if (!ds) return;
              const idSet = new Set(ids);
              const prev = drawingBooksRef.current[ds] ?? [];
              persistDrawings(
                prev.map((d) =>
                  idSet.has(d.id) ? { ...d, visible: false } : d,
                ),
                { datasetId: ds },
              );
            }}
            onBulkLock={(ids, locked) => {
              const ds = activeDatasetId;
              if (!ds) return;
              const idSet = new Set(ids);
              const prev = drawingBooksRef.current[ds] ?? [];
              persistDrawings(
                prev.map((d) => (idSet.has(d.id) ? { ...d, locked } : d)),
                { datasetId: ds },
              );
            }}
            onBulkDelete={(ids) => {
              const locked = new Set(
                drawings.filter((d) => d.locked).map((d) => d.id),
              );
              const remove = new Set(ids.filter((id) => !locked.has(id)));
              persistDrawings(drawings.filter((d) => !remove.has(d.id)));
              setSelectedDrawingIds((cur) => cur.filter((id) => !remove.has(id)));
            }}
          />

          {chartContextMenu && (
            <ChartContextMenu
              state={chartContextMenu}
              crosshairMode={crosshairMode}
              onCrosshairModeChange={handleCrosshairModeChange}
              onOpenChartSettings={() => setChartSettingsOpen(true)}
              onClose={() => setChartContextMenu(null)}
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
                setSelectedOrderId((id) => (id === '__draft__' ? null : id));
              }}
              symbol={
                (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair ??
                session.legs[0]?.pair ??
                'EURUSD'
              }
              bid={liveBidAsk.bid}
              ask={liveBidAsk.ask}
              digits={
                orderBridgeRef.current?.getSpec(
                  (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair,
                ).digits ?? 5
              }
              pipSize={
                orderBridgeRef.current?.getSpec(
                  (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair,
                ).pipSize ?? 0.01
              }
              tickSize={
                orderBridgeRef.current?.getSpec(
                  (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair,
                ).tickSize ?? 0.00001
              }
              contractSize={
                orderBridgeRef.current?.getSpec(
                  (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair,
                ).contractSize ?? 100_000
              }
              baseCurrency={
                orderBridgeRef.current?.getSpec(
                  (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair,
                ).baseCurrency ?? 'USD'
              }
              leverage={
                orderBridgeRef.current?.getState().account.leverage ??
                orderBridgeRef.current?.getSpec(
                  (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair,
                ).leverage ??
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

      <BottomBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'analytics') setTradeChromeExpanded(true);
        }}
        expanded={tradeChromeExpanded}
        onExpandedChange={(next) => {
          setTradeChromeExpanded(next);
          try {
            localStorage.setItem('talaria.tradeChrome.expanded', next ? '1' : '0');
          } catch {
            /* ignore quota */
          }
        }}
        replay={replayState}
        onPlay={() => {
          void armReplayPlay();
        }}
        onPause={() => {
          replayRef.current.pause();
          // Re-sync React + panes from the live book (play throttles chrome).
          const bridge = orderBridgeRef.current;
          if (bridge) {
            const all = bridge.toChartOrders(sessionIdRef.current ?? '');
            setOrders(all);
            pushOrdersToPanes(all, selectedOrderIdRef.current);
          }
        }}
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
          // Scrub keeps camera detached; Play re-attaches.
          // Await bar coverage before seek so advanceTo/rebuild see a full window.
          const prev = replayRef.current.get().cursorTime;
          const bridge = orderBridgeRef.current;
          const sess = sessionRef.current.get();
          void (async () => {
            if (bridge && sess) {
              if (t < prev) {
                const journal = bridge.getJournal();
                let fromT = t;
                for (const c of journal.commands) {
                  if (c.cursorTime < fromT) fromT = c.cursorTime;
                }
                const preload = await ensureAllOrderBars(sess.baseTf, fromT, t);
                if (orderBridgeRef.current !== bridge) return;
                bridge.onSeekBackward(
                  t,
                  makeOrderBarProvider(sess.baseTf, t, preload),
                );
                syncOrdersFromBridge();
                pushOrdersToPanes(
                  bridge.toChartOrders(sessionIdRef.current ?? ''),
                  selectedOrderIdRef.current,
                );
              } else if (t > prev) {
                const fromT = bridge.getState().lastBarTime ?? prev;
                await ensureAllOrderBars(sess.baseTf, fromT, t);
                if (orderBridgeRef.current !== bridge) return;
              }
            }
            replayRef.current.seek(t);
          })();
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
        stepLabel={activePane?.timeframe ?? '1m'}
        onExportTrades={() => {
          const bridge = orderBridgeRef.current;
          if (!bridge) return;
          const st = bridge.getState();
          const rows: string[] = [
            'id,symbol,side,status,size,type,entry,filledAt',
          ];
          for (const o of Object.values(st.orders)) {
            if (!o || o.role) continue;
            if (activeTab === 'pending' && o.status !== 'WORKING') continue;
            if (activeTab === 'open') continue;
            if (
              activeTab === 'history' &&
              !(o.status === 'FILLED' && !o.role)
            ) {
              continue;
            }
            if (activeTab === 'analytics') continue;
            rows.push(
              [
                o.id,
                o.symbol,
                o.side,
                o.status,
                o.size,
                o.type,
                o.fillPrice ?? o.price ?? '',
                o.filledAt ?? o.createdAt ?? '',
              ].join(','),
            );
          }
          for (const p of Object.values(st.positions)) {
            if (activeTab === 'pending' || activeTab === 'history') continue;
            if (activeTab === 'analytics') continue;
            rows.push(
              [
                p.id,
                p.symbol,
                p.side,
                'OPEN',
                p.size,
                'POSITION',
                p.entryPrice,
                p.openedAt ?? '',
              ].join(','),
            );
          }
          const blob = new Blob([rows.join('\n')], {
            type: 'text/csv;charset=utf-8',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `talaria-trades-${activeTab}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        {loadStatus === 'ready' && activeTab === 'analytics' ? (
          <div className="flex-1 min-h-0 h-full overflow-auto">
            <AnalyticsDashboard
              liveJournal={orderBridgeRef.current?.getJournal() ?? null}
              sessionId={session.id}
              onOpenJournal={() => openJournalView(session.id)}
            />
          </div>
        ) : null}
        {loadStatus === 'ready' && activeTab !== 'analytics' ? (
          <TradeDock
            key={orderEngineTick}
            activeTab={activeTab}
            state={orderBridgeRef.current?.getState() ?? null}
            spec={
              orderBridgeRef.current?.getSpec(
                (panes.find((p) => p.id === activePaneId) ?? panes[0])?.pair,
              ) ?? null
            }
            bid={liveBidAsk.bid}
            ask={liveBidAsk.ask}
            resolveMark={resolveOrderMark}
            resolveSpec={resolveOrderSpec}
            cursorTime={replayState.cursorTime}
            sessionId={session.id}
            liveJournal={orderBridgeRef.current?.getJournal() ?? null}
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
              const key = chartPairKey(pos.symbol);
              const pane = panesRef.current.find(
                (p) => chartPairKey(p.pair) === key,
              );
              const series = seriesRef.current.find(
                (s) => chartPairKey(s.pair) === key,
              );
              const sess = sessionRef.current.get();
              const ds = pane?.datasetId ?? series?.datasetId;
              const cursorTime = replayRef.current.get().cursorTime;
              let bid = pane?.bars[pane.bars.length - 1]?.close ?? 0;
              if (!(bid > 0) && ds && sess) {
                const raw = warmCache.peek(ds, sess.baseTf) ?? [];
                for (let i = raw.length - 1; i >= 0; i--) {
                  const b = raw[i]!;
                  if (b.time <= cursorTime) {
                    bid = b.close;
                    break;
                  }
                }
              }
              if (!(bid > 0) || !(cursorTime > 0)) return;
              const spread = bridge.getSpec(pos.symbol).typicalSpread;
              const id = `close-${cursorTime}-${bridge.getState().seq + 1}`;
              bridge.submit({
                cursorTime,
                bid,
                ask: bid + spread,
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
              // Same next-bar fill as Place Order — step while paused so Close
              // does not leave a stuck opposing MARKET in Pending.
              if (
                !replayRef.current.get().playing &&
                cursorTime < replayRef.current.get().endTime
              ) {
                replayRef.current.step(1);
              }
              syncOrdersFromBridge();
              pushOrdersToPanes(
                bridge.toChartOrders(sessionIdRef.current ?? ''),
                selectedOrderIdRef.current,
              );
            }}
          />
        ) : null}
      </BottomBar>
        </div>
      </div>
    </div>
    </AuthGate>
  );
}
