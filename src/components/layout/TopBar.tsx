import { Button } from '@heroui/react';
import type { SeriesType } from '@/chart';
import { IndicatorsMenu } from '@/components/indicators/IndicatorsMenu';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { ChartTemplatesMenu } from '@/components/chart/ChartTemplatesMenu';
import { LayoutPicker } from '@/components/layout/LayoutPicker';
import { SymbolPicker } from '@/components/layout/SymbolPicker';
import { TimeframePicker } from '@/components/layout/TimeframePicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { IconCandles } from '@/components/icons/ToolIcons';
import type { EnabledIndicator } from '@/types/indicator';
import type { LayoutSyncOptions } from '@/types/layout';
import type { PairSymbol } from '@/types/session';
import type { ChartLayout, Timeframe } from '@/types/ui';

const SERIES: { id: SeriesType; label: string }[] = [
  { id: 'candle', label: 'Candles' },
  { id: 'bar', label: 'Bars' },
  { id: 'line', label: 'Line' },
];

interface TopBarProps {
  symbol: string;
  /** Session pairs available for the symbol switcher. */
  symbolOptions: readonly { pair: PairSymbol }[];
  onSymbolChange: (pair: PairSymbol) => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  availableTimeframes?: readonly Timeframe[];
  seriesType: SeriesType;
  onSeriesTypeChange: (t: SeriesType) => void;
  chartLayout: ChartLayout;
  onChartLayoutChange: (l: ChartLayout) => void;
  layoutSync: LayoutSyncOptions;
  onLayoutSyncChange: (next: LayoutSyncOptions) => void;
  showVolume: boolean;
  onShowVolumeChange: (v: boolean) => void;
  enabledIndicators: readonly EnabledIndicator[];
  onEnabledIndicatorsChange: (next: EnabledIndicator[]) => void;
  onPlaceOrder?: () => void;
  /** Leave chart → sessions (teardown). */
  onExitSession?: () => void;
  /** Strategy backtest v1 */
  backtestRunning?: boolean;
  backtestLabel?: string;
  onRunBacktest?: () => void;
  onCancelBacktest?: () => void;
}

/**
 * TradingView-style top banner.
 * Phone (~390px): 44px hits, safe-area, truncating symbol, scrollable TFs,
 * right corner keeps layout / theme / order without crowding the left chrome.
 */
export function TopBar({
  symbol,
  symbolOptions,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  availableTimeframes,
  seriesType,
  onSeriesTypeChange,
  chartLayout,
  onChartLayoutChange,
  layoutSync,
  onLayoutSyncChange,
  showVolume,
  onShowVolumeChange,
  enabledIndicators,
  onEnabledIndicatorsChange,
  onPlaceOrder,
  onExitSession,
  backtestRunning = false,
  backtestLabel,
  onRunBacktest,
  onCancelBacktest,
}: TopBarProps) {
  return (
    <header
      className={[
        'chrome-topbar tv-panel-b shrink-0 flex items-center gap-0',
        'px-1 sm:px-1.5 pt-[env(safe-area-inset-top)]',
        // Desktop ≈ TV ~36px; phone keeps 44px touch row
        'h-9 min-h-9 [@media(hover:none)]:h-11 [@media(hover:none)]:min-h-11',
      ].join(' ')}
    >
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 h-7 min-h-7 w-7 min-w-7 [@media(hover:none)]:h-11 [@media(hover:none)]:min-h-11 [@media(hover:none)]:w-11 [@media(hover:none)]:min-w-11 mr-0.5 sm:mr-1 px-0"
        aria-label="Back to sessions"
        onPress={onExitSession}
        isDisabled={!onExitSession}
      >
        <BrandLogo size={22} variant="raster" className="w-[22px] h-[22px]" />
      </Button>

      {/* Left: symbol + series + indicators — may shrink; never shove right corner */}
      <div className="flex items-center min-w-0 shrink">
        <SymbolPicker
          symbol={symbol}
          options={symbolOptions}
          onSymbolChange={onSymbolChange}
        />

        <span className="tv-divider-y mx-0.5 hidden sm:block h-4 self-center" aria-hidden />

        <label className="hidden sm:flex items-center gap-1 h-7 px-1.5 rounded text-xs text-foreground hover:bg-background/70 cursor-pointer">
          <IconCandles className="w-3.5 h-3.5 text-foreground" />
          <select
            value={seriesType}
            onChange={(e) => onSeriesTypeChange(e.target.value as SeriesType)}
            className="bg-transparent text-foreground text-xs outline-none cursor-pointer appearance-none pr-2"
            aria-label="Series type"
          >
            {SERIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <span className="tv-divider-y mx-0.5 hidden sm:block h-4 self-center" aria-hidden />

        <IndicatorsMenu
          showVolume={showVolume}
          onShowVolumeChange={onShowVolumeChange}
          enabled={enabledIndicators}
          onChange={onEnabledIndicatorsChange}
          mobileExtras={
            <div className="sm:hidden border-t border-[color:var(--tv-panel-line)] mt-1 pt-1 space-y-1">
              <p className="px-2 py-1 text-xs font-semibold text-muted uppercase tracking-wide">
                Chart
              </p>
              <label className="flex items-center gap-2 px-2 min-h-11 text-sm">
                <span className="text-muted w-16 shrink-0">Series</span>
                <select
                  value={seriesType}
                  onChange={(e) => onSeriesTypeChange(e.target.value as SeriesType)}
                  className="flex-1 bg-background border border-[color:var(--tv-panel-line)] rounded-md px-2 py-1.5 outline-none"
                  aria-label="Series type"
                >
                  {SERIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="px-2 pb-1 text-[11px] text-muted">
                Crosshair: long-press the chart
              </p>
            </div>
          }
        />
      </div>

      {/* Center TFs — scroll horizontally on narrow phones */}
      <div className="flex items-center min-w-0 flex-1 basis-0 px-0.5 sm:px-1.5 overflow-hidden">
        <TimeframePicker
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          availableTimeframes={availableTimeframes}
        />
      </div>

      {/* Right corner — always visible, 44px hits on touch */}
      <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-0.5">
        <ChartTemplatesMenu />
        <LayoutPicker
          layout={chartLayout}
          onLayoutChange={onChartLayoutChange}
          sync={layoutSync}
          onSyncChange={onLayoutSyncChange}
        />
        {onExitSession && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 min-h-7 [@media(hover:none)]:min-h-11 px-2 text-xs shrink-0"
            onPress={onExitSession}
          >
            Sessions
          </Button>
        )}
        <ThemeToggle compact />
        {backtestRunning ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 min-h-7 [@media(hover:none)]:min-h-11 px-2 sm:px-2.5 text-xs shrink-0"
            onPress={onCancelBacktest}
            aria-label={backtestLabel ?? 'Cancel backtest'}
          >
            Cancel
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 min-h-7 [@media(hover:none)]:min-h-11 px-2 sm:px-2.5 text-xs shrink-0"
            isDisabled={!onRunBacktest}
            onPress={onRunBacktest}
            aria-label={backtestLabel ?? 'Run backtest'}
          >
            <span className="sm:hidden">BT</span>
            <span className="hidden sm:inline">Backtest</span>
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          className="h-7 min-h-7 [@media(hover:none)]:min-h-11 px-2 sm:px-2.5 text-xs font-medium shrink-0"
          isDisabled={!onPlaceOrder}
          onPress={onPlaceOrder}
        >
          <span className="sm:hidden">+ Order</span>
          <span className="hidden sm:inline">+ Place Order</span>
        </Button>
      </div>
    </header>
  );
}
