import {
  indexAtOrBeforeBars,
  timeRangeFromVisible,
  visibleRangeFromTimeWindow,
} from '@/data/timeframeAgg';
import { applyShiftConstrainIfNeeded } from '@/drawings/constrain';
import {
  createDraftDrawing,
  createDrawing,
  type Drawing,
  type DrawingPoint,
} from '@/drawings/drawingStore';
import {
  cursorForDrawingHit,
  hitTestDrawings,
  type HitResult,
} from '@/drawings/hitTest';
import {
  magnetSnap,
  type MagnetMode,
} from '@/drawings/magnet';
import {
  applyChannelWidthDrag,
  isChannelTool,
  isChannelWidthHandle,
} from '@/drawings/channelHandles';
import { syncRiskRewardMeta } from '@/drawings/positionMath';
import {
  applyRectEdgeDrag,
  isRectEdgeHandle,
  isRectLikeTool,
} from '@/drawings/rectHandles';
import type { DrawingToolId } from '@/drawings/toolRegistry';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import type { IndicatorOverlayResult, IndicatorPaneResult } from '@/types/indicator';
import type { BacktestEvent, BacktestResult } from '@/types/backtest';
import type { ChartOrder, OrderLevelHit } from '@/types/order';
import {
  alignIndicatorOverlays,
  alignIndicatorPanes,
} from '@/indicators/tipSync';
import {
  beginLevelDrag,
  cancelLevelDrag,
  endLevelDrag,
  ensureDragReadout,
  levelDrag,
  moveLevelDrag,
} from '@/orders/levelDrag';
import { ledgerAcquire, ledgerRelease } from '@/dev/resourceLedger';
import { markChartPaint } from '@/perf/perfMonitor';
import { hitTestOrderLevel, hitTestOrders } from './overlays/drawOrders';
import { hitTestBacktestEvent } from './overlays/drawBacktest';
import { MAX_BARS_IN_MEMORY, VISIBLE_BARS_TARGET } from '@/utils/constants';
import { subscribeAppearance } from './appearanceStore';
import { getChartColors } from './chartTheme';
import { resolveCrosshair, resolveCrosshairFromLogical } from './crosshair';
import {
  attachInteraction,
  DEFAULT_VISIBLE_BARS,
  type InteractionHandle,
} from './interaction';
import { rangeCenteredOnIndex, rangeRightAnchored } from './rangeAnchor';
import {
  contentBottom,
  createLayout,
  paintBaseFrame,
  paintDrawingsFrame,
  paintOverlayFrame,
  type RenderLayout,
} from './renderer';
import { yToPaneValue } from './series/drawIndicatorPane';
import {
  computePriceScale,
  xToIndex,
  yToPrice,
  type PriceScale,
} from './scales';
import type { SyncCrosshair } from './sync/chartSyncStore';
import type {
  ChartViewOptions,
  CrosshairListener,
  CrosshairMode,
  CrosshairPoint,
  SeriesType,
} from './types';

export interface OrderDragContext {
  tickSize: number;
  digits: number;
  pipSize: number;
  contractSize: number;
  lotStep: number;
  minLot: number;
  maxLot: number;
  baseCurrency: string;
  quoteCurrency: string;
  equity: number;
  riskPercent: number;
  riskLocked: boolean;
  container: HTMLElement;
  /** Live bid/ask for LIMIT↔STOP helper while dragging entry. */
  bid: number;
  ask: number;
}

export interface DrawingPlacement {
  tool: DrawingToolId;
  points: DrawingPoint[];
  /** Freehand stroke is accumulating points on pointer move. */
  freehandActive?: boolean;
}

export type VisibleRangeListener = (range: VisibleRange) => void;
export type PlotClickListener = (point: CrosshairPoint) => void;
export type UserGestureListener = () => void;
export type ContextMenuListener = (x: number, y: number) => void;
export type DrawingsChangeListener = (drawings: readonly Drawing[]) => void;
export type DrawingSelectListener = (drawingId: string) => void;
export type FreehandStrokePhase = 'start' | 'move' | 'end';
export type FreehandStrokeListener = (
  phase: FreehandStrokePhase,
  point: DrawingPoint | null,
) => void;

interface DrawingDragState {
  id: string;
  mode: 'handle' | 'body';
  handleIndex: number | null;
  originPoints: DrawingPoint[];
  anchorTime: number;
  anchorPrice: number;
  cursor: string;
}

const MIN_VISIBLE = 10;
const MAX_VISIBLE = VISIBLE_BARS_TARGET;

function clampNavRange(next: VisibleRange, barCount: number): VisibleRange {
  if (barCount <= 0) return { fromIndex: 0, toIndex: 1 };

  let span = next.toIndex - next.fromIndex;
  span = Math.max(MIN_VISIBLE, Math.min(span, MAX_VISIBLE));

  let fromIndex = next.fromIndex;
  let toIndex = fromIndex + span;

  const minFrom = -(span - MIN_VISIBLE);
  const maxTo = barCount + (span - MIN_VISIBLE);

  if (toIndex > maxTo) {
    toIndex = maxTo;
    fromIndex = toIndex - span;
  }
  if (fromIndex < minFrom) {
    fromIndex = minFrom;
    toIndex = fromIndex + span;
  }

  return { fromIndex, toIndex };
}

export interface ChartInstance {
  canvas: HTMLCanvasElement;
  setViewportBars: (bars: readonly ChartBar[]) => void;
  /** Live engine bars (may be ahead of React props during replay). */
  getBars: () => readonly ChartBar[];
  setVisibleRange: (fromIndex: number, toIndex: number, opts?: { silent?: boolean }) => void;
  getVisibleRange: () => VisibleRange;
  onVisibleRangeChange: (cb: VisibleRangeListener) => () => void;
  onCrosshairMove: (cb: CrosshairListener) => () => void;
  onPlotClick: (cb: PlotClickListener) => () => void;
  onUserGesture: (cb: UserGestureListener) => () => void;
  /** Right-click on canvas — open chart settings. */
  onContextMenu: (cb: ContextMenuListener) => () => void;
  /** Multi-chart: apply logical crosshair (local x/y recomputed). */
  setCrosshairLogical: (logical: SyncCrosshair | null) => void;
  setCrosshairMode: (mode: CrosshairMode) => void;
  getCrosshairMode: () => CrosshairMode;
  setSeriesType: (type: SeriesType) => void;
  getSeriesType: () => SeriesType;
  setShowVolume: (show: boolean) => void;
  setShowBrandWatermark: (show: boolean) => void;
  setVolumeOpacity: (opacity: number) => void;
  getVolumeSettings: () => { visible: boolean; opacity: number };
  setShowLastPrice: (show: boolean) => void;
  /** Viewport-sized price overlays (Worker-computed). */
  setIndicatorOverlays: (overlays: readonly IndicatorOverlayResult[]) => void;
  /** Oscillator panes (RSI/MACD) — rebuilds layout stack. */
  setIndicatorPanes: (panes: readonly IndicatorPaneResult[]) => void;
  /** Session order / position levels (entry / SL / TP lines). */
  setOrders: (orders: readonly ChartOrder[], selectedId?: string | null) => void;
  hitTestOrdersAt: (y: number) => string | null;
  /** Context for SL/TP drag readout + tick snap (no React during drag). */
  setOrderDragContext: (ctx: OrderDragContext | null) => void;
  onOrderLevelCommit: (cb: (hit: OrderLevelHit & { price: number; cancelled?: boolean }) => void) => () => void;
  /** Strategy backtest markers / equity overlay (results only). */
  setBacktestResult: (result: BacktestResult | null) => void;
  /** Click-to-explain: nearest strategy mark under pointer. */
  hitTestBacktestAt: (x: number, y: number) => BacktestEvent | null;
  setSize: (width: number, height: number) => void;
  resetPriceScale: () => void;
  resetTimeScale: () => void;
  /** Reset time + price scales (TradingView double-click / reset button). */
  resetView: () => void;
  /** Zoom time scale; factor &gt; 1 zooms out, &lt; 1 zooms in. */
  zoomTime: (factor: number) => void;
  /** Pan time scale by bar count (positive = later / right). Detaches replay follow. */
  panTime: (deltaBars: number) => void;
  /** Re-attach follow and center on replay cursor (or last bar). */
  followRealtime: () => void;
  setDrawings: (
    drawings: readonly Drawing[],
    draft?: Drawing | null,
    opts?: {
      selectedId?: string | null;
      hidden?: boolean;
      paneTimeframe?: Timeframe | null;
    },
  ) => void;
  /** Drawing magnet for place preview + handle drag. */
  setDrawingMagnetMode: (mode: MagnetMode) => void;
  /** Shift held — constrain rubber-band to H / V / 45°. */
  setDrawingShiftHeld: (held: boolean) => void;
  /** In-progress tool placement — engine owns rubber-band draft (no React per-move). */
  setPlacement: (placement: DrawingPlacement | null) => void;
  setReplayCursorTime: (time: number | null) => void;
  /** In-place tip update during replay — no array copy (addendum §3/§6). */
  patchFormingBar: (forming: ChartBar) => void;
  /**
   * Sync revealed bars during playback without a full slice when possible:
   * append new bars + patch overlap tip, then set cursor / follow.
   */
  syncReplayReveal: (nextBars: readonly ChartBar[], cursorTime: number) => void;
  /**
   * Called after syncReplayReveal aligns indicator buffers.
   * Hook for trailing-window tip recompute (no React at frame rate).
   */
  onIndicatorReveal: (cb: ((bars: readonly ChartBar[]) => void) | null) => void;
  getIndicatorOverlays: () => readonly IndicatorOverlayResult[];
  getIndicatorPanes: () => readonly IndicatorPaneResult[];
  /** When true, each cursor update recenters the live candle (until user pans). */
  setReplayFollow: (follow: boolean) => void;
  /** Hit-test drawings at media coords (plot space). */
  hitTestDrawingsAt: (x: number, y: number) => HitResult | null;
  /** When false, hover/drag on drawings is disabled (placing tool / global lock). */
  setDrawingInteractEnabled: (enabled: boolean) => void;
  /**
   * When true, plot press-drag starts a freehand stroke (brush/highlighter)
   * instead of panning — if no drawing was hit.
   */
  setFreehandStrokeEnabled: (enabled: boolean) => void;
  /** When true, plot press-drag draws a zoom marquee (after freehand miss). */
  setMarqueeZoomEnabled: (enabled: boolean) => void;
  onDrawingsChange: (cb: DrawingsChangeListener) => () => void;
  onDrawingSelect: (cb: DrawingSelectListener) => () => void;
  onFreehandStroke: (cb: FreehandStrokeListener) => () => void;
  destroy: () => void;
}

const DEFAULT_OPTIONS: ChartViewOptions = {
  seriesType: 'candle',
  crosshairMode: 'normal',
  showVolume: false,
  showLastPrice: true,
  volumeOpacity: 0.4,
  showBrandWatermark: true,
};

/**
 * Custom Canvas 2D chart engine — full chart window.
 * Dumb viewport renderer: never owns the full dataset.
 */
export function createChartInstance(container: HTMLElement): ChartInstance {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    throw new Error('Canvas 2D context unavailable');
  }
  ledgerAcquire('charts');

  let width = container.clientWidth || 800;
  let height = container.clientHeight || 500;
  let dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  let options: ChartViewOptions = { ...DEFAULT_OPTIONS };
  let indicatorOverlays: readonly IndicatorOverlayResult[] = [];
  let indicatorPanes: readonly IndicatorPaneResult[] = [];
  let indicatorRevealCb: ((bars: readonly ChartBar[]) => void) | null = null;

  const rebuildLayout = () => {
    const colors = getChartColors();
    layout = createLayout(width, height, dpr, {
      showVolume: options.showVolume,
      indicatorPaneCount: indicatorPanes.length,
      showPriceScale: colors.showPriceScale,
      showTimeScale: colors.showTimeScale,
    });
  };

  let layout: RenderLayout = createLayout(width, height, dpr, {
    showVolume: options.showVolume,
    indicatorPaneCount: 0,
    showPriceScale: getChartColors().showPriceScale,
    showTimeScale: getChartColors().showTimeScale,
  });

  let bars: ChartBar[] = [];
  let range: VisibleRange = { fromIndex: 0, toIndex: 1 };
  let priceScaleMode: 'auto' | 'manual' = 'auto';
  let manualPriceScale: PriceScale | null = null;
  let crosshair: CrosshairPoint | null = null;
  let hoverX: number | null = null;
  let hoverY: number | null = null;
  let drawings: readonly Drawing[] = [];
  let draftDrawing: Drawing | null = null;
  let placement: DrawingPlacement | null = null;
  let selectedDrawingId: string | null = null;
  let hoveredDrawingId: string | null = null;
  let drawingsHidden = false;
  let paneTimeframe: Timeframe | null = null;
  let drawingMagnetMode: MagnetMode = 'off';
  let drawingShiftHeld = false;
  let replayCursorTime: number | null = null;
  /** Engine-owned camera follow — avoids React re-applying a stale range after pan. */
  let replayFollow = false;
  /** Cursor/move/resize on drawings (off while placing a tool or when locked). */
  let drawingInteractEnabled = true;
  /** Brush / highlighter press-drag (on while freehand tool is active). */
  let freehandStrokeEnabled = false;
  /** Zoom tool marquee press-drag. */
  let marqueeZoomEnabled = false;
  let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let drawingDrag: DrawingDragState | null = null;
  let chartOrders: readonly ChartOrder[] = [];
  let selectedOrderId: string | null = null;
  let orderDragCtx: OrderDragContext | null = null;
  let orderLevelDragging = false;
  const orderLevelCommitListeners = new Set<
    (hit: OrderLevelHit & { price: number; cancelled?: boolean }) => void
  >();
  let backtestResult: BacktestResult | null = null;

  /** Layered paint: series | drawings | overlay (crosshair/draft). */
  let sceneDirty = true;
  let drawingsDirty = true;
  let overlayDirty = true;
  let rafId: number | null = null;
  let destroyed = false;
  let themeObserver: MutationObserver | null = null;
  let staticCanvas: HTMLCanvasElement | null = null;
  let staticCtx: CanvasRenderingContext2D | null = null;
  let drawingsCanvas: HTMLCanvasElement | null = null;
  let drawingsCtx: CanvasRenderingContext2D | null = null;

  /** Cached auto price scale — invalidated when bars/range/cursor change. */
  let cachedAutoScale: PriceScale | null = null;
  let scaleCacheKey = '';

  /** Shared hit-test for cursor + hover in the same move. */
  let hitCacheX = Number.NaN;
  let hitCacheY = Number.NaN;
  let hitCache: HitResult | null = null;

  const rangeListeners = new Set<VisibleRangeListener>();
  const crosshairListeners = new Set<CrosshairListener>();
  const plotClickListeners = new Set<PlotClickListener>();
  const userGestureListeners = new Set<UserGestureListener>();
  const contextMenuListeners = new Set<ContextMenuListener>();
  const drawingsChangeListeners = new Set<DrawingsChangeListener>();
  const drawingSelectListeners = new Set<DrawingSelectListener>();
  const freehandStrokeListeners = new Set<FreehandStrokeListener>();
  let unsubAppearance: (() => void) | null = null;

  const invalidateScaleCache = () => {
    cachedAutoScale = null;
    scaleCacheKey = '';
  };

  const invalidateHitCache = () => {
    hitCacheX = Number.NaN;
    hitCacheY = Number.NaN;
    hitCache = null;
  };

  const markSceneDirty = () => {
    sceneDirty = true;
    drawingsDirty = true;
    overlayDirty = true;
    schedulePaint();
  };

  const markDrawingsDirty = () => {
    drawingsDirty = true;
    overlayDirty = true;
    schedulePaint();
  };

  const markOverlayDirty = () => {
    overlayDirty = true;
    schedulePaint();
  };

  /** @deprecated alias — full scene invalidate */
  const markDirty = markSceneDirty;

  const ensureLayerBuffers = () => {
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (!staticCanvas || !staticCtx || staticCanvas.width !== w || staticCanvas.height !== h) {
      staticCanvas = document.createElement('canvas');
      staticCanvas.width = w;
      staticCanvas.height = h;
      staticCtx = staticCanvas.getContext('2d');
      sceneDirty = true;
    }
    if (
      !drawingsCanvas ||
      !drawingsCtx ||
      drawingsCanvas.width !== w ||
      drawingsCanvas.height !== h
    ) {
      drawingsCanvas = document.createElement('canvas');
      drawingsCanvas.width = w;
      drawingsCanvas.height = h;
      drawingsCtx = drawingsCanvas.getContext('2d');
      drawingsDirty = true;
    }
  };

  const resolvePriceScale = (): PriceScale => {
    if (priceScaleMode === 'manual' && manualPriceScale) {
      return manualPriceScale;
    }
    const key = `${bars.length}|${range.fromIndex}|${range.toIndex}|${replayCursorTime ?? ''}`;
    if (cachedAutoScale && scaleCacheKey === key) return cachedAutoScale;
    const maxBarIndex =
      replayCursorTime != null && bars.length > 0
        ? indexAtOrBeforeBars(bars, replayCursorTime)
        : null;
    cachedAutoScale = computePriceScale(bars, range, maxBarIndex);
    scaleCacheKey = key;
    return cachedAutoScale;
  };

  const emitCrosshair = (point: CrosshairPoint | null) => {
    for (const cb of crosshairListeners) cb(point);
  };

  const hitDrawingCached = (x: number, y: number): HitResult | null => {
    if (!drawingInteractEnabled || drawingsHidden || drawings.length === 0) return null;
    if (x === hitCacheX && y === hitCacheY) return hitCache;
    hitCache = hitTestDrawings(
      x,
      y,
      drawings,
      bars,
      range,
      layout.plot,
      resolvePriceScale(),
      paneTimeframe,
    );
    hitCacheX = x;
    hitCacheY = y;
    return hitCache;
  };

  const updatePlacementDraft = (hover: DrawingPoint | null) => {
    if (!placement) {
      if (draftDrawing !== null) {
        draftDrawing = null;
        markOverlayDirty();
      }
      return;
    }
    let tip = hover;
    if (tip && !placement.freehandActive) {
      tip = magnetSnap(tip, bars, drawingMagnetMode);
      tip = applyShiftConstrainIfNeeded(
        placement.tool,
        placement.points,
        tip,
        bars,
        drawingShiftHeld,
      );
    }
    // Freehand: points already include the stroke (App/rAF). Else rubber-band to hover.
    const pts =
      placement.freehandActive || !tip
        ? placement.points
        : [...placement.points, tip];
    if (pts.length === 0) {
      if (draftDrawing !== null) {
        draftDrawing = null;
        markOverlayDirty();
      }
      return;
    }
    draftDrawing = createDraftDrawing(placement.tool, pts);
    markOverlayDirty();
  };

  const updateDrawingHover = (x: number | null, y: number | null) => {
    if (drawingsHidden || x === null || y === null || drawings.length === 0) {
      if (hoveredDrawingId !== null) {
        hoveredDrawingId = null;
        markDrawingsDirty();
      }
      return;
    }
    const hit = hitDrawingCached(x, y);
    const nextId = hit?.drawingId ?? null;
    if (nextId !== hoveredDrawingId) {
      hoveredDrawingId = nextId;
      markDrawingsDirty(); // handles only — series layer stays cached
    }
  };

  const updateCrosshairFromHover = () => {
    if (hoverX === null || hoverY === null) {
      if (crosshair !== null) {
        crosshair = null;
        emitCrosshair(null);
      }
      updateDrawingHover(null, null);
      updatePlacementDraft(null);
      markOverlayDirty();
      return;
    }
    const bottom = contentBottom(layout);
    const scale = resolvePriceScale();
    const visual = resolveCrosshair(
      hoverX,
      hoverY,
      options.crosshairMode,
      bars,
      range,
      layout.plot,
      scale,
      bottom,
    );
    // Keep magnetized x/y for paint, but expose free time/price so drawings
    // can preview/place in empty pad space (unless drawing-magnet snaps later).
    let next = visual;
    let freePoint: DrawingPoint | null = null;
    if (visual && options.crosshairMode !== 'normal') {
      const free = resolveCrosshair(
        hoverX,
        hoverY,
        'normal',
        bars,
        range,
        layout.plot,
        scale,
        bottom,
      );
      if (free) {
        freePoint = { time: free.time, price: free.price };
        next = {
          ...visual,
          time: free.time,
          price: free.price,
          index: free.index,
        };
      }
    } else if (visual) {
      freePoint = { time: visual.time, price: visual.price };
    }

    // When hovering an indicator pane, report that pane's scale value as price.
    if (next && hoverY != null) {
      const maxBarIndex =
        replayCursorTime != null ? indexAtOrBeforeBars(bars, replayCursorTime) : null;
      for (let i = 0; i < indicatorPanes.length; i++) {
        const panePlot = layout.indicatorPlots[i];
        const pane = indicatorPanes[i];
        if (!panePlot || !pane || panePlot.height <= 0) continue;
        if (
          hoverY >= panePlot.top &&
          hoverY <= panePlot.top + panePlot.height
        ) {
          const paneVal = yToPaneValue(
            hoverY,
            pane,
            panePlot,
            range,
            maxBarIndex,
            bars.length,
          );
          next = { ...next, y: hoverY, price: paneVal };
          break;
        }
      }
    }

    const changed =
      (crosshair === null) !== (next === null) ||
      (crosshair !== null &&
        next !== null &&
        (crosshair.x !== next.x ||
          crosshair.y !== next.y ||
          crosshair.barIndex !== next.barIndex ||
          crosshair.price !== next.price ||
          crosshair.time !== next.time));
    if (changed) {
      crosshair = next;
      emitCrosshair(next);
      markOverlayDirty();
    }
    updateDrawingHover(hoverX, hoverY);
    if (placement) updatePlacementDraft(freePoint);
  };

  const paintState = () => ({
    bars,
    range,
    priceScale: resolvePriceScale(),
    options,
    crosshair,
    drawings,
    draftDrawing,
    selectedDrawingId,
    hoveredDrawingId,
    drawingsHidden,
    paneTimeframe,
    replayCursorTime,
    indicators: indicatorOverlays,
    indicatorPanes,
    orders: chartOrders,
    selectedOrderId,
    backtestResult,
    marquee,
  });

  const schedulePaint = () => {
    if (rafId !== null || destroyed) return;
    ledgerAcquire('rafLoops');
    rafId = requestAnimationFrame((t) => {
      rafId = null;
      ledgerRelease('rafLoops');
      if (destroyed || (!sceneDirty && !drawingsDirty && !overlayDirty)) return;

      ensureLayerBuffers();
      const colors = getChartColors();
      const state = paintState();

      if (sceneDirty && staticCtx && staticCanvas) {
        paintBaseFrame(staticCtx, layout, state, colors);
        sceneDirty = false;
      }

      if (drawingsDirty && drawingsCtx && drawingsCanvas) {
        paintDrawingsFrame(drawingsCtx, layout, state, colors);
        drawingsDirty = false;
      }

      // Blit series + drawings, then cheap overlay
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0);
      if (drawingsCanvas) ctx.drawImage(drawingsCanvas, 0, 0);
      paintOverlayFrame(ctx, layout, state, colors);
      overlayDirty = false;

      if (import.meta.env.DEV) markChartPaint(t);
    });
  };

  const emitRange = () => {
    for (const cb of rangeListeners) cb(range);
  };

  const setVisibleRangeInternal = (next: VisibleRange, emit: boolean) => {
    if (next.fromIndex === range.fromIndex && next.toIndex === range.toIndex) {
      return;
    }
    range = next;
    invalidateScaleCache();
    invalidateHitCache();
    updateCrosshairFromHover();
    markSceneDirty();
    if (emit) emitRange();
  };

  const resetPriceScale = () => {
    priceScaleMode = 'auto';
    manualPriceScale = null;
    invalidateScaleCache();
    markSceneDirty();
  };

  const currentSpan = () =>
    Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, range.toIndex - range.fromIndex));

  /**
   * Keep the live candle on the right (~90% pad) — same as session derive /
   * pause commit. Centering here made Play↔Pause jump the whole plot.
   */
  const centerOnReplayCursor = (emit: boolean) => {
    if (bars.length === 0 || replayCursorTime == null) return;
    const anchor = indexAtOrBeforeBars(bars, replayCursorTime);
    setVisibleRangeInternal(rangeRightAnchored(anchor, currentSpan()), emit);
  };

  const notifyUserGesture = () => {
    replayFollow = false;
    for (const cb of userGestureListeners) cb();
  };

  const resetTimeScale = () => {
    if (bars.length === 0) return;
    if (replayCursorTime != null) {
      // Re-attach follow after double-click recenter
      replayFollow = true;
      centerOnReplayCursor(false);
      return;
    }
    const anchor = bars.length - 1;
    setVisibleRangeInternal(rangeCenteredOnIndex(anchor, DEFAULT_VISIBLE_BARS), false);
  };

  /** Double-click plot: center live candle + auto price scale (TradingView-like). */
  const resetView = () => {
    resetTimeScale();
    resetPriceScale();
  };

  const zoomTime = (factor: number) => {
    if (bars.length === 0 || !Number.isFinite(factor) || factor <= 0) return;
    const span = currentSpan();
    let nextSpan = span * factor;
    nextSpan = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, nextSpan));

    if (replayFollow && replayCursorTime != null) {
      const tip = indexAtOrBeforeBars(bars, replayCursorTime);
      setVisibleRangeInternal(rangeRightAnchored(tip, nextSpan), true);
      return;
    }
    const anchor = (range.fromIndex + range.toIndex) / 2;
    const fromIndex = anchor - nextSpan / 2;
    setVisibleRangeInternal(
      clampNavRange({ fromIndex, toIndex: fromIndex + nextSpan }, bars.length),
      true,
    );
  };

  const panTime = (deltaBars: number) => {
    if (bars.length === 0 || !Number.isFinite(deltaBars) || deltaBars === 0) return;
    notifyUserGesture();
    setVisibleRangeInternal(
      clampNavRange(
        {
          fromIndex: range.fromIndex + deltaBars,
          toIndex: range.toIndex + deltaBars,
        },
        bars.length,
      ),
      true,
    );
  };

  const followRealtime = () => {
    replayFollow = true;
    if (replayCursorTime != null) {
      centerOnReplayCursor(false);
    } else if (bars.length > 0) {
      setVisibleRangeInternal(
        rangeRightAnchored(bars.length - 1, currentSpan()),
        true,
      );
    }
    markDirty();
  };

  const applyCssSize = () => {
    dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    // Fill container in CSS; map pointer via getBoundingClientRect → layout size
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    rebuildLayout();
    staticCanvas = null;
    staticCtx = null;
    drawingsCanvas = null;
    drawingsCtx = null;
    invalidateScaleCache();
    invalidateHitCache();
    updateCrosshairFromHover();
    markSceneDirty();
  };

  applyCssSize();

  const mediaToLogical = (x: number, y: number): DrawingPoint | null => {
    const bottom = contentBottom(layout);
    const free = resolveCrosshair(
      x,
      y,
      'normal',
      bars,
      range,
      layout.plot,
      resolvePriceScale(),
      bottom,
    );
    if (!free) return null;
    return { time: free.time, price: free.price };
  };

  const resolveFreehandPoint = (x: number, y: number): DrawingPoint | null => {
    const logical = mediaToLogical(x, y);
    if (!logical) return null;
    return magnetSnap(logical, bars, drawingMagnetMode);
  };

  const emitFreehandStroke = (phase: FreehandStrokePhase, point: DrawingPoint | null) => {
    for (const cb of freehandStrokeListeners) cb(phase, point);
  };

  const hitDrawingAt = (x: number, y: number): HitResult | null => hitDrawingCached(x, y);

  const emitDrawingsChange = (next: readonly Drawing[]) => {
    drawings = next;
    for (const cb of drawingsChangeListeners) cb(next);
    markDirty();
  };

  let interaction: InteractionHandle | null = attachInteraction(canvas, {
    getRange: () => range,
    setRange: (next) => setVisibleRangeInternal(next, true),
    getLayout: () => layout,
    getBarCount: () => bars.length,
    getPriceScale: () => resolvePriceScale(),
    setManualPriceScale: (scale) => {
      priceScaleMode = 'manual';
      manualPriceScale = scale;
      invalidateScaleCache();
      updateCrosshairFromHover();
      markSceneDirty();
    },
    resetPriceScale,
    resetTimeScale: resetView,
    onHover: (x, y) => {
      hoverX = x;
      hoverY = y;
      updateCrosshairFromHover();
    },
    onPlotClick: () => {
      // Always map click in free (normal) space so drawings can land off-candle
      // in empty pad / future area — chart magnet mode only affects the crosshair paint.
      if (hoverX === null || hoverY === null) return;
      const free = mediaToLogical(hoverX, hoverY);
      if (!free) return;
      const bottom = contentBottom(layout);
      const point = resolveCrosshair(
        hoverX,
        hoverY,
        'normal',
        bars,
        range,
        layout.plot,
        resolvePriceScale(),
        bottom,
      );
      if (!point) return;
      for (const cb of plotClickListeners) cb(point);
    },
    onUserGesture: notifyUserGesture,
    onContextMenu: (clientX, clientY) => {
      for (const cb of contextMenuListeners) cb(clientX, clientY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('talaria:open-chart-settings', {
            detail: { x: clientX, y: clientY },
          }),
        );
      }
    },
    getDrawingCursor: (x, y) => {
      const orderHit = hitTestOrderLevel(y, chartOrders, layout.plot, resolvePriceScale());
      // Entry / SL / TP are all draggable (draft + live)
      if (orderHit) return 'ns-resize';
      const hit = hitDrawingAt(x, y);
      if (!hit) {
        // Brush / zoom marquee: show system crosshair so press-drag feels intentional
        if (freehandStrokeEnabled || marqueeZoomEnabled) return 'crosshair';
        return null;
      }
      const d = drawings.find((dr) => dr.id === hit.drawingId);
      if (!d) return null;
      return cursorForDrawingHit(hit, d, bars, range, layout.plot, resolvePriceScale(), {
        dragging: drawingDrag?.id === d.id,
      });
    },
    getDrawingDragCursor: () =>
      orderLevelDragging ? 'ns-resize' : (drawingDrag?.cursor ?? null),
    beginFreehandStroke: (x, y) => {
      if (!freehandStrokeEnabled) return false;
      // Prefer select over stroke when pressing an existing drawing (plot click).
      if (!drawingsHidden && drawings.length > 0) {
        const existing = hitTestDrawings(
          x,
          y,
          drawings,
          bars,
          range,
          layout.plot,
          resolvePriceScale(),
          paneTimeframe,
        );
        if (existing) return false;
      }
      const pt = resolveFreehandPoint(x, y);
      if (!pt) return false;
      emitFreehandStroke('start', pt);
      return true;
    },
    moveFreehandStroke: (x, y) => {
      if (!freehandStrokeEnabled) return;
      emitFreehandStroke('move', resolveFreehandPoint(x, y));
    },
    endFreehandStroke: (x, y) => {
      if (!freehandStrokeEnabled) return;
      emitFreehandStroke('end', resolveFreehandPoint(x, y));
    },
    beginDrawingDrag: (x, y, opts) => {
      // Order levels claim before drawings — drag must not reconcile React (§8.2).
      const orderHit = hitTestOrderLevel(y, chartOrders, layout.plot, resolvePriceScale());
      if (orderHit) {
        const order = chartOrders.find((o) => o.id === orderHit.orderId);
        if (order && orderDragCtx) {
          const entryForValidate =
            order.entry ??
            (orderHit.kind === 'entry' ? orderHit.price : null);
          if (entryForValidate == null && orderHit.kind !== 'entry') {
            return false;
          }
          beginLevelDrag({
            orderId: order.id,
            kind: orderHit.kind,
            price: orderHit.price,
            entryPrice: entryForValidate ?? orderHit.price,
            side: order.side,
            bid: orderDragCtx.bid,
            ask: orderDragCtx.ask,
          });
          ensureDragReadout(orderDragCtx.container);
          orderLevelDragging = true;
          selectedOrderId = order.id;
          markOverlayDirty();
          return true;
        }
      }
      const hit = hitDrawingAt(x, y);
      if (!hit) return false;
      let d = drawings.find((dr) => dr.id === hit.drawingId);
      if (!d || d.locked) return false;
      const logical = mediaToLogical(x, y);
      if (!logical) return false;

      // Alt/Option + body drag → clone, then move the clone (TV-like).
      if (opts?.altKey && hit.handleIndex == null) {
        const clone = createDrawing(
          d.type,
          d.points.map((p) => ({ ...p })),
          {
            text: d.text,
            name: d.name,
            style: { ...d.style },
            meta: d.meta ? { ...d.meta } : undefined,
            visible: d.visible !== false,
            visibleOnTfs: d.visibleOnTfs,
            locked: false,
          },
        );
        drawings = [...drawings, clone];
        d = clone;
      }

      const cursor = cursorForDrawingHit(
        hit,
        d,
        bars,
        range,
        layout.plot,
        resolvePriceScale(),
        { dragging: true },
      );
      drawingDrag = {
        id: d.id,
        mode: hit.handleIndex != null ? 'handle' : 'body',
        handleIndex: hit.handleIndex,
        originPoints: d.points.map((p) => ({ ...p })),
        anchorTime: logical.time,
        anchorPrice: logical.price,
        cursor,
      };
      selectedDrawingId = d.id;
      hoveredDrawingId = d.id;
      for (const cb of drawingSelectListeners) cb(d.id);
      markDirty();
      return true;
    },
    beginMarqueeZoom: (x, y) => {
      if (!marqueeZoomEnabled) return false;
      marquee = { x0: x, y0: y, x1: x, y1: y };
      markOverlayDirty();
      return true;
    },
    moveMarqueeZoom: (x, y) => {
      if (!marquee) return;
      marquee = { ...marquee, x1: x, y1: y };
      markOverlayDirty();
    },
    endMarqueeZoom: (x, y) => {
      if (!marquee) return;
      const x0 = marquee.x0;
      const y0 = marquee.y0;
      marquee = null;
      markOverlayDirty();

      const plot = layout.plot;
      const left = Math.max(plot.left, Math.min(x0, x));
      const right = Math.min(plot.left + plot.width, Math.max(x0, x));
      const top = Math.max(plot.top, Math.min(y0, y));
      const bottom = Math.min(plot.top + plot.height, Math.max(y0, y));
      if (right - left < 12 || bottom - top < 12) return;

      notifyUserGesture();
      const i0 = xToIndex(left, range, plot);
      const i1 = xToIndex(right, range, plot);
      let fromIndex = Math.min(i0, i1);
      let toIndex = Math.max(i0, i1);
      let span = toIndex - fromIndex;
      if (span < MIN_VISIBLE) {
        const mid = (fromIndex + toIndex) / 2;
        fromIndex = mid - MIN_VISIBLE / 2;
        toIndex = mid + MIN_VISIBLE / 2;
        span = MIN_VISIBLE;
      }
      if (span > MAX_VISIBLE) {
        const mid = (fromIndex + toIndex) / 2;
        fromIndex = mid - MAX_VISIBLE / 2;
        toIndex = mid + MAX_VISIBLE / 2;
      }
      setVisibleRangeInternal(
        clampNavRange({ fromIndex, toIndex }, bars.length),
        true,
      );

      const scale = resolvePriceScale();
      const pTop = yToPrice(top, scale, plot);
      const pBot = yToPrice(bottom, scale, plot);
      let min = Math.min(pTop, pBot);
      let max = Math.max(pTop, pBot);
      if (!(max > min)) {
        const pad = Math.abs(scale.max - scale.min) * 0.05 || 1;
        min -= pad;
        max += pad;
      }
      priceScaleMode = 'manual';
      manualPriceScale = { min, max };
      invalidateScaleCache();
      updateCrosshairFromHover();
      markSceneDirty();
    },
    moveDrawingDrag: (x, y) => {
      if (orderLevelDragging && orderDragCtx && levelDrag.active) {
        const price = yToPrice(y, resolvePriceScale(), layout.plot);
        const rect = canvas.getBoundingClientRect();
        const scaleY = rect.height / layout.height || 1;
        const scaleX = rect.width / layout.width || 1;
        moveLevelDrag(price, orderDragCtx, {
          equity: orderDragCtx.equity,
          riskPercent: orderDragCtx.riskPercent,
          riskLocked: orderDragCtx.riskLocked,
          clientX: rect.left + x * scaleX,
          clientY: rect.top + y * scaleY,
          parent: orderDragCtx.container,
          bid: orderDragCtx.bid,
          ask: orderDragCtx.ask,
        });
        markOverlayDirty();
        return;
      }
      if (!drawingDrag) return;
      let logical = mediaToLogical(x, y);
      if (!logical) return;
      const current = drawings.find((dr) => dr.id === drawingDrag!.id);
      if (!current || current.locked) return;

      let nextPoints: DrawingPoint[];
      let nextMeta = current.meta;
      if (drawingDrag.mode === 'handle' && drawingDrag.handleIndex != null) {
        // Magnet on handles only (body move keeps shape rigid).
        let tip = magnetSnap(logical, bars, drawingMagnetMode);
        const hi = drawingDrag.handleIndex;
        if (
          isRectLikeTool(current.type) &&
          isRectEdgeHandle(hi) &&
          drawingDrag.originPoints.length >= 2
        ) {
          nextPoints = applyRectEdgeDrag(drawingDrag.originPoints, hi, tip);
        } else if (
          isChannelTool(current.type) &&
          isChannelWidthHandle(hi) &&
          drawingDrag.originPoints.length >= 3
        ) {
          nextPoints = applyChannelWidthDrag(
            drawingDrag.originPoints,
            x,
            y,
            bars,
            range,
            layout.plot,
            resolvePriceScale(),
            current.type === 'flatTopBottom',
          );
        } else {
          // Constrain vs the other anchor (not always point 0).
          const otherIdx = hi === 0 ? 1 : 0;
          const other = drawingDrag.originPoints[otherIdx];
          if (drawingShiftHeld && other) {
            tip = applyShiftConstrainIfNeeded(
              current.type,
              [other],
              tip,
              bars,
              true,
            );
          }
          nextPoints = drawingDrag.originPoints.map((p, i) =>
            i === hi ? { time: tip.time, price: tip.price } : { ...p },
          );
        }
        if (current.type === 'longPosition' || current.type === 'shortPosition') {
          nextMeta = syncRiskRewardMeta(current.type, nextPoints, current.meta);
        }
      } else {
        const dt = logical.time - drawingDrag.anchorTime;
        const dp = logical.price - drawingDrag.anchorPrice;
        nextPoints = drawingDrag.originPoints.map((p) => ({
          time: p.time + dt,
          price: p.price + dp,
        }));
      }

      // Mid-drag: update engine only (overlay dirty). Persist on pointer-up.
      drawings = drawings.map((dr) =>
        dr.id === drawingDrag!.id
          ? { ...dr, points: nextPoints, meta: nextMeta }
          : dr,
      );
      markDirty();
    },
    endDrawingDrag: () => {
      if (orderLevelDragging) {
        const result = endLevelDrag();
        orderLevelDragging = false;
        if (result) {
          const cancelled = result.invalidReason != null;
          const payload = {
            orderId: result.orderId,
            kind: result.kind,
            price: cancelled ? result.originPrice : result.price,
            cancelled,
          };
          for (const cb of orderLevelCommitListeners) cb(payload);
        }
        markOverlayDirty();
        return;
      }
      if (drawingDrag) {
        const id = drawingDrag.id;
        drawingDrag = null;
        emitDrawingsChange(drawings);
        // Ensure React selection stays on the edited drawing
        for (const cb of drawingSelectListeners) cb(id);
      } else {
        drawingDrag = null;
      }
    },
  });

  const instance: ChartInstance = {
    canvas,

    setViewportBars(nextBars: readonly ChartBar[]) {
      if (nextBars.length > MAX_BARS_IN_MEMORY) {
        console.warn(
          `setViewportBars: ${nextBars.length} exceeds MAX_BARS_IN_MEMORY (${MAX_BARS_IN_MEMORY}); truncating`,
        );
        bars = nextBars.slice(0, MAX_BARS_IN_MEMORY) as ChartBar[];
      } else {
        bars = nextBars.slice() as ChartBar[];
      }

      if (bars.length === 0) {
        range = { fromIndex: 0, toIndex: 1 };
      } else if (range.toIndex <= range.fromIndex) {
        // Keep TV-style pads (fromIndex < 0 or toIndex > bars.length) — do not snap left
        range = rangeCenteredOnIndex(Math.max(0, bars.length - 1), DEFAULT_VISIBLE_BARS);
      }
      // Do not auto-recenter here — React applies the preserved range after TF/buffer swaps.
      // Replay follow recenters via setReplayCursorTime / setReplayFollow instead.
      invalidateScaleCache();
      invalidateHitCache();
      updateCrosshairFromHover();
      markSceneDirty();
    },

    getBars() {
      return bars;
    },

    setVisibleRange(fromIndex: number, toIndex: number, opts) {
      if (toIndex <= fromIndex) return;
      // silent: React/replay applying a controlled range — do not echo into sync
      setVisibleRangeInternal({ fromIndex, toIndex }, !opts?.silent);
    },

    getVisibleRange() {
      return range;
    },

    onVisibleRangeChange(cb: VisibleRangeListener) {
      rangeListeners.add(cb);
      return () => {
        rangeListeners.delete(cb);
      };
    },

    onCrosshairMove(cb: CrosshairListener) {
      crosshairListeners.add(cb);
      return () => {
        crosshairListeners.delete(cb);
      };
    },

    onPlotClick(cb: PlotClickListener) {
      plotClickListeners.add(cb);
      return () => {
        plotClickListeners.delete(cb);
      };
    },

    onUserGesture(cb: UserGestureListener) {
      userGestureListeners.add(cb);
      return () => {
        userGestureListeners.delete(cb);
      };
    },

    onContextMenu(cb: ContextMenuListener) {
      contextMenuListeners.add(cb);
      return () => {
        contextMenuListeners.delete(cb);
      };
    },

    setCrosshairLogical(logical: SyncCrosshair | null) {
      // Don't fight local hover on the chart the user is pointing at
      if (hoverX !== null && hoverY !== null) return;

      if (logical === null) {
        if (crosshair !== null) {
          crosshair = null;
          emitCrosshair(null);
          markOverlayDirty();
        }
        return;
      }

      const next = resolveCrosshairFromLogical(
        logical,
        options.crosshairMode,
        bars,
        range,
        layout.plot,
        resolvePriceScale(),
      );

      const changed =
        (crosshair === null) !== (next === null) ||
        (crosshair !== null &&
          next !== null &&
          (crosshair.barIndex !== next.barIndex ||
            crosshair.price !== next.price ||
            crosshair.x !== next.x ||
            crosshair.y !== next.y));

      if (changed) {
        crosshair = next;
        emitCrosshair(next);
        markOverlayDirty();
      }
    },

    setCrosshairMode(mode: CrosshairMode) {
      if (options.crosshairMode === mode) return;
      options = { ...options, crosshairMode: mode };
      updateCrosshairFromHover();
      markDirty();
    },

    getCrosshairMode() {
      return options.crosshairMode;
    },

    setSeriesType(type: SeriesType) {
      if (options.seriesType === type) return;
      options = { ...options, seriesType: type };
      markDirty();
    },

    getSeriesType() {
      return options.seriesType;
    },

    setIndicatorOverlays(overlays: readonly IndicatorOverlayResult[]) {
      indicatorOverlays = overlays;
      markSceneDirty();
    },

    setIndicatorPanes(panes: readonly IndicatorPaneResult[]) {
      const prevCount = indicatorPanes.length;
      indicatorPanes = panes;
      if (panes.length !== prevCount) {
        rebuildLayout();
        staticCanvas = null;
        staticCtx = null;
        drawingsCanvas = null;
        drawingsCtx = null;
      }
      updateCrosshairFromHover();
      markSceneDirty();
    },

    setOrders(orders: readonly ChartOrder[], selectedId = selectedOrderId) {
      chartOrders = orders;
      if (selectedId !== undefined) selectedOrderId = selectedId;
      markOverlayDirty();
    },

    hitTestOrdersAt(y: number) {
      return hitTestOrders(y, chartOrders, layout.plot, resolvePriceScale());
    },

    setOrderDragContext(ctx: OrderDragContext | null) {
      orderDragCtx = ctx;
    },

    onOrderLevelCommit(cb) {
      orderLevelCommitListeners.add(cb);
      return () => orderLevelCommitListeners.delete(cb);
    },

    setBacktestResult(result: BacktestResult | null) {
      backtestResult = result;
      markOverlayDirty();
    },

    hitTestBacktestAt(x: number, y: number) {
      return hitTestBacktestEvent(
        backtestResult,
        bars,
        range,
        layout.plot,
        resolvePriceScale(),
        x,
        y,
        replayCursorTime,
      );
    },

    setShowVolume(show: boolean) {
      if (options.showVolume === show) return;
      options = { ...options, showVolume: show };
      rebuildLayout();
      updateCrosshairFromHover();
      markDirty();
    },

    setShowBrandWatermark(show: boolean) {
      if (options.showBrandWatermark === show) return;
      options = { ...options, showBrandWatermark: show };
      markDirty();
    },

    setVolumeOpacity(opacity: number) {
      const next = Math.min(1, Math.max(0.05, opacity));
      if (options.volumeOpacity === next) return;
      options = { ...options, volumeOpacity: next };
      markDirty();
    },

    getVolumeSettings() {
      return { visible: options.showVolume, opacity: options.volumeOpacity };
    },

    setShowLastPrice(show: boolean) {
      if (options.showLastPrice === show) return;
      options = { ...options, showLastPrice: show };
      markDirty();
    },

    setSize(nextWidth: number, nextHeight: number) {
      if (nextWidth <= 0 || nextHeight <= 0) return;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      applyCssSize();
    },

    resetPriceScale,
    resetTimeScale,
    resetView,
    zoomTime,
    panTime,
    followRealtime,

    setDrawings(next, draft = null, opts) {
      // Don't clobber in-flight drag geometry with a stale React snapshot.
      if (drawingDrag) {
        const live = drawings.find((d) => d.id === drawingDrag!.id);
        drawings = next.map((d) =>
          live && d.id === live.id
            ? { ...d, points: live.points, meta: live.meta }
            : d,
        );
      } else {
        drawings = next;
      }
      // Placement owns rubber-band draft; React draft only when not placing
      if (!placement) draftDrawing = draft;
      if (opts?.selectedId !== undefined) selectedDrawingId = opts.selectedId;
      if (opts?.hidden !== undefined) {
        drawingsHidden = opts.hidden;
        if (drawingsHidden) hoveredDrawingId = null;
      }
      if (opts?.paneTimeframe !== undefined) {
        paneTimeframe = opts.paneTimeframe;
      }
      if (hoveredDrawingId && !next.some((d) => d.id === hoveredDrawingId)) {
        hoveredDrawingId = null;
      }
      invalidateHitCache();
      markDrawingsDirty();
    },

    setDrawingMagnetMode(mode) {
      if (drawingMagnetMode === mode) return;
      drawingMagnetMode = mode;
      if (placement) {
        updatePlacementDraft(
          crosshair ? { time: crosshair.time, price: crosshair.price } : null,
        );
      }
    },

    setDrawingShiftHeld(held) {
      if (drawingShiftHeld === held) return;
      drawingShiftHeld = held;
      if (placement) {
        updatePlacementDraft(
          crosshair ? { time: crosshair.time, price: crosshair.price } : null,
        );
      }
    },

    setPlacement(next) {
      placement = next;
      if (!next) {
        draftDrawing = null;
        markOverlayDirty();
        return;
      }
      updatePlacementDraft(
        crosshair ? { time: crosshair.time, price: crosshair.price } : null,
      );
    },

    setReplayCursorTime(time) {
      if (replayCursorTime === time) return;
      const prevTip =
        replayFollow && replayCursorTime != null && bars.length > 0
          ? indexAtOrBeforeBars(bars, replayCursorTime)
          : -1;
      replayCursorTime = time;
      // Only shift the camera when the tip bar index changes — same-bucket
      // patches must not re-snap the range (grid labels jumped on Play/Pause).
      if (replayFollow && time != null) {
        const tip = indexAtOrBeforeBars(bars, time);
        if (tip !== prevTip) centerOnReplayCursor(false);
      }
      markDirty();
    },

    patchFormingBar(forming) {
      if (destroyed) return;
      const last = bars[bars.length - 1];
      if (last && last.time === forming.time) {
        last.open = forming.open;
        last.high = forming.high;
        last.low = forming.low;
        last.close = forming.close;
        last.volume = forming.volume;
      } else if (!last || last.time < forming.time) {
        bars.push({
          time: forming.time,
          open: forming.open,
          high: forming.high,
          low: forming.low,
          close: forming.close,
          volume: forming.volume,
        });
      } else {
        return;
      }
      invalidateScaleCache();
      markSceneDirty();
    },

    syncReplayReveal(nextBars, cursorTime) {
      if (destroyed) return;
      const nextLen = nextBars.length;
      const prevLen = bars.length;
      const prevTip =
        replayCursorTime != null && prevLen > 0
          ? indexAtOrBeforeBars(bars, replayCursorTime)
          : -1;
      // Tip *time* — index alone is wrong when the warm-cache slides under a
      // fixed-length buffer (tip stays at length-1 while content advances).
      const prevTipTime =
        prevTip >= 0 && prevTip < prevLen ? bars[prevTip]!.time : null;
      // Capture wall-clock window before buffer replace (sliding warm-cache).
      const keepTime =
        prevLen > 0 ? timeRangeFromVisible(bars, range) : null;

      // Grow/patch when the visible prefix is unchanged; otherwise full replace.
      const canAppend =
        prevLen > 0 &&
        nextLen >= prevLen &&
        bars[0]!.time === nextBars[0]!.time &&
        bars[prevLen - 1]!.time === nextBars[prevLen - 1]!.time;

      if (prevLen === 0 || nextLen < prevLen || !canAppend) {
        bars =
          nextLen > MAX_BARS_IN_MEMORY
            ? (nextBars.slice(0, MAX_BARS_IN_MEMORY) as ChartBar[])
            : (nextBars.slice() as ChartBar[]);
      } else {
        const srcTip = nextBars[prevLen - 1]!;
        const dstTip = bars[prevLen - 1]!;
        dstTip.open = srcTip.open;
        dstTip.high = srcTip.high;
        dstTip.low = srcTip.low;
        dstTip.close = srcTip.close;
        dstTip.volume = srcTip.volume;
        for (let i = prevLen; i < nextLen; i++) {
          const b = nextBars[i]!;
          bars.push({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
          });
        }
      }

      replayCursorTime = cursorTime;

      // Keep indicator buffers length-aligned so paint never blanks the series.
      if (indicatorOverlays.length > 0) {
        indicatorOverlays = alignIndicatorOverlays(indicatorOverlays, bars.length);
      }
      if (indicatorPanes.length > 0) {
        indicatorPanes = alignIndicatorPanes(indicatorPanes, bars.length);
      }

      const didReplace = prevLen === 0 || nextLen < prevLen || !canAppend;
      if (replayFollow) {
        const tip =
          cursorTime != null && bars.length > 0
            ? indexAtOrBeforeBars(bars, cursorTime)
            : -1;
        const tipTime = tip >= 0 && tip < bars.length ? bars[tip]!.time : null;
        const tipMoved =
          tip !== prevTip ||
          (tipTime != null && prevTipTime != null && tipTime !== prevTipTime);
        if (tipMoved) {
          // Tip advanced (by index *or* time under a sliding buffer).
          centerOnReplayCursor(false);
        } else if (didReplace && keepTime && bars.length > 0) {
          // Warm-cache slide without tip move: remap by wall-clock so left
          // history doesn't flash empty.
          const mapped = visibleRangeFromTimeWindow(
            bars,
            keepTime.fromTime,
            keepTime.toTime,
          );
          if (mapped.toIndex > mapped.fromIndex) {
            setVisibleRangeInternal(mapped, false);
          } else {
            centerOnReplayCursor(false);
          }
        } else if (didReplace) {
          centerOnReplayCursor(false);
        }
      } else if (didReplace && keepTime && bars.length > 0) {
        // Step / seek / async cache fill while paused: keep the same wall-clock
        // window so a slid buffer cannot leave the index camera on empty pad.
        const mapped = visibleRangeFromTimeWindow(
          bars,
          keepTime.fromTime,
          keepTime.toTime,
        );
        if (mapped.toIndex > mapped.fromIndex) {
          setVisibleRangeInternal(mapped, false);
        }
      }
      invalidateScaleCache();
      invalidateHitCache();
      markSceneDirty();

      // Trailing tip recompute (Worker) — coalesced by the hook.
      if (
        (indicatorOverlays.length > 0 || indicatorPanes.length > 0) &&
        indicatorRevealCb
      ) {
        indicatorRevealCb(bars);
      }
    },

    onIndicatorReveal(cb) {
      indicatorRevealCb = cb;
    },

    getIndicatorOverlays() {
      return indicatorOverlays;
    },

    getIndicatorPanes() {
      return indicatorPanes;
    },

    setReplayFollow(follow) {
      if (replayFollow === follow) return;
      replayFollow = follow;
      // Enabling follow must not hard-snap if we are already right-anchored —
      // that was shifting vertical grid / time labels on every Play press.
      if (follow && replayCursorTime != null && bars.length > 0) {
        const tip = indexAtOrBeforeBars(bars, replayCursorTime);
        const target = rangeRightAnchored(tip, currentSpan());
        const drift = Math.max(
          Math.abs(range.fromIndex - target.fromIndex),
          Math.abs(range.toIndex - target.toIndex),
        );
        if (drift > 0.51) {
          centerOnReplayCursor(false);
        }
      }
      markDirty();
    },

    hitTestDrawingsAt(x, y) {
      return hitTestDrawings(
        x,
        y,
        drawings,
        bars,
        range,
        layout.plot,
        resolvePriceScale(),
        paneTimeframe,
      );
    },

    setDrawingInteractEnabled(enabled) {
      drawingInteractEnabled = enabled;
      if (!enabled) drawingDrag = null;
    },

    setFreehandStrokeEnabled(enabled) {
      freehandStrokeEnabled = enabled;
    },

    setMarqueeZoomEnabled(enabled) {
      marqueeZoomEnabled = enabled;
      if (!enabled && marquee) {
        marquee = null;
        markOverlayDirty();
      }
    },

    onDrawingsChange(cb) {
      drawingsChangeListeners.add(cb);
      return () => {
        drawingsChangeListeners.delete(cb);
      };
    },

    onDrawingSelect(cb) {
      drawingSelectListeners.add(cb);
      return () => {
        drawingSelectListeners.delete(cb);
      };
    },

    onFreehandStroke(cb) {
      freehandStrokeListeners.add(cb);
      return () => {
        freehandStrokeListeners.delete(cb);
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      themeObserver?.disconnect();
      themeObserver = null;
      unsubAppearance?.();
      unsubAppearance = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        ledgerRelease('rafLoops');
      }
      interaction?.dispose();
      interaction = null;
      window.removeEventListener('keydown', onKeyDown);
      rangeListeners.clear();
      crosshairListeners.clear();
      plotClickListeners.clear();
      userGestureListeners.clear();
      contextMenuListeners.clear();
      drawingsChangeListeners.clear();
      drawingSelectListeners.clear();
      freehandStrokeListeners.clear();
      orderLevelCommitListeners.clear();
      drawingDrag = null;
      freehandStrokeEnabled = false;
      marqueeZoomEnabled = false;
      marquee = null;
      orderLevelDragging = false;
      cancelLevelDrag();
      bars = [];
      if (staticCanvas) {
        staticCanvas.width = 0;
        staticCanvas.height = 0;
      }
      if (drawingsCanvas) {
        drawingsCanvas.width = 0;
        drawingsCanvas.height = 0;
      }
      staticCanvas = null;
      staticCtx = null;
      drawingsCanvas = null;
      drawingsCtx = null;
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
      ledgerRelease('charts');
    },
  };

  // Repaint when dark/light class toggles so canvas tokens refresh
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => markDirty());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && orderLevelDragging) {
      cancelLevelDrag();
      orderLevelDragging = false;
      markOverlayDirty();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  unsubAppearance = subscribeAppearance((a) => {
    if (options.showLastPrice !== a.showLastPrice) {
      options = { ...options, showLastPrice: a.showLastPrice };
    }
    rebuildLayout();
    staticCanvas = null;
    staticCtx = null;
    drawingsCanvas = null;
    drawingsCtx = null;
    updateCrosshairFromHover();
    markDirty();
  });

  return instance;
}

export function destroyChart(instance: ChartInstance): void {
  instance.destroy();
}

export function setChartSize(instance: ChartInstance, width: number, height: number): void {
  instance.setSize(width, height);
}

export function setViewportData(instance: ChartInstance, bars: readonly ChartBar[]): void {
  instance.setViewportBars(bars);
}

/** Deterministic PRNG so multi-chart panes share identical series. */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate fake OHLCV bars for Phase 1 smoke test (seeded = stable across panes). */
export function generateFakeBars(
  count: number,
  startTime = 1704067200,
  seed = 42,
): ChartBar[] {
  const rand = mulberry32(seed);
  const bars: ChartBar[] = [];
  let price = 1.1;
  for (let i = 0; i < count; i++) {
    const open = price;
    const delta = (rand() - 0.48) * 0.002;
    const close = open + delta;
    const high = Math.max(open, close) + rand() * 0.001;
    const low = Math.min(open, close) - rand() * 0.001;
    bars.push({
      time: startTime + i * 60,
      open,
      high,
      low,
      close,
      volume: Math.floor(800 + rand() * 4000),
    });
    price = close;
  }
  return bars;
}
