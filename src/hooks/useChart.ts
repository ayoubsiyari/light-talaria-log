import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  attachChartSync,
  createChartInstance,
  destroyChart,
  getChartColors,
  registerChart,
  setChartSize,
  setViewportData,
  unregisterChart,
  type ChartInstance,
  type ChartSyncStore,
  type CrosshairListener,
  type CrosshairMode,
  type DrawingPlacement,
  type SeriesType,
} from '@/chart';
import { ledgerAcquire, ledgerRelease } from '@/dev/resourceLedger';
import type { Drawing } from '@/drawings/drawingStore';
import type { HitResult } from '@/drawings/hitTest';
import { getIndicatorDef } from '@/indicators/registry';
import { computeIndicators } from '@/indicators/runIndicatorWorker';
import { colorsForIndicator } from '@/indicators/themeColors';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { EnabledIndicator, IndicatorInstance } from '@/types/indicator';
import type { BacktestResult } from '@/types/backtest';
import type { ChartOrder } from '@/types/order';
import type { CrosshairPoint } from '@/chart';

export interface UseChartOptions {
  chartId?: string;
  syncStore?: ChartSyncStore | null;
  bars?: readonly ChartBar[];
  initialRange?: VisibleRange | null;
  onCrosshairMove?: CrosshairListener;
  crosshairMode?: CrosshairMode;
  seriesType?: SeriesType;
  showVolume?: boolean;
  volumeOpacity?: number;
  enabledIndicators?: readonly EnabledIndicator[];
  orders?: readonly ChartOrder[];
  selectedOrderId?: string | null;
  onOrderSelect?: (orderId: string | null) => void;
  /** Strategy backtest overlays (markers / equity). */
  backtestResult?: BacktestResult | null;
  drawings?: readonly Drawing[];
  /** @deprecated engine placement owns draft — kept for compatibility */
  draftDrawing?: Drawing | null;
  /** Active drawing placement (rubber-band / freehand) — engine paints overlay. */
  placement?: DrawingPlacement | null;
  selectedDrawingId?: string | null;
  drawingsHidden?: boolean;
  replayCursorTime?: number | null;
  /** When true, engine recenters on the live candle each cursor tick. */
  replayFollow?: boolean;
  /** Cursor or drawing tool — clicks always reported. */
  drawingToolActive?: boolean;
  /** Global drawings lock — disables move/resize interact. */
  drawingsLocked?: boolean;
  onChartPoint?: (point: CrosshairPoint, hit: HitResult | null) => void;
  /** User dragged the plot/axes — detach replay camera follow. */
  onUserGesture?: () => void;
  /** Engine moved/resized a drawing — persist in React. */
  onDrawingsChange?: (drawings: readonly Drawing[]) => void;
  /** Engine started interacting with a drawing (select it). */
  onDrawingSelect?: (drawingId: string) => void;
  /** Layout sync: mirror crosshair across panes. */
  syncCrosshair?: boolean;
  /** Layout sync: mirror visible time window across panes. */
  syncDateRange?: boolean;
}

function ordersKey(orders: readonly ChartOrder[] | undefined): string {
  if (!orders?.length) return '';
  return orders.map((o) => o.id).join(',');
}

const EMPTY_BARS: readonly ChartBar[] = [];

/**
 * Chart lives in refs — never in React state.
 * Sync uses wall-clock time so multi-TF panes stay aligned.
 * Empty bars = empty canvas (no fake OHLC masking load/error).
 */
export function useChart(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseChartOptions = {},
) {
  const instanceRef = useRef<ChartInstance | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const barsRef = useRef(options.bars ?? EMPTY_BARS);
  barsRef.current = options.bars ?? EMPTY_BARS;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instance = createChartInstance(el);
    instanceRef.current = instance;

    const bars = barsRef.current;
    setViewportData(instance, bars);
    const init = optionsRef.current.initialRange;
    if (init && init.toIndex > init.fromIndex) {
      instance.setVisibleRange(init.fromIndex, init.toIndex, { silent: true });
    } else {
      instance.resetTimeScale();
    }

    const store = optionsRef.current.syncStore;
    const chartId = optionsRef.current.chartId ?? 'chart';
    registerChart(chartId, instance);

    if (optionsRef.current.crosshairMode) {
      instance.setCrosshairMode(optionsRef.current.crosshairMode);
    }
    if (optionsRef.current.seriesType) {
      instance.setSeriesType(optionsRef.current.seriesType);
    }
    if (optionsRef.current.showVolume !== undefined) {
      instance.setShowVolume(optionsRef.current.showVolume);
    }
    if (optionsRef.current.volumeOpacity !== undefined) {
      instance.setVolumeOpacity(optionsRef.current.volumeOpacity);
    }
    if (optionsRef.current.drawings) {
      instance.setDrawings(optionsRef.current.drawings, null, {
        selectedId: optionsRef.current.selectedDrawingId ?? null,
        hidden: optionsRef.current.drawingsHidden ?? false,
      });
    }
    if (optionsRef.current.placement) {
      instance.setPlacement(optionsRef.current.placement);
    }
    if (typeof optionsRef.current.replayCursorTime === 'number') {
      instance.setReplayCursorTime(optionsRef.current.replayCursorTime);
    }
    if (optionsRef.current.replayFollow !== undefined) {
      instance.setReplayFollow(optionsRef.current.replayFollow);
    }

    const interactEnabled =
      !optionsRef.current.drawingToolActive && !optionsRef.current.drawingsLocked;
    instance.setDrawingInteractEnabled(interactEnabled);

    const unsubMove = instance.onCrosshairMove((point) => {
      optionsRef.current.onCrosshairMove?.(point);
    });

    const unsubClick = instance.onPlotClick((point) => {
      const orderHit = instance.hitTestOrdersAt(point.y);
      if (orderHit) {
        optionsRef.current.onOrderSelect?.(orderHit);
      }
      const hit = instance.hitTestDrawingsAt(point.x, point.y);
      optionsRef.current.onChartPoint?.(point, hit);
    });

    const unsubGesture = instance.onUserGesture(() => {
      optionsRef.current.onUserGesture?.();
    });

    const unsubDrawings = instance.onDrawingsChange((next) => {
      optionsRef.current.onDrawingsChange?.(next);
    });

    const unsubSelect = instance.onDrawingSelect((id) => {
      optionsRef.current.onDrawingSelect?.(id);
    });

    // Always attach when store exists (including single pane) so user pan
    // can detach replay camera follow.
    const unsubSync =
      store != null
        ? attachChartSync(instance, chartId, store, {
            getBars: () => barsRef.current,
            getSyncCrosshair: () => optionsRef.current.syncCrosshair !== false,
            getSyncDateRange: () => optionsRef.current.syncDateRange !== false,
          })
        : () => {};

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setChartSize(instance, entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    ledgerAcquire('observers');

    return () => {
      unsubMove();
      unsubClick();
      unsubGesture();
      unsubDrawings();
      unsubSelect();
      unsubSync();
      ro.disconnect();
      ledgerRelease('observers');
      unregisterChart(chartId, instance);
      destroyChart(instance);
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !options.crosshairMode) return;
    instance.setCrosshairMode(options.crosshairMode);
  }, [options.crosshairMode]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !options.seriesType) return;
    instance.setSeriesType(options.seriesType);
  }, [options.seriesType]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || options.showVolume === undefined) return;
    instance.setShowVolume(options.showVolume);
  }, [options.showVolume]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || options.volumeOpacity === undefined) return;
    instance.setVolumeOpacity(options.volumeOpacity);
  }, [options.volumeOpacity]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    const bars = options.bars ?? EMPTY_BARS;
    const theme = getChartColors();
    const enabled = (options.enabledIndicators ?? []).filter((e) => e.visible !== false);
    const instances: IndicatorInstance[] = enabled.map((e) => {
      const def = getIndicatorDef(e.id);
      const themeColors = colorsForIndicator(e.id, theme);
      const colors = e.colors?.length
        ? Array.from({ length: def.seriesCount }, (_, i) => e.colors![i] ?? themeColors[i] ?? themeColors[0]!)
        : themeColors;
      return {
        key: e.id,
        id: e.id,
        params: { ...def.defaultParams, ...e.params },
        visible: true,
        colors,
        // stash lineWidth on params for worker-agnostic paint via instance key map
      };
    });
    // lineWidth applied after compute on main thread
    const lineWidthByKey = new Map(
      (options.enabledIndicators ?? []).map((e) => [e.id, e.lineWidth ?? 1.5] as const),
    );

    if (instances.length === 0) {
      instance.setIndicatorOverlays([]);
      instance.setIndicatorPanes([]);
      return;
    }

    let cancelled = false;
    void computeIndicators(bars, instances)
      .then(({ overlays, panes }) => {
        if (cancelled) return;
        const withWidth = <T extends { instanceKey: string; series: { lineWidth?: number }[] }>(
          items: T[],
        ): T[] =>
          items.map((item) => {
            const w = lineWidthByKey.get(item.instanceKey as IndicatorInstance['id']) ?? 1.5;
            return {
              ...item,
              series: item.series.map((s) => ({ ...s, lineWidth: w })),
            };
          });
        instance.setIndicatorOverlays(withWidth(overlays));
        instance.setIndicatorPanes(withWidth(panes));
      })
      .catch(() => {
        if (cancelled) return;
        instance.setIndicatorOverlays([]);
        instance.setIndicatorPanes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [options.bars, JSON.stringify(options.enabledIndicators ?? [])]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setDrawings(options.drawings ?? [], null, {
      selectedId: options.selectedDrawingId ?? null,
      hidden: options.drawingsHidden ?? false,
    });
  }, [options.drawings, options.selectedDrawingId, options.drawingsHidden]);

  const orderIds = ordersKey(options.orders);
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setOrders(options.orders ?? [], options.selectedOrderId ?? null);
  }, [orderIds, options.orders, options.selectedOrderId]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setBacktestResult(options.backtestResult ?? null);
  }, [options.backtestResult]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setPlacement(options.placement ?? null);
  }, [options.placement]);

  useEffect(() => {
    const instance = instanceRef.current;
    // null/undefined = App owns cursor imperatively (playback) — do not clear.
    if (!instance || typeof options.replayCursorTime !== 'number') return;
    instance.setReplayCursorTime(options.replayCursorTime);
  }, [options.replayCursorTime]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || options.replayFollow === undefined) return;
    instance.setReplayFollow(options.replayFollow);
  }, [options.replayFollow]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setDrawingInteractEnabled(
      !options.drawingToolActive && !options.drawingsLocked,
    );
  }, [options.drawingToolActive, options.drawingsLocked]);

  const rangeFrom = options.initialRange?.fromIndex;
  const rangeTo = options.initialRange?.toIndex;

  // Apply bars + visible range in one layout pass so TF switches don't flash/jump.
  useLayoutEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !options.bars) return;
    barsRef.current = options.bars;

    // While replay follow is active, App drives bars/camera via syncReplayReveal.
    // Applying React props here clobbers multi-pane engines mid-playback.
    if (options.replayFollow) {
      return;
    }

    setViewportData(instance, options.bars);

    // Explicit React range wins over setViewportBars side-effects (e.g. replay follow).
    if (rangeFrom == null || rangeTo == null || rangeTo <= rangeFrom) return;
    const cur = instance.getVisibleRange();
    if (
      Math.abs(cur.fromIndex - rangeFrom) < 1e-4 &&
      Math.abs(cur.toIndex - rangeTo) < 1e-4
    ) {
      return;
    }
    instance.setVisibleRange(rangeFrom, rangeTo, { silent: true });
  }, [options.bars, rangeFrom, rangeTo, options.replayFollow]);

  return instanceRef;
}
