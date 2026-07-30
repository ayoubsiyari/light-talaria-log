import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button } from '@heroui/react';
import {
  createChartSyncStore,
  type ChartSyncStore,
  type CrosshairMode,
  type CrosshairPoint,
  type DrawingPlacement,
  type SeriesType,
} from '@/chart';
import { DatasetsPage } from '@/components/dataset/DatasetsPage';
import { DrawingFloatingToolbar } from '@/components/drawings/DrawingFloatingToolbar';
import { DrawingSettingsModal } from '@/components/drawings/DrawingSettingsModal';
import { JournalPage } from '@/components/journal/JournalPage';
import { BottomBar } from '@/components/layout/BottomBar';
import { ChartGrid } from '@/components/layout/ChartGrid';
import { LeftToolbar } from '@/components/layout/LeftToolbar';
import { TopBar } from '@/components/layout/TopBar';
import { MarketingHome } from '@/components/landing/MarketingHome';
import { CreateSessionPage } from '@/components/session/CreateSessionPage';
import { saveJournalResult } from '@/journal/journalStore';
import { getSession } from '@/sessions/sessionStore';
import { LoadingProgress } from '@/components/LoadingProgress';
import { PerfOverlay } from '@/components/perf/PerfOverlay';
import { getChart } from '@/chart';
import { rangeCenteredOnIndex } from '@/chart/rangeAnchor';
import {
  canAggregateFrom,
  logicalIndexAtTime,
  revealRangeAtCursor,
  smallestTimeframe,
  timeframeSeconds,
} from '@/data/timeframeAgg';
import { withFormingOpenBar } from '@/replay/formingBars';
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
  createMockOrder,
  listOrdersForSession,
  saveOrdersForSession,
} from '@/orders/orderStore';
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
import { LOD_DEBOUNCE_MS, REPLAY_VISIBLE_BARS } from '@/utils/constants';

type AppView = 'landing' | 'sessions' | 'datasets' | 'journal' | 'chart';
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

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

  const [view, setView] = useState<AppView>('landing');
  const [journalSessionId, setJournalSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<BacktestSession | null>(null);
  const [catalog, setCatalog] = useState<SeriesCatalog | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ingestPct, setIngestPct] = useState(0);

  const [panes, setPanes] = useState<ChartPaneState[]>([]);
  const [activePaneId, setActivePaneId] = useState('pane-0');

  const [activeTool, setActiveTool] = useState<ChartToolId>('cursor');
  const [activeTab, setActiveTab] = useState<BottomTabId>('all');
  const [seriesType, setSeriesType] = useState<SeriesType>('candle');
  const [crosshairMode, setCrosshairMode] = useState<CrosshairMode>('normal');
  const [showVolume, setShowVolume] = useState(false);
  const [volumeOpacity, setVolumeOpacity] = useState(0.4);
  const [enabledIndicators, setEnabledIndicators] = useState<EnabledIndicator[]>([]);
  const [orders, setOrders] = useState<ChartOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [backtestTick, setBacktestTick] = useState(0);
  const [chartLayout, setChartLayout] = useState<ChartLayout>('1');
  const [layoutSync, setLayoutSync] = useState<LayoutSyncOptions>(DEFAULT_LAYOUT_SYNC);
  const layoutSyncRef = useRef(layoutSync);
  layoutSyncRef.current = layoutSync;

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draftPoints, setDraftPoints] = useState<DrawingPoint[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const panesRef = useRef<ChartPaneState[]>([]);
  panesRef.current = panes;
  /** Per-pair ingested catalogs for the open session. */
  const seriesRef = useRef<PaneSeries[]>([]);
  /** Blocks replay/sync viewport reloads during session ingest + first paint. */
  const viewportReloadEnabledRef = useRef(false);
  const lastReplayCursorRef = useRef<number | null>(null);
  /** Full IDB windows for replay (may include future bars). Chart only gets a slice. */
  const replayBufferRef = useRef<Map<string, ChartBar[]>>(new Map());
  /** Clock-TF (smallest pane TF) buffers keyed by datasetId — used to form open higher-TF candles. */
  const clockBufferRef = useRef<Map<string, ChartBar[]>>(new Map());
  const clockTfRef = useRef<Timeframe>('1m');
  const revealGenRef = useRef(0);
  /** Invalidates in-flight pan/zoom IDB window refills (edge prefetch). */
  const prefetchGenRef = useRef(0);
  /** User pan/zoom during play detaches camera follow (stops fighting the drag). */
  const [cameraDetached, setCameraDetached] = useState(false);
  const cameraDetachedRef = useRef(false);
  cameraDetachedRef.current = cameraDetached;

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

  /** Replay clock = finest pane TF so all panels advance tick-by-tick together. */
  const syncReplayClockTf = useCallback((paneList?: readonly ChartPaneState[]) => {
    const list = paneList ?? panesRef.current;
    if (list.length === 0) return;
    const clock = smallestTimeframe(list.map((p) => p.timeframe));
    if (clockTfRef.current !== clock) {
      clockTfRef.current = clock;
      clockBufferRef.current.clear();
    }
    replayRef.current.setActiveTf(clock);
  }, []);

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
      if (tfChanged) syncReplayClockTf(updated);
    },
    [catalog, paneFromViewport, seriesForPane, syncReplayClockTf],
  );

  /**
   * Replay: keep full buffer in the engine (pan room + future mask via cursor).
   * Coarser panes get a forming open candle rebuilt from the clock TF each tick.
   * Never rewrite pane.range — camera follow lives in the chart engine.
   */
  const applyReplayReveal = useCallback(
    async (cursorTime: number) => {
      if (!catalog || !viewportReloadEnabledRef.current) return;
      const current = panesRef.current;
      if (current.length === 0) return;
      const gen = ++revealGenRef.current;
      const clockTf = clockTfRef.current;

      // Ensure clock-TF buffers for every dataset (forming source)
      const datasetIds = [...new Set(current.map((p) => p.datasetId))];
      for (const datasetId of datasetIds) {
        const buf = clockBufferRef.current.get(datasetId);
        const covers =
          !!buf &&
          buf.length > 0 &&
          buf[0]!.time <= cursorTime &&
          buf[buf.length - 1]!.time >= cursorTime;
        if (covers) continue;
        const vp = await loadViewportAroundTime(datasetId, clockTf, cursorTime);
        if (gen !== revealGenRef.current) return;
        if (vp.bars.length > 0) clockBufferRef.current.set(datasetId, vp.bars);
      }

      const updates = new Map<
        string,
        { bars: readonly ChartBar[]; windowFrom?: number; totalBars?: number }
      >();

      for (const p of current) {
        let buffer = replayBufferRef.current.get(p.id);
        const covers =
          !!buffer &&
          buffer.length > 0 &&
          buffer[0]!.time <= cursorTime &&
          buffer[buffer.length - 1]!.time >= cursorTime;
        if (!covers) {
          const vp = await loadViewportAroundTime(p.datasetId, p.timeframe, cursorTime);
          if (gen !== revealGenRef.current) return;
          if (vp.bars.length === 0) continue;
          replayBufferRef.current.set(p.id, vp.bars);
          buffer = vp.bars;
          updates.set(p.id, {
            bars: buffer,
            windowFrom: vp.windowFrom,
            totalBars: vp.totalBars,
          });
        }

        const clockBars = clockBufferRef.current.get(p.datasetId) ?? [];
        const display = withFormingOpenBar(
          buffer!,
          clockBars,
          p.timeframe,
          clockTf,
          cursorTime,
        );
        const prev = updates.get(p.id);
        updates.set(p.id, {
          bars: display,
          windowFrom: prev?.windowFrom,
          totalBars: prev?.totalBars,
        });
      }

      if (updates.size === 0) return;
      setPanes((prev) => {
        let changed = false;
        const next = prev.map((pane) => {
          const u = updates.get(pane.id);
          if (!u) return pane;
          if (
            u.bars === pane.bars &&
            u.windowFrom === undefined &&
            u.totalBars === undefined
          ) {
            return pane;
          }
          changed = true;
          return {
            ...pane,
            bars: u.bars as ChartBar[],
            ...(u.windowFrom !== undefined ? { windowFrom: u.windowFrom } : {}),
            ...(u.totalBars !== undefined ? { totalBars: u.totalBars } : {}),
          };
        });
        if (!changed) return prev;
        panesRef.current = next;
        return next;
      });
    },
    [catalog],
  );

  const loadSessionData = useCallback(
    async (next: BacktestSession) => {
      viewportReloadEnabledRef.current = false;
      lastReplayCursorRef.current = null;
      replayBufferRef.current.clear();
      clockBufferRef.current.clear();
      cameraDetachedRef.current = false;
      setCameraDetached(false);
      replayRef.current.pause();

      setSession(next);
      setLoadStatus('loading');
      setLoadError(null);
      setIngestPct(0);
      setView('chart');
      setPanes([]);
      panesRef.current = [];
      seriesRef.current = [];
      setDraftPoints([]);

      try {
        const resolved = resolveBaseDatasetsForSession(next);
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
        const openTf = sharedTfs.includes(next.timeframe)
          ? next.timeframe
          : (sharedTfs[0] ?? primary.catalog.baseTf);

        const { timeStart, timeEnd } = replayBounds(next, seriesList);

        // TV-style: always open one pane. Extra session pairs stay in the TopBar switcher.
        const startVp = await loadViewportAroundTime(primary.datasetId, openTf, timeStart);
        if (startVp.bars.length === 0) {
          throw new Error(
            `No bars to display for ${primary.pair}. Re-download or pick a different overlap.`,
          );
        }
        const nextPanes: ChartPaneState[] = [
          {
            id: 'pane-0',
            timeframe: openTf,
            selectedTf: openTf,
            bars: startVp.bars,
            range: rangeCenteredOnIndex(0, REPLAY_VISIBLE_BARS),
            windowFrom: startVp.windowFrom,
            totalBars: startVp.totalBars,
            pair: primary.pair,
            datasetId: primary.datasetId,
          },
        ];
        replayBufferRef.current.set('pane-0', startVp.bars);

        panesRef.current = nextPanes;
        setPanes(nextPanes);
        setActivePaneId('pane-0');
        setChartLayout('1');

        const firstBar = nextPanes[0]!.bars[0]!;
        const clockTf = smallestTimeframe(nextPanes.map((p) => p.timeframe));
        const windowSec = timeframeSeconds(clockTf) * REPLAY_VISIBLE_BARS;
        replayRef.current.configure(timeStart, timeEnd, windowSec);
        syncReplayClockTf(nextPanes);
        replayRef.current.seek(firstBar.time, { silent: true });
        lastReplayCursorRef.current = firstBar.time;

        const key = `${next.id}:${primary.datasetId}`;
        setDrawings(loadDrawings(key));
        setOrders(listOrdersForSession(next.id));
        setSelectedOrderId(null);

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
    [syncReplayClockTf],
  );

  // Replay: refresh bar buffers only. Never publish sync time ranges during play —
  // a trailing window maps to a left-aligned index range and snaps the camera.
  useEffect(() => {
    const ctrl = replayRef.current;
    return ctrl.subscribe((rs) => {
      setReplayTick((n) => n + 1);
      if (!catalog || !viewportReloadEnabledRef.current) return;
      if (lastReplayCursorRef.current === rs.cursorTime && !rs.playing) return;
      lastReplayCursorRef.current = rs.cursorTime;

      // On restart-to-start, drop old end-of-series buffer so we reload from bar 1
      if (rs.playing && rs.cursorTime <= rs.startTime + 1) {
        replayBufferRef.current.clear();
        clockBufferRef.current.clear();
        cameraDetachedRef.current = false;
        setCameraDetached(false);
      }

      void applyReplayReveal(rs.cursorTime);
    });
  }, [catalog, applyReplayReveal]);

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
      // User dragged during play → detach camera so pan stays smooth
      if (
        replayRef.current.get().playing &&
        state.origin != null &&
        state.origin.startsWith('pane')
      ) {
        cameraDetachedRef.current = true;
        setCameraDetached(true);
        return;
      }
      if (replayRef.current.get().playing) return;
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
    const anchor = syncStoreRef.current?.get().timeRange?.toTime ?? catalog.timeEnd;
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
      panesRef.current = next;
      setPanes(next);
      syncReplayClockTf(next);
      setActivePaneId((cur) => {
        const idx = Number(cur.replace('pane-', ''));
        return Number.isFinite(idx) && idx < count ? cur : 'pane-0';
      });
    })();
  };

  const applyPaneTimeframe = useCallback(
    (paneId: string, tf: Timeframe) => {
      if (!catalog) return;
      const existing = panesRef.current.find((p) => p.id === paneId);
      if (!existing) return;
      if (existing.selectedTf === tf && existing.timeframe === tf) {
        setActivePaneId(paneId);
        return;
      }
      const syncAll = layoutSyncRef.current.interval;
      const targets = syncAll
        ? panesRef.current.map((p) => p.id)
        : [paneId];
      void (async () => {
        const replay = replayRef.current.get();
        const cursorTime = replay.cursorTime;
        const updates = new Map<string, ChartPaneState>();
        for (const id of targets) {
          const pane = panesRef.current.find((p) => p.id === id);
          if (!pane || pane.bars.length === 0) continue;

          // Live camera from the engine (pane.range in React is often stale after pan/zoom).
          const engine = getChart(id);
          const liveRange = engine?.getVisibleRange() ?? pane.range;
          const span = Math.max(1, liveRange.toIndex - liveRange.fromIndex);
          const liveTr =
            timeRangeFromVisible(pane.bars, liveRange) ??
            syncStoreRef.current?.get().timeRange ??
            null;

          // Replay always masks bars after cursorTime. Anchoring past the cursor
          // leaves an empty plot (or one huge candle). Keep the right edge on the
          // last revealed bar; preserve candle count for scale.
          let anchorTime =
            liveTr != null
              ? liveTr.toTime
              : (pane.bars[pane.bars.length - 1]?.time ?? catalog.timeEnd);
          if (Number.isFinite(cursorTime)) {
            anchorTime = Math.min(anchorTime, cursorTime);
          }

          const vp = await loadViewportAroundTime(
            pane.datasetId,
            tf,
            anchorTime,
            Math.ceil(span),
          );
          if (vp.bars.length === 0) continue;

          const range = Number.isFinite(cursorTime)
            ? revealRangeAtCursor(vp.bars, cursorTime, span)
            : rangeCenteredOnIndex(logicalIndexAtTime(vp.bars, anchorTime), span);

          updates.set(id, {
            id,
            timeframe: tf,
            selectedTf: tf,
            bars: vp.bars,
            range,
            windowFrom: vp.windowFrom,
            totalBars: vp.totalBars,
            pair: pane.pair,
            datasetId: pane.datasetId,
          });
          replayBufferRef.current.set(id, vp.bars);
        }
        if (updates.size === 0) return;

        // Keep / restore follow while playing so the live candle stays in view.
        if (replay.playing) {
          cameraDetachedRef.current = false;
          setCameraDetached(false);
          for (const id of updates.keys()) getChart(id)?.setReplayFollow(true);
        }

        setPanes((prev) => {
          const next = prev.map((p) => updates.get(p.id) ?? p);
          panesRef.current = next;
          syncReplayClockTf(next);
          return next;
        });
        setActivePaneId(paneId);
        const focus = updates.get(paneId);
        if (focus) {
          const newTr = timeRangeFromVisible(focus.bars, focus.range);
          if (newTr) syncStoreRef.current?.setTimeRange(newTr, 'tf-switch');
        }
        // Refresh clock/forming buffers for the new TF at the current cursor.
        if (Number.isFinite(cursorTime)) {
          lastReplayCursorRef.current = null;
          void applyReplayReveal(cursorTime);
        }
      })();
    },
    [applyReplayReveal, catalog, syncReplayClockTf],
  );

  /** Rebind pane(s) to another session symbol (TV symbol switcher). */
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
      const anchor =
        syncStoreRef.current?.get().timeRange?.toTime ?? catalog.timeEnd;
      const syncAll = layoutSyncRef.current.symbol;
      const targets = syncAll
        ? panesRef.current.map((p) => p.id)
        : [paneId];
      void (async () => {
        const updates = new Map<string, ChartPaneState>();
        for (const id of targets) {
          const pane = panesRef.current.find((p) => p.id === id);
          if (!pane) continue;
          const rebuilt = await buildPane(
            id,
            pane.selectedTf,
            anchor,
            { pair: series.pair, datasetId: series.datasetId },
            pane.selectedTf,
          );
          if (rebuilt) {
            updates.set(id, rebuilt);
            replayBufferRef.current.delete(id);
          }
        }
        if (updates.size === 0) return;
        setPanes((prev) => {
          const next = prev.map((p) => updates.get(p.id) ?? p);
          panesRef.current = next;
          return next;
        });
        setActivePaneId(paneId);
      })();
    },
    [buildPane, catalog],
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
    viewportReloadEnabledRef.current = false;
    // Drop replay viewport buffers so long sessions don't retain bars after exit
    replayBufferRef.current.clear();
    clockBufferRef.current.clear();
    revealGenRef.current += 1;
    replayRef.current.pause();
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
    if (session) teardownChartSession();
    setJournalSessionId(id);
    setView('journal');
  };

  const persistOrders = useCallback(
    (next: ChartOrder[]) => {
      setOrders(next);
      if (session) saveOrdersForSession(session.id, next);
    },
    [session],
  );

  const handlePlaceOrder = useCallback(() => {
    if (!session) return;
    const pane = panesRef.current.find((p) => p.id === activePaneId) ?? panesRef.current[0];
    if (!pane || pane.bars.length === 0) return;
    const last = pane.bars[pane.bars.length - 1]!;
    const order = createMockOrder({
      sessionId: session.id,
      pair: pane.pair,
      side: 'buy',
      entry: last.close,
    });
    persistOrders([...orders, order]);
    setSelectedOrderId(order.id);
  }, [session, activePaneId, orders, persistOrders]);

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
        onGoSessions={() => {
          setJournalSessionId(null);
          setView('sessions');
        }}
        onOpenChart={(id) => {
          const s = getSession(id);
          if (s) void loadSessionData(s);
        }}
      />
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
        onSeriesTypeChange={setSeriesType}
        crosshairMode={crosshairMode}
        onCrosshairModeChange={setCrosshairMode}
        chartLayout={chartLayout}
        onChartLayoutChange={handleLayoutChange}
        layoutSync={layoutSync}
        onLayoutSyncChange={setLayoutSync}
        showVolume={showVolume}
        onShowVolumeChange={setShowVolume}
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

        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative bg-background">
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
              onShowVolumeChange={setShowVolume}
              volumeOpacity={volumeOpacity}
              onVolumeOpacityChange={setVolumeOpacity}
              enabledIndicators={enabledIndicators}
              onEnabledIndicatorsChange={setEnabledIndicators}
              orders={orders}
              selectedOrderId={selectedOrderId}
              onOrderSelect={setSelectedOrderId}
              backtestResult={btResult}
              syncCrosshair={layoutSync.crosshair || layoutSync.time}
              syncDateRange={layoutSync.dateRange}
              drawings={drawings}
              placement={placement}
              selectedDrawingId={selectedDrawingId}
              drawingsHidden={drawingsHidden}
              replayCursorTime={replayState.cursorTime}
              replayFollow={replayState.playing && !cameraDetached}
              showFollowControl={
                replayState.cursorTime != null && cameraDetached
              }
              onReattachFollow={() => {
                cameraDetachedRef.current = false;
                setCameraDetached(false);
              }}
              drawingToolActive={isDrawingTool(activeTool)}
              drawingsLocked={drawingsLocked}
              onChartPoint={handleChartPoint}
              onCrosshairSample={handleCrosshairForDrawings}
              onDrawingsChange={handleEngineDrawingsChange}
              onDrawingSelect={handleEngineDrawingSelect}
              onUserGesture={() => {
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
        </div>
      </div>

      <BottomBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'analytics' || tab === 'history') {
            handleOpenJournal(session.id);
            return;
          }
          setActiveTab(tab);
        }}
        replay={replayState}
        onPlay={() => {
          cameraDetachedRef.current = false;
          setCameraDetached(false);
          replayRef.current.play();
        }}
        onPause={() => replayRef.current.pause()}
        onToggle={() => {
          if (!replayRef.current.get().playing) {
            cameraDetachedRef.current = false;
            setCameraDetached(false);
          }
          replayRef.current.toggle();
        }}
        onStep={(d) => {
          // Keep camera where the user left it — only Play / double-click re-attach
          replayRef.current.step(d);
        }}
        onSpeed={(s) => replayRef.current.setSpeed(s)}
        onSeek={(t) => {
          // Scrub keeps camera detached; Play re-attaches
          replayRef.current.seek(t);
        }}
        equityLabel={equityLabel}
        pnlLabel={pnlLabel}
        pnlPositive={pnlPositive}
        tradeCount={btResult?.trades.length}
      />
    </div>
  );
}
