import { Button } from '@heroui/react';
import type { SeriesType } from '@/chart';
import { IndicatorsMenu } from '@/components/indicators/IndicatorsMenu';
import { BrandLogo } from '@/components/landing/BrandLogo';
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
}

/**
 * TradingView-style top banner:
 * left = symbol / series / indicators · center = TFs · right = layout / theme / order
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
}: TopBarProps) {
  return (
    <header className="chrome-topbar tv-panel-b shrink-0 h-10 sm:h-[38px] flex items-center gap-0 px-1 sm:px-2 pt-[env(safe-area-inset-top)] min-h-10">
      <a
        href="/"
        className="flex items-center justify-center shrink-0 h-9 w-9 mr-1.5 rounded-md hover:bg-background/60"
        title="Talaria Log"
        aria-label="Talaria Log home"
      >
        <BrandLogo size={28} variant="raster" className="w-7 h-7" />
      </a>

      {/* Left: symbol + series + indicators */}
      <div className="flex items-center min-w-0 shrink-0">
        <SymbolPicker
          symbol={symbol}
          options={symbolOptions}
          onSymbolChange={onSymbolChange}
        />

        <span className="tv-divider-y mx-0.5 hidden sm:block h-4 self-center" aria-hidden />

        <label className="hidden sm:flex items-center gap-1 h-8 px-2 rounded text-[13px] text-foreground hover:bg-background/70 cursor-pointer">
          <IconCandles className="w-3.5 h-3.5 text-foreground" />
          <select
            value={seriesType}
            onChange={(e) => onSeriesTypeChange(e.target.value as SeriesType)}
            className="bg-transparent text-foreground text-[13px] outline-none cursor-pointer appearance-none pr-3"
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

      {/* Pinned timeframes */}
      <div className="flex items-center min-w-0 flex-1 px-1.5 overflow-visible">
        <TimeframePicker
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          availableTimeframes={availableTimeframes}
        />
      </div>

      {/* Right corner: layout, theme, place order only */}
      <div className="flex items-center gap-0.5 shrink-0 ml-auto">
        <LayoutPicker
          layout={chartLayout}
          onLayoutChange={onChartLayoutChange}
          sync={layoutSync}
          onSyncChange={onLayoutSyncChange}
        />
        <ThemeToggle compact />
        <Button
          variant="primary"
          size="sm"
          className="h-8 min-h-8 [@media(hover:none)]:min-h-11 px-3 text-[13px] font-medium"
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
