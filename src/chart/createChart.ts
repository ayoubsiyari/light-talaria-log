import { indexAtOrBeforeBars } from '@/data/timeframeAgg';
import {
  createDraftDrawing,
  type Drawing,
  type DrawingPoint,
} from '@/drawings/drawingStore';
import {
  cursorForDrawingHit,
  hitTestDrawings,
  type HitResult,
} from '@/drawings/hitTest';
import type { DrawingToolId } from '@/drawings/toolRegistry';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { IndicatorOverlayResult, IndicatorPaneResult } from '@/types/indicator';
import type { BacktestResult } from '@/types/backtest';
import type { ChartOrder } from '@/types/order';
import { markChartPaint } from '@/perf/perfMonitor';
import { hitTestOrders } from './overlays/drawOrders';
import { MAX_BARS_IN_MEMORY, VISIBLE_BARS_TARGET } from '@/utils/constants';
import { getChartColors } from './chartTheme';
import { resolveCrosshair, resolveCrosshairFromLogical } from './crosshair';
import {
  attachInteraction,
  DEFAULT_VISIBLE_BARS,
  type InteractionHandle,
} from './interaction';
import { rangeCenteredOnIndex } from './rangeAnchor';
import {
  contentBottom,
  createLayout,
  paintBaseFrame,
  paintDrawingsFrame,
  paintOverlayFrame,
  type RenderLayout,
} from './renderer';
import { yToPaneValue } from './series/drawIndicatorPane';
import { computePriceScale, type PriceScale } from './scales';
import type { SyncCrosshair } from './sync/chartSyncStore';
import type {
  ChartViewOptions,
  CrosshairListener,
  CrosshairMode,
  CrosshairPoint,
  SeriesType,
} from './types';

export interface DrawingPlacement {
  tool: DrawingToolId;
  points: DrawingPoint[];
  /** Freehand stroke is accumulating points on pointer move. */
  freehandActive?: boolean;
}

export type VisibleRangeListener = (range: VisibleRange) => void;
export type PlotClickListener = (point: CrosshairPoint) => void;
export type UserGestureListener = () => void;
export type DrawingsChangeListener = (drawings: readonly Drawing[]) => void;
export type DrawingSelectListener = (drawingId: string) => void;

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
  setVisibleRange: (fromIndex: number, toIndex: number, opts?: { silent?: boolean }) => void;
  getVisibleRange: () => VisibleRange;
  onVisibleRangeChange: (cb: VisibleRangeListener) => () => void;
  onCrosshairMove: (cb: CrosshairListener) => () => void;
  onPlotClick: (cb: PlotClickListener) => () => void;
  onUserGesture: (cb: UserGestureListener) => () => void;
  /** Multi-chart: apply logical crosshair (local x/y recomputed). */
  setCrosshairLogical: (logical: SyncCrosshair | null) => void;
  setCrosshairMode: (mode: CrosshairMode) => void;
  getCrosshairMode: () => CrosshairMode;
  setSeriesType: (type: SeriesType) => void;
  getSeriesType: () => SeriesType;
  setShowVolume: (show: boolean) => void;
  setVolumeOpacity: (opacity: number) => void;
  getVolumeSettings: () => { visible: boolean; opacity: number };
  /** Viewport-sized price overlays (Worker-computed). */
  setIndicatorOverlays: (overlays: readonly IndicatorOverlayResult[]) => void;
  /** Oscillator panes (RSI/MACD) — rebuilds layout stack. */
  setIndicatorPanes: (panes: readonly IndicatorPaneResult[]) => void;
  /** Mock session orders (entry / SL / TP lines). */
  setOrders: (orders: readonly ChartOrder[], selectedId?: string | null) => void;
  hitTestOrdersAt: (y: number) => string | null;
  /** Strategy backtest markers / equity overlay (results only). */
  setBacktestResult: (result: BacktestResult | null) => void;
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
    opts?: { selectedId?: string | null; hidden?: boolean },
  ) => void;
  /** In-progress tool placement — engine owns rubber-band draft (no React per-move). */
  setPlacement: (placement: DrawingPlacement | null) => void;
  setReplayCursorTime: (time: number | null) => void;
  /** When true, each cursor update recenters the live candle (until user pans). */
  setReplayFollow: (follow: boolean) => void;
  /** Hit-test drawings at media coords (plot space). */
  hitTestDrawingsAt: (x: number, y: number) => HitResult | null;
  /** When false, hover/drag on drawings is disabled (placing tool / global lock). */
  setDrawingInteractEnabled: (enabled: boolean) => void;
  onDrawingsChange: (cb: DrawingsChangeListener) => () => void;
  onDrawingSelect: (cb: DrawingSelectListener) => () => void;
  destroy: () => void;
}

const DEFAULT_OPTIONS: ChartViewOptions = {
  seriesType: 'candle',
  crosshairMode: 'normal',
  showVolume: false,
  showLastPrice: true,
  volumeOpacity: 0.4,
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
    throw new Error('Canvas 2D context unavailable');
  }

  let width = container.clientWidth || 800;
  let height = container.clientHeight || 500;
  let dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  let options: ChartViewOptions = { ...DEFAULT_OPTIONS };
  let indicatorOverlays: readonly IndicatorOverlayResult[] = [];
  let indicatorPanes: readonly IndicatorPaneResult[] = [];

  const rebuildLayout = () => {
    layout = createLayout(width, height, dpr, {
      showVolume: options.showVolume,
      indicatorPaneCount: indicatorPanes.length,
    });
  };

  let layout: RenderLayout = createLayout(width, height, dpr, {
    showVolume: options.showVolume,
    indicatorPaneCount: 0,
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
  let replayCursorTime: number | null = null;
  /** Engine-owned camera follow — avoids React re-applying a stale range after pan. */
  let replayFollow = false;
  /** Cursor/move/resize on drawings (off while placing a tool or when locked). */
  let drawingInteractEnabled = true;
  let drawingDrag: DrawingDragState | null = null;
  let chartOrders: readonly ChartOrder[] = [];
  let selectedOrderId: string | null = null;
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
  const drawingsChangeListeners = new Set<DrawingsChangeListener>();
  const drawingSelectListeners = new Set<DrawingSelectListener>();

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
    // Freehand: points already include the stroke (App/rAF). Else rubber-band to hover.
    const pts =
      placement.freehandActive || !hover
        ? placement.points
        : [...placement.points, hover];
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
    replayCursorTime,
    indicators: indicatorOverlays,
    indicatorPanes,
    orders: chartOrders,
    selectedOrderId,
    backtestResult,
  });

  const schedulePaint = () => {
    if (rafId !== null || destroyed) return;
    rafId = requestAnimationFrame((t) => {
      rafId = null;
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

  const centerOnReplayCursor = (emit: boolean) => {
    if (bars.length === 0 || replayCursorTime == null) return;
    const anchor = indexAtOrBeforeBars(bars, replayCursorTime);
    // Preserve current zoom level while following
    setVisibleRangeInternal(rangeCenteredOnIndex(anchor, currentSpan()), emit);
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

    let anchor = (range.fromIndex + range.toIndex) / 2;
    if (replayFollow && replayCursorTime != null) {
      anchor = indexAtOrBeforeBars(bars, replayCursorTime);
    }
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
        rangeCenteredOnIndex(bars.length - 1, currentSpan()),
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
    getDrawingCursor: (x, y) => {
      const hit = hitDrawingAt(x, y);
      if (!hit) return null;
      const d = drawings.find((dr) => dr.id === hit.drawingId);
      if (!d) return null;
      return cursorForDrawingHit(hit, d, bars, range, layout.plot, resolvePriceScale(), {
        dragging: drawingDrag?.id === d.id,
      });
    },
    getDrawingDragCursor: () => drawingDrag?.cursor ?? null,
    beginDrawingDrag: (x, y) => {
      const hit = hitDrawingAt(x, y);
      if (!hit) return false;
      const d = drawings.find((dr) => dr.id === hit.drawingId);
      if (!d || d.locked) return false;
      const logical = mediaToLogical(x, y);
      if (!logical) return false;
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
    moveDrawingDrag: (x, y) => {
      if (!drawingDrag) return;
      const logical = mediaToLogical(x, y);
      if (!logical) return;
      const current = drawings.find((dr) => dr.id === drawingDrag!.id);
      if (!current || current.locked) return;

      let nextPoints: DrawingPoint[];
      if (drawingDrag.mode === 'handle' && drawingDrag.handleIndex != null) {
        nextPoints = current.points.slice();
        nextPoints[drawingDrag.handleIndex] = {
          time: logical.time,
          price: logical.price,
        };
      } else {
        const dt = logical.time - drawingDrag.anchorTime;
        const dp = logical.price - drawingDrag.anchorPrice;
        nextPoints = drawingDrag.originPoints.map((p) => ({
          time: p.time + dt,
          price: p.price + dp,
        }));
      }

      emitDrawingsChange(
        drawings.map((dr) =>
          dr.id === drawingDrag!.id ? { ...dr, points: nextPoints } : dr,
        ),
      );
    },
    endDrawingDrag: () => {
      drawingDrag = null;
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

    setBacktestResult(result: BacktestResult | null) {
      backtestResult = result;
      markOverlayDirty();
    },

    setShowVolume(show: boolean) {
      if (options.showVolume === show) return;
      options = { ...options, showVolume: show };
      rebuildLayout();
      updateCrosshairFromHover();
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
      drawings = next;
      // Placement owns rubber-band draft; React draft only when not placing
      if (!placement) draftDrawing = draft;
      if (opts?.selectedId !== undefined) selectedDrawingId = opts.selectedId;
      if (opts?.hidden !== undefined) {
        drawingsHidden = opts.hidden;
        if (drawingsHidden) hoveredDrawingId = null;
      }
      if (hoveredDrawingId && !next.some((d) => d.id === hoveredDrawingId)) {
        hoveredDrawingId = null;
      }
      invalidateHitCache();
      markDrawingsDirty();
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
      replayCursorTime = time;
      if (replayFollow && time != null) {
        centerOnReplayCursor(false);
      }
      markDirty();
    },

    setReplayFollow(follow) {
      if (replayFollow === follow) return;
      replayFollow = follow;
      if (follow && replayCursorTime != null) {
        centerOnReplayCursor(false);
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
      );
    },

    setDrawingInteractEnabled(enabled) {
      drawingInteractEnabled = enabled;
      if (!enabled) drawingDrag = null;
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

    destroy() {
      destroyed = true;
      themeObserver?.disconnect();
      themeObserver = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      interaction?.dispose();
      interaction = null;
      rangeListeners.clear();
      crosshairListeners.clear();
      plotClickListeners.clear();
      userGestureListeners.clear();
      drawingsChangeListeners.clear();
      drawingSelectListeners.clear();
      drawingDrag = null;
      bars = [];
      staticCanvas = null;
      staticCtx = null;
      drawingsCanvas = null;
      drawingsCtx = null;
      canvas.remove();
    },
  };

  // Repaint when dark/light class toggles so canvas tokens refresh
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => markDirty());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
  }

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
