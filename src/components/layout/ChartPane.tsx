import { useCallback, useRef, useSyncExternalStore } from 'react';
import type {
  ChartSyncStore,
  CrosshairMode,
  CrosshairPoint,
  DrawingPlacement,
  SeriesType,
} from '@/chart';
import {
  formatPrice,
  getAppearance,
  subscribeAppearance,
} from '@/chart';
import { ChartContainer } from '@/components/ChartContainer';
import { LoadingDots } from '@/components/layout/LoadingDots';
import { OverlayIndicators } from '@/components/layout/OverlayIndicators';
import { VolumeIndicator } from '@/components/layout/VolumeIndicator';
import type { Drawing } from '@/drawings/drawingStore';
import type { HitResult } from '@/drawings/hitTest';
import type { MagnetMode } from '@/drawings/magnet';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { EnabledIndicator } from '@/types/indicator';
import type { BacktestResult } from '@/types/backtest';
import type { ChartOrder } from '@/types/order';
import type { Timeframe } from '@/types/ui';

export interface ChartPaneProps {
  chartId: string;
  syncStore: ChartSyncStore | null;
  bars: readonly ChartBar[];
  initialRange?: VisibleRange | null;
  symbol: string;
  timeframe: Timeframe;
  /** True while TF / ticker data is warming for this pane. */
  dataLoading?: boolean;
  selected: boolean;
  onSelect: () => void;
  crosshairMode: CrosshairMode;
  seriesType: SeriesType;
  showVolume: boolean;
  onShowVolumeChange: (v: boolean) => void;
  volumeOpacity: number;
  onVolumeOpacityChange: (v: number) => void;
  enabledIndicators: readonly EnabledIndicator[];
  onEnabledIndicatorsChange: (next: EnabledIndicator[]) => void;
  drawings: readonly Drawing[];
  placement?: DrawingPlacement | null;
  selectedDrawingId?: string | null;
  drawingsHidden?: boolean;
  drawingMagnetMode?: MagnetMode;
  drawingShiftHeld?: boolean;
  replayCursorTime: number | null;
  replayFollow?: boolean;
  /** Show » follow when user panned away during replay. */
  showFollowControl?: boolean;
  onReattachFollow?: () => void;
  drawingToolActive: boolean;
  drawingsLocked?: boolean;
  onChartPoint: (point: CrosshairPoint, hit: HitResult | null) => void;
  onCrosshairSample?: (point: CrosshairPoint | null) => void;
  onUserGesture?: () => void;
  onDrawingsChange?: (drawings: readonly Drawing[]) => void;
  onDrawingSelect?: (drawingId: string) => void;
  orders?: readonly ChartOrder[];
  selectedOrderId?: string | null;
  onOrderSelect?: (orderId: string | null) => void;
  backtestResult?: BacktestResult | null;
  syncCrosshair?: boolean;
  syncDateRange?: boolean;
  /** Accent border only when multiple panes (selection). */
  showSelectionBorder?: boolean;
  /** Draw “Talaria Log” brand — only the primary (first) pane. */
  showBrandWatermark?: boolean;
}

function formatOhlc(point: CrosshairPoint | null): string {
  const bar = point?.bar;
  if (!bar) return 'O —  H —  L —  C —';
  return `O ${formatPrice(bar.open)}  H ${formatPrice(bar.high)}  L ${formatPrice(bar.low)}  C ${formatPrice(bar.close)}`;
}

/** One synced chart pane — legend is read-only; pair/TF change via TopBar (active pane). */
export function ChartPane({
  chartId,
  syncStore,
  bars,
  initialRange = null,
  symbol,
  timeframe,
  dataLoading = false,
  selected,
  onSelect,
  crosshairMode,
  seriesType,
  showVolume,
  onShowVolumeChange,
  volumeOpacity,
  onVolumeOpacityChange,
  enabledIndicators,
  onEnabledIndicatorsChange,
  drawings,
  placement = null,
  selectedDrawingId = null,
  drawingsHidden = false,
  drawingMagnetMode = 'off',
  drawingShiftHeld = false,
  replayCursorTime,
  replayFollow = false,
  showFollowControl = false,
  onReattachFollow,
  drawingToolActive,
  drawingsLocked = false,
  onChartPoint,
  onCrosshairSample,
  onUserGesture,
  onDrawingsChange,
  onDrawingSelect,
  orders = [],
  selectedOrderId = null,
  onOrderSelect,
  backtestResult = null,
  syncCrosshair = true,
  syncDateRange = true,
  showSelectionBorder = true,
  showBrandWatermark = true,
}: ChartPaneProps) {
  const ohlcRef = useRef<HTMLSpanElement>(null);
  const changeRef = useRef<HTMLSpanElement>(null);
  const sampleRef = useRef(onCrosshairSample);
  sampleRef.current = onCrosshairSample;
  const appearance = useSyncExternalStore(
    subscribeAppearance,
    getAppearance,
    getAppearance,
  );

  const onCrosshairMove = useCallback((point: CrosshairPoint | null) => {
    sampleRef.current?.(point);
    if (ohlcRef.current) {
      ohlcRef.current.textContent = formatOhlc(point);
    }
    if (changeRef.current) {
      if (point?.bar) {
        const d = point.bar.close - point.bar.open;
        const pct = point.bar.open !== 0 ? (d / point.bar.open) * 100 : 0;
        const sign = d >= 0 ? '+' : '';
        changeRef.current.textContent = `${sign}${formatPrice(d)} (${sign}${pct.toFixed(2)}%)`;
        changeRef.current.className = `tabular-nums ${d >= 0 ? 'text-success' : 'text-danger'}`;
        changeRef.current.hidden = false;
      } else {
        changeRef.current.textContent = '';
        changeRef.current.hidden = true;
      }
    }
  }, []);

  return (
    <div
      onPointerDown={() => {
        if (!selected) onSelect();
      }}
      className="relative min-h-0 min-w-0 h-full w-full bg-background overflow-hidden"
      data-pane-selected={showSelectionBorder && selected ? 'true' : undefined}
    >
      {/* Soft blue inset frame — above canvas so multi-pane focus is obvious */}
      {showSelectionBorder && selected && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 rounded-[1px] shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--accent)_55%,transparent)]"
        />
      )}
      {(appearance.statusShowSymbol ||
        appearance.statusShowInterval ||
        appearance.statusShowOhlc ||
        appearance.statusShowChange) && (
        <div className="pointer-events-none absolute top-2 left-3 z-10 text-xs font-medium tracking-wide flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {appearance.statusShowSymbol && (
            <span
              className={`inline-flex items-center ${selected ? 'text-accent' : 'text-foreground'}`}
            >
              {symbol}
              {dataLoading && <LoadingDots />}
            </span>
          )}
          {appearance.statusShowSymbol && appearance.statusShowInterval && (
            <span className="text-muted">·</span>
          )}
          {appearance.statusShowInterval && (
            <span
              className={`inline-flex items-center ${selected ? 'text-accent' : 'text-muted'}`}
            >
              {timeframe}
              {!appearance.statusShowSymbol && dataLoading && <LoadingDots />}
            </span>
          )}
          {appearance.statusShowOhlc && (
            <span ref={ohlcRef} className="text-foreground tabular-nums">
              O — H — L — C —
            </span>
          )}
          {appearance.statusShowChange && (
            <span ref={changeRef} className="tabular-nums" hidden />
          )}
        </div>
      )}

      {appearance.statusShowVolumeLegend && (
        <VolumeIndicator
          visible={showVolume}
          opacity={volumeOpacity}
          onVisibleChange={onShowVolumeChange}
          onOpacityChange={onVolumeOpacityChange}
        />
      )}

      <OverlayIndicators
        enabled={enabledIndicators}
        belowVolume={showVolume}
        onChange={onEnabledIndicatorsChange}
      />

      <ChartContainer
        chartId={chartId}
        syncStore={syncStore}
        bars={bars}
        initialRange={initialRange}
        onCrosshairMove={onCrosshairMove}
        crosshairMode={crosshairMode}
        seriesType={seriesType}
        showVolume={showVolume}
        volumeOpacity={volumeOpacity}
        enabledIndicators={enabledIndicators}
        drawings={drawings}
        placement={placement}
        selectedDrawingId={selectedDrawingId}
        drawingsHidden={drawingsHidden}
        paneTimeframe={timeframe}
        drawingMagnetMode={drawingMagnetMode}
        drawingShiftHeld={drawingShiftHeld}
        replayCursorTime={replayCursorTime}
        drawingToolActive={drawingToolActive}
        drawingsLocked={drawingsLocked}
        onChartPoint={onChartPoint}
        onUserGesture={onUserGesture}
        onDrawingsChange={onDrawingsChange}
        onDrawingSelect={onDrawingSelect}
        orders={orders}
        selectedOrderId={selectedOrderId}
        onOrderSelect={onOrderSelect}
        backtestResult={backtestResult}
        syncCrosshair={syncCrosshair}
        syncDateRange={syncDateRange}
        showBrandWatermark={showBrandWatermark}
        replayFollow={replayFollow}
        following={replayFollow}
        showFollowControl={showFollowControl}
        onReattachFollow={onReattachFollow}
      />

      {bars.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
          <p className="text-sm text-muted text-center max-w-xs">
            No bars in this viewport. Pan toward data or reload the session.
          </p>
        </div>
      )}
    </div>
  );
}
