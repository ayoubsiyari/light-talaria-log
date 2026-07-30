import type {
  ChartSyncStore,
  CrosshairMode,
  CrosshairPoint,
  DrawingPlacement,
  SeriesType,
} from '@/chart';
import { ChartPane } from '@/components/layout/ChartPane';
import type { Drawing } from '@/drawings/drawingStore';
import type { HitResult } from '@/drawings/hitTest';
import type { EnabledIndicator } from '@/types/indicator';
import type { BacktestResult } from '@/types/backtest';
import type { ChartOrder } from '@/types/order';
import type { ChartPaneState } from '@/types/pane';
import type { ChartLayout } from '@/types/ui';

interface ChartGridProps {
  layout: ChartLayout;
  syncStore: ChartSyncStore;
  panes: readonly ChartPaneState[];
  activePaneId: string;
  onSelectPane: (id: string) => void;
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
  replayCursorTime: number | null;
  /** Engine centers the live candle while replay is playing. */
  replayFollow?: boolean;
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
}

/**
 * CSS grid templates for each ChartLayout.
 * Below sm, stack so each pane stays usable at ~390px.
 */
const LAYOUT_CLASS: Record<ChartLayout, string> = {
  '1': 'grid-cols-1 grid-rows-1',
  '2h': 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1',
  '2v': 'grid-cols-1 grid-rows-2',
  '3h': 'grid-cols-1 grid-rows-3 sm:grid-cols-3 sm:grid-rows-1',
  '3v': 'grid-cols-1 grid-rows-3',
  '3r':
    'grid-cols-1 grid-rows-3 sm:grid-cols-2 sm:grid-rows-2 [&>*:nth-child(1)]:sm:row-span-2',
  '3b':
    'grid-cols-1 grid-rows-3 sm:grid-cols-2 sm:grid-rows-2 [&>*:nth-child(1)]:sm:col-span-2',
  '4': 'grid-cols-1 grid-rows-4 sm:grid-cols-2 sm:grid-rows-2',
  '4h': 'grid-cols-1 grid-rows-4 sm:grid-cols-4 sm:grid-rows-1',
  '4v': 'grid-cols-1 grid-rows-4',
};

export function ChartGrid({
  layout,
  syncStore,
  panes,
  activePaneId,
  onSelectPane,
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
}: ChartGridProps) {
  return (
    <div
      className={`flex-1 min-h-0 min-w-0 grid gap-px bg-[color:var(--tv-panel-line)] ${LAYOUT_CLASS[layout]}`}
    >
      {panes.map((pane) => (
        <ChartPane
          key={pane.id}
          chartId={pane.id}
          syncStore={syncStore}
          bars={pane.bars}
          initialRange={pane.range}
          symbol={pane.pair}
          timeframe={pane.timeframe}
          selected={pane.id === activePaneId}
          onSelect={() => onSelectPane(pane.id)}
          crosshairMode={crosshairMode}
          seriesType={seriesType}
          showVolume={showVolume}
          onShowVolumeChange={onShowVolumeChange}
          volumeOpacity={volumeOpacity}
          onVolumeOpacityChange={onVolumeOpacityChange}
          enabledIndicators={enabledIndicators}
          onEnabledIndicatorsChange={onEnabledIndicatorsChange}
          drawings={drawings}
          placement={placement}
          selectedDrawingId={selectedDrawingId}
          drawingsHidden={drawingsHidden}
          replayCursorTime={replayCursorTime}
          replayFollow={replayFollow}
          showFollowControl={showFollowControl}
          onReattachFollow={onReattachFollow}
          drawingToolActive={drawingToolActive}
          drawingsLocked={drawingsLocked}
          onChartPoint={onChartPoint}
          onCrosshairSample={onCrosshairSample}
          onUserGesture={onUserGesture}
          onDrawingsChange={onDrawingsChange}
          onDrawingSelect={onDrawingSelect}
          orders={orders}
          selectedOrderId={selectedOrderId}
          onOrderSelect={onOrderSelect}
          backtestResult={backtestResult}
          syncCrosshair={syncCrosshair}
          syncDateRange={syncDateRange}
          showSelectionBorder={panes.length > 1}
        />
      ))}
    </div>
  );
}
