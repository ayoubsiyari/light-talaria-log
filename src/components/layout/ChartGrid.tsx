import type {
  ChartSyncStore,
  CrosshairMode,
  CrosshairPoint,
  DrawingPlacement,
  SeriesType,
} from '@/chart';
import { ChartPane } from '@/components/layout/ChartPane';
import type { Drawing, DrawingPoint } from '@/drawings/drawingStore';
import type { HitResult } from '@/drawings/hitTest';
import type { MagnetMode } from '@/drawings/magnet';
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
  drawingMagnetMode?: MagnetMode;
  drawingShiftHeld?: boolean;
  replayCursorTime: number | null;
  /** Engine centers the live candle while replay is playing. */
  replayFollow?: boolean;
  showFollowControl?: boolean;
  onReattachFollow?: () => void;
  drawingToolActive: boolean;
  freehandStrokeEnabled?: boolean;
  marqueeZoomEnabled?: boolean;
  drawingsLocked?: boolean;
  onChartPoint: (point: CrosshairPoint, hit: HitResult | null) => void;
  onBacktestEventSelect?: (
    event: import('@/types/backtest').BacktestEvent | null,
  ) => void;
  onCrosshairSample?: (point: CrosshairPoint | null) => void;
  onUserGesture?: (paneId: string) => void;
  onDrawingsChange?: (drawings: readonly Drawing[]) => void;
  onDrawingSelect?: (drawingId: string) => void;
  onFreehandStroke?: (
    phase: 'start' | 'move' | 'end',
    point: DrawingPoint | null,
  ) => void;
  orders?: readonly ChartOrder[];
  selectedOrderId?: string | null;
  onOrderSelect?: (orderId: string | null) => void;
  backtestResult?: BacktestResult | null;
  syncCrosshair?: boolean;
  syncDateRange?: boolean;
  /** Pane ids currently warming TF / ticker data. */
  loadingPaneIds?: ReadonlySet<string>;
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
  drawingMagnetMode = 'off',
  drawingShiftHeld = false,
  replayCursorTime,
  replayFollow = false,
  showFollowControl = false,
  onReattachFollow,
  drawingToolActive,
  freehandStrokeEnabled = false,
  marqueeZoomEnabled = false,
  drawingsLocked = false,
  onChartPoint,
  onBacktestEventSelect,
  onCrosshairSample,
  onUserGesture,
  onDrawingsChange,
  onDrawingSelect,
  onFreehandStroke,
  orders = [],
  selectedOrderId = null,
  onOrderSelect,
  backtestResult = null,
  syncCrosshair = true,
  syncDateRange = true,
  loadingPaneIds,
}: ChartGridProps) {
  /** On phones, 3+ stacked panes become unusable — focus one + switcher strip. */
  const mobileFocus = panes.length > 2;
  const smLayoutClasses = LAYOUT_CLASS[layout]
    .split(/\s+/)
    .filter((c) => c.startsWith('sm:') || c.includes(':sm:'))
    .join(' ');
  const gridClass = mobileFocus
    ? `grid-cols-1 grid-rows-1 ${smLayoutClasses}`
    : LAYOUT_CLASS[layout];

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
      {mobileFocus && (
        <div
          className="sm:hidden shrink-0 flex gap-1 overflow-x-auto overscroll-x-contain px-1 py-1 border-b border-[color:var(--tv-panel-line)] bg-surface"
          role="tablist"
          aria-label="Chart panes"
        >
          {panes.map((pane) => {
            const active = pane.id === activePaneId;
            return (
              <button
                key={pane.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectPane(pane.id)}
                className={[
                  'shrink-0 min-h-11 px-3 rounded-md text-xs font-medium',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted hover:text-foreground hover:bg-background/70',
                ].join(' ')}
              >
                {pane.pair} · {pane.timeframe}
              </button>
            );
          })}
        </div>
      )}
      <div
        className={`flex-1 min-h-0 min-w-0 grid gap-px bg-[color:var(--tv-panel-line)] ${gridClass}`}
      >
        {panes.map((pane, paneIndex) => (
          <div
            key={pane.id}
            className={[
              'min-h-0 min-w-0 h-full',
              mobileFocus && pane.id !== activePaneId ? 'max-sm:hidden' : '',
            ].join(' ')}
          >
            <ChartPane
              chartId={pane.id}
              syncStore={syncStore}
              bars={pane.bars}
              initialRange={pane.range}
              symbol={pane.pair}
              timeframe={pane.timeframe}
              dataLoading={loadingPaneIds?.has(pane.id) ?? false}
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
              drawingMagnetMode={drawingMagnetMode}
              drawingShiftHeld={drawingShiftHeld}
              replayCursorTime={replayCursorTime}
              replayFollow={replayFollow}
              showFollowControl={showFollowControl}
              onReattachFollow={onReattachFollow}
              drawingToolActive={drawingToolActive}
              freehandStrokeEnabled={freehandStrokeEnabled}
              marqueeZoomEnabled={marqueeZoomEnabled}
              drawingsLocked={drawingsLocked}
              onChartPoint={onChartPoint}
              onBacktestEventSelect={onBacktestEventSelect}
              onCrosshairSample={onCrosshairSample}
              onUserGesture={
                onUserGesture ? () => onUserGesture(pane.id) : undefined
              }
              onDrawingsChange={onDrawingsChange}
              onDrawingSelect={onDrawingSelect}
              onFreehandStroke={onFreehandStroke}
              orders={orders}
              selectedOrderId={selectedOrderId}
              onOrderSelect={onOrderSelect}
              backtestResult={
                backtestResult && pane.datasetId === backtestResult.datasetId
                  ? backtestResult
                  : null
              }
              syncCrosshair={syncCrosshair}
              syncDateRange={syncDateRange}
              showSelectionBorder={panes.length > 1}
              showBrandWatermark={paneIndex === 0}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
