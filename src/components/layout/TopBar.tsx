import { Button } from '@heroui/react';
import type { CrosshairMode, SeriesType } from '@/chart';
import { CsvUploader } from '@/components/CsvUploader';
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
const CROSSHAIR_MODES: { id: CrosshairMode; label: string }[] = [
  { id: 'magnet', label: 'Magnet' },
  { id: 'magnetOhlc', label: 'Magnet OHLC' },
  { id: 'normal', label: 'Normal' },
  { id: 'hidden', label: 'Hidden' },
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
  crosshairMode: CrosshairMode;
  onCrosshairModeChange: (m: CrosshairMode) => void;
  chartLayout: ChartLayout;
  onChartLayoutChange: (l: ChartLayout) => void;
  layoutSync: LayoutSyncOptions;
  onLayoutSyncChange: (next: LayoutSyncOptions) => void;
  showVolume: boolean;
  onShowVolumeChange: (v: boolean) => void;
  enabledIndicators: readonly EnabledIndicator[];
  onEnabledIndicatorsChange: (next: EnabledIndicator[]) => void;
  onImportCsv: (file: File) => void;
  importing: boolean;
  onExitSession?: () => void;
  sessionLabel?: string;
  onPlaceOrder?: () => void;
  /** Strategy backtest v1 */
  backtestRunning?: boolean;
  backtestLabel?: string;
  onRunBacktest?: () => void;
  onCancelBacktest?: () => void;
}

/**
 * TradingView-style top banner:
 * left = symbol / series / indicators · center-left = pinned TFs · right = layout + actions
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
  crosshairMode,
  onCrosshairModeChange,
  chartLayout,
  onChartLayoutChange,
  layoutSync,
  onLayoutSyncChange,
  showVolume,
  onShowVolumeChange,
  enabledIndicators,
  onEnabledIndicatorsChange,
  onImportCsv,
  importing,
  onExitSession,
  sessionLabel,
  onPlaceOrder,
  backtestRunning = false,
  backtestLabel,
  onRunBacktest,
  onCancelBacktest,
}: TopBarProps) {
  return (
    <header className="chrome-topbar tv-panel-b shrink-0 h-10 sm:h-[38px] flex items-center gap-0 px-1 sm:px-2 pt-[env(safe-area-inset-top)] min-h-10">
      {/* Brand mark — real logo, displayed small (PNG decoded once for chrome only) */}
      <a
        href="/"
        className="flex items-center justify-center shrink-0 h-9 w-9 mr-1.5 rounded-md hover:bg-background/60"
        title="Talaria Log"
        aria-label="Talaria Log home"
      >
        <BrandLogo size={28} variant="raster" className="w-7 h-7" />
      </a>

      {/* Left: symbol + chart chrome */}
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

        <span className="tv-divider-y mx-0.5 hidden md:block h-4 self-center" aria-hidden />

        <label className="hidden md:flex items-center gap-1 h-8 px-2 rounded text-[13px] text-muted hover:bg-background/70 cursor-pointer">
          <span>Crosshair</span>
          <select
            value={crosshairMode}
            onChange={(e) => onCrosshairModeChange(e.target.value as CrosshairMode)}
            className="bg-transparent text-foreground text-[13px] outline-none cursor-pointer appearance-none pr-3"
            aria-label="Crosshair mode"
          >
            {CROSSHAIR_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
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
              <label className="flex items-center gap-2 px-2 min-h-11 text-sm">
                <span className="text-muted w-16 shrink-0">Cross</span>
                <select
                  value={crosshairMode}
                  onChange={(e) => onCrosshairModeChange(e.target.value as CrosshairMode)}
                  className="flex-1 bg-background border border-[color:var(--tv-panel-line)] rounded-md px-2 py-1.5 outline-none"
                  aria-label="Crosshair mode"
                >
                  {CROSSHAIR_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
        />
      </div>

      {/* Pinned timeframes (TV favorites) — overflow-visible so menus aren’t clipped */}
      <div className="flex items-center min-w-0 flex-1 px-1.5 overflow-visible">
        <TimeframePicker
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          availableTimeframes={availableTimeframes}
        />
      </div>

      {/* Right: layout + session actions (TV puts layout on the right) */}
      <div className="flex items-center gap-0.5 shrink-0 ml-auto">
        <LayoutPicker
          layout={chartLayout}
          onLayoutChange={onChartLayoutChange}
          sync={layoutSync}
          onSyncChange={onLayoutSyncChange}
        />

        <span className="tv-divider-y mx-0.5 hidden sm:block h-4 self-center" aria-hidden />

        {sessionLabel && (
          <span
            className="hidden lg:inline text-[11px] text-muted truncate max-w-[10rem] px-1"
            title={sessionLabel}
          >
            {sessionLabel}
          </span>
        )}
        {onExitSession && (
          <Button variant="ghost" size="sm" className="h-8 min-h-8 [@media(hover:none)]:min-h-11 px-2 text-[13px]" onPress={onExitSession}>
            Sessions
          </Button>
        )}
        <ThemeToggle compact />
        <span className="hidden sm:inline-flex">
          <CsvUploader onFile={onImportCsv} disabled={importing} />
        </span>
        {backtestLabel && (
          <span
            className="hidden md:inline text-[11px] text-muted tabular-nums truncate max-w-[7.5rem] px-1"
            title={backtestLabel}
          >
            {backtestLabel}
          </span>
        )}
        {backtestRunning ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 min-h-8 [@media(hover:none)]:min-h-11 px-2.5 text-[13px]"
            onPress={onCancelBacktest}
          >
            Cancel
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 min-h-8 [@media(hover:none)]:min-h-11 px-2.5 text-[13px]"
            isDisabled={!onRunBacktest}
            onPress={onRunBacktest}
          >
            <span className="sm:hidden">BT</span>
            <span className="hidden sm:inline">Backtest</span>
          </Button>
        )}
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
