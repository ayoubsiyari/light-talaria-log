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
import {
  timeRangeFromVisible,
  visibleRangeFromTimeWindow,
} from '@/data/timeframeAgg';
import { ledgerAcquire, ledgerRelease } from '@/dev/resourceLedger';
import type { Drawing, DrawingPoint } from '@/drawings/drawingStore';
import type { HitResult } from '@/drawings/hitTest';
import type { MagnetMode } from '@/drawings/magnet';
import type { Timeframe } from '@/types/ui';
import { getIndicatorDef } from '@/indicators/registry';
import { computeIndicators } from '@/indicators/runIndicatorWorker';
import { colorsForIndicator } from '@/indicators/themeColors';
import {
  INDICATOR_TIP_EVERY_BARS,
  INDICATOR_TIP_MIN_MS,
  needsFullIndicatorRecompute,
  stitchTipOverlays,
  stitchTipPanes,
  tipWindowBars,
} from '@/indicators/tipSync';
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
  /** Primary pane only — “Talaria Log” bottom-left brand. */
  showBrandWatermark?: boolean;
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
  /** Pane TF for per-interval drawing visibility. */
  paneTimeframe?: Timeframe;
  /** Drawing magnet (place + handle drag). */
  drawingMagnetMode?: MagnetMode;
  /** Shift held for H/V/45° constrain. */
  drawingShiftHeld?: boolean;
  replayCursorTime?: number | null;
  /** When true, engine recenters on the live candle each cursor tick. */
  replayFollow?: boolean;
  /** Cursor or drawing tool — clicks always reported. */
  drawingToolActive?: boolean;
  /** Brush / highlighter — press-drag stroke instead of pan. */
  freehandStrokeEnabled?: boolean;
  /** Zoom tool — press-drag marquee region zoom. */
  marqueeZoomEnabled?: boolean;
  /** Global drawings lock — disables move/resize interact. */
  drawingsLocked?: boolean;
  onChartPoint?: (point: CrosshairPoint, hit: HitResult | null) => void;
  /** Strategy mark explainability (click diamond / triangle). */
  onBacktestEventSelect?: (event: import('@/types/backtest').BacktestEvent | null) => void;
  /** User dragged the plot/axes — detach replay camera follow. */
  onUserGesture?: () => void;
  /** Engine moved/resized a drawing — persist in React. */
  onDrawingsChange?: (drawings: readonly Drawing[]) => void;
  /** Engine started interacting with a drawing (select it). */
  onDrawingSelect?: (drawingId: string) => void;
  /** Brush / highlighter press-drag phases. */
  onFreehandStroke?: (
    phase: 'start' | 'move' | 'end',
    point: DrawingPoint | null,
  ) => void;
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
  /** Track follow edge so Pause can keep the same wall-clock window. */
  const prevReplayFollowRef = useRef<boolean | undefined>(undefined);

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
    if (optionsRef.current.showBrandWatermark !== undefined) {
      instance.setShowBrandWatermark(optionsRef.current.showBrandWatermark);
    }
    if (optionsRef.current.volumeOpacity !== undefined) {
      instance.setVolumeOpacity(optionsRef.current.volumeOpacity);
    }
    if (optionsRef.current.drawings) {
      instance.setDrawings(optionsRef.current.drawings, null, {
        selectedId: optionsRef.current.selectedDrawingId ?? null,
        hidden: optionsRef.current.drawingsHidden ?? false,
        paneTimeframe: optionsRef.current.paneTimeframe ?? null,
      });
    }
    if (optionsRef.current.drawingMagnetMode) {
      instance.setDrawingMagnetMode(optionsRef.current.drawingMagnetMode);
    }
    if (optionsRef.current.drawingShiftHeld !== undefined) {
      instance.setDrawingShiftHeld(optionsRef.current.drawingShiftHeld);
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
    instance.setFreehandStrokeEnabled(optionsRef.current.freehandStrokeEnabled === true);
    instance.setMarqueeZoomEnabled(optionsRef.current.marqueeZoomEnabled === true);

    const unsubMove = instance.onCrosshairMove((point) => {
      optionsRef.current.onCrosshairMove?.(point);
    });

    const unsubClick = instance.onPlotClick((point) => {
      const orderHit = instance.hitTestOrdersAt(point.y);
      if (orderHit) {
        optionsRef.current.onOrderSelect?.(orderHit);
      }
      const btHit = instance.hitTestBacktestAt(point.x, point.y);
      if (btHit) {
        optionsRef.current.onBacktestEventSelect?.(btHit);
      } else {
        optionsRef.current.onBacktestEventSelect?.(null);
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

    const unsubFreehand = instance.onFreehandStroke((phase, point) => {
      optionsRef.current.onFreehandStroke?.(phase, point);
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
      unsubFreehand();
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
    if (!instance || options.showBrandWatermark === undefined) return;
    instance.setShowBrandWatermark(options.showBrandWatermark);
  }, [options.showBrandWatermark]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || options.volumeOpacity === undefined) return;
    instance.setVolumeOpacity(options.volumeOpacity);
  }, [options.volumeOpacity]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

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
      };
    });
    const lineWidthByKey = new Map(
      (options.enabledIndicators ?? []).map((e) => [e.id, e.lineWidth ?? 1.5] as const),
    );

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

    if (instances.length === 0) {
      instance.onIndicatorReveal(null);
      instance.setIndicatorOverlays([]);
      instance.setIndicatorPanes([]);
      return;
    }

    let cancelled = false;
    let lastFullBars: readonly ChartBar[] | null = null;
    let tipTimer: ReturnType<typeof setTimeout> | null = null;
    let tipInFlight = false;
    let tipPending: readonly ChartBar[] | null = null;
    /** Last bar count when tip Worker actually ran — gates replay isolation. */
    let lastTipAtLen = 0;
    let lastTipAtMs = 0;

    const runFull = (bars: readonly ChartBar[]) => {
      if (bars.length === 0) {
        instance.setIndicatorOverlays([]);
        instance.setIndicatorPanes([]);
        lastFullBars = bars;
        lastTipAtLen = bars.length;
        return;
      }
      void computeIndicators(bars, instances)
        .then(({ overlays, panes }) => {
          if (cancelled) return;
          lastFullBars = bars;
          lastTipAtLen = bars.length;
          lastTipAtMs = performance.now();
          instance.setIndicatorOverlays(withWidth(overlays));
          instance.setIndicatorPanes(withWidth(panes));
        })
        .catch(() => {
          if (cancelled) return;
          // Keep previous series — don't blank on transient Worker errors.
        });
    };

    const drainTip = () => {
      if (cancelled || tipInFlight) return;
      const pending = tipPending;
      if (!pending || pending.length === 0) return;

      if (needsFullIndicatorRecompute(lastFullBars, pending)) {
        tipPending = null;
        runFull(pending);
        return;
      }

      // Replay isolation: skip Worker until enough new bars OR min interval.
      // Buffers already length-aligned (hold tip) so candles never wait.
      const now = performance.now();
      const barsSince = pending.length - lastTipAtLen;
      const msSince = now - lastTipAtMs;
      if (
        optionsRef.current.replayFollow &&
        barsSince < INDICATOR_TIP_EVERY_BARS &&
        msSince < INDICATOR_TIP_MIN_MS
      ) {
        const wait = Math.max(0, INDICATOR_TIP_MIN_MS - msSince);
        if (tipTimer == null) {
          tipTimer = setTimeout(() => {
            tipTimer = null;
            drainTip();
          }, wait || INDICATOR_TIP_MIN_MS);
        }
        return;
      }

      tipPending = null;
      tipInFlight = true;
      const slice = tipWindowBars(pending);
      void computeIndicators(slice, instances)
        .then(({ overlays, panes }) => {
          if (cancelled) return;
          lastTipAtLen = pending.length;
          lastTipAtMs = performance.now();
          const nextOverlays = stitchTipOverlays(
            instance.getIndicatorOverlays(),
            withWidth(overlays),
            pending.length,
          );
          const nextPanes = stitchTipPanes(
            instance.getIndicatorPanes(),
            withWidth(panes),
            pending.length,
          );
          instance.setIndicatorOverlays(nextOverlays);
          instance.setIndicatorPanes(nextPanes);
        })
        .catch(() => {
          /* keep aligned hold-values */
        })
        .finally(() => {
          tipInFlight = false;
          if (tipPending) {
            tipTimer = setTimeout(() => {
              tipTimer = null;
              drainTip();
            }, 0);
          }
        });
    };

    const scheduleTip = (bars: readonly ChartBar[]) => {
      tipPending = bars;
      if (tipTimer != null || tipInFlight) return;
      // Coalesce; actual Worker gated by INDICATOR_TIP_EVERY_BARS / MIN_MS.
      tipTimer = setTimeout(() => {
        tipTimer = null;
        drainTip();
      }, INDICATOR_TIP_MIN_MS);
    };

    instance.onIndicatorReveal((bars) => {
      if (cancelled) return;
      // Always keep latest bars for a catch-up tip; never block replay path.
      scheduleTip(bars);
    });

    // Pause / seek / load: full window. Play: hold-extend + sparse tip Worker.
    if (!options.replayFollow) {
      runFull(options.bars ?? EMPTY_BARS);
    } else if (instance.getIndicatorOverlays().length === 0) {
      runFull(options.bars ?? EMPTY_BARS);
    }

    return () => {
      cancelled = true;
      instance.onIndicatorReveal(null);
      if (tipTimer != null) clearTimeout(tipTimer);
    };
  }, [
    options.bars,
    options.replayFollow,
    JSON.stringify(options.enabledIndicators ?? []),
  ]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setDrawings(options.drawings ?? [], null, {
      selectedId: options.selectedDrawingId ?? null,
      hidden: options.drawingsHidden ?? false,
      paneTimeframe: options.paneTimeframe ?? null,
    });
  }, [
    options.drawings,
    options.selectedDrawingId,
    options.drawingsHidden,
    options.paneTimeframe,
  ]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setDrawingMagnetMode(options.drawingMagnetMode ?? 'off');
  }, [options.drawingMagnetMode]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setDrawingShiftHeld(options.drawingShiftHeld ?? false);
  }, [options.drawingShiftHeld]);

  const orderIds = ordersKey(options.orders);
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    // While playing, App pushes orders+P&L imperatively each bar — do not clobber
    // with a stale React snapshot (would drop open levels mid-replay).
    if (options.replayFollow) return;
    instance.setOrders(options.orders ?? [], options.selectedOrderId ?? null);
  }, [orderIds, options.orders, options.selectedOrderId, options.replayFollow]);

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

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setFreehandStrokeEnabled(options.freehandStrokeEnabled === true);
  }, [options.freehandStrokeEnabled]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.setMarqueeZoomEnabled(options.marqueeZoomEnabled === true);
  }, [options.marqueeZoomEnabled]);

  const rangeFrom = options.initialRange?.fromIndex;
  const rangeTo = options.initialRange?.toIndex;

  // Apply bars + visible range in one layout pass so TF switches don't flash/jump.
  useLayoutEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !options.bars) return;
    const wasFollowing = prevReplayFollowRef.current === true;
    prevReplayFollowRef.current = options.replayFollow;
    barsRef.current = options.bars;

    // While replay follow is active, App drives bars/camera via syncReplayReveal.
    // Applying React props here clobbers multi-pane engines mid-playback.
    if (options.replayFollow) {
      return;
    }

    // Pause edge: keep the same wall-clock window across bar-array rebuilds.
    // Re-applying derive's index range after a different bars[0] made time-grid
    // labels jump even when the tip candle looked roughly in place.
    const liveRange = instance.getVisibleRange();
    const liveBars = instance.getBars();
    const keepTime =
      wasFollowing && liveBars.length > 0
        ? timeRangeFromVisible(liveBars, liveRange)
        : null;

    setViewportData(instance, options.bars);

    if (keepTime && options.bars.length > 0) {
      const mapped = visibleRangeFromTimeWindow(
        options.bars,
        keepTime.fromTime,
        keepTime.toTime,
      );
      if (mapped.toIndex > mapped.fromIndex) {
        instance.setVisibleRange(mapped.fromIndex, mapped.toIndex, {
          silent: true,
        });
        return;
      }
    }

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
