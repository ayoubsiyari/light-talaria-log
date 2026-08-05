import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import type { SeriesType } from '@/chart';
import {
  chartTemplateSupportsLightMode,
  getActiveTemplateId,
  matchTemplateId,
} from '@/chart/chartStyleTemplates';
import { getAppearance, subscribeAppearance } from '@/chart/appearanceStore';
import { BacktestRunMenu } from '@/components/backtest/BacktestRunMenu';
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
import type { BacktestParams } from '@/types/backtest';
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
  backtestParams?: BacktestParams;
  onBacktestParamsChange?: (next: BacktestParams) => void;
  onRunBacktest?: () => void;
  onCancelBacktest?: () => void;
}

/**
 * V8b-style top chrome: logo · symbol · series · indicators · TFs · Place Order · utils.
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
  backtestParams,
  onBacktestParamsChange,
  onRunBacktest,
  onCancelBacktest,
}: TopBarProps) {
  const [templateId, setTemplateId] = useState<string | null>(() =>
    matchTemplateId(getAppearance()) ?? getActiveTemplateId(),
  );

  useEffect(() => {
    setTemplateId(matchTemplateId(getAppearance()) ?? getActiveTemplateId());
    return subscribeAppearance((a) => {
      setTemplateId(matchTemplateId(a) ?? getActiveTemplateId());
    });
  }, []);

  const showThemeToggle = chartTemplateSupportsLightMode(templateId);

  return (
    <header
      className={[
        'chrome-topbar shrink-0 flex items-center gap-0',
        'px-1.5 sm:px-2.5 pt-[env(safe-area-inset-top)]',
        'h-9 min-h-9 [@media(hover:none)]:h-11 [@media(hover:none)]:min-h-11',
        'border-b border-[color-mix(in_oklab,var(--accent)_22%,transparent)]',
      ].join(' ')}
    >
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 h-8 min-h-8 w-8 min-w-8 [@media(hover:none)]:h-11 [@media(hover:none)]:min-h-11 [@media(hover:none)]:w-11 [@media(hover:none)]:min-w-11 mr-0.5 px-0"
        aria-label="Exit session to Backtest"
        onPress={onExitSession}
        isDisabled={!onExitSession}
      >
        <BrandLogo size={28} variant="raster" className="w-7 h-7" />
      </Button>

      <span className="v8b-sep" aria-hidden />

      <div className="flex items-center min-w-0 shrink">
        <SymbolPicker
          symbol={symbol}
          options={symbolOptions}
          onSymbolChange={onSymbolChange}
        />

        <span className="v8b-sep hidden sm:block" aria-hidden />

        <label className="v8b-chrome-btn hidden sm:inline-flex cursor-pointer">
          <IconCandles className="w-[15px] h-[15px]" />
          <select
            value={seriesType}
            onChange={(e) => onSeriesTypeChange(e.target.value as SeriesType)}
            className="bg-transparent text-inherit text-[13px] font-semibold outline-none cursor-pointer appearance-none pr-1 max-w-[7.5rem]"
            aria-label="Series type"
          >
            {SERIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <span className="v8b-sep hidden sm:block" aria-hidden />

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

      <span className="v8b-sep mx-1" aria-hidden />

      <div className="flex items-center min-w-0 flex-1 basis-0 px-0.5 overflow-hidden">
        <TimeframePicker
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          availableTimeframes={availableTimeframes}
        />
      </div>

      <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-1">
        <button
          type="button"
          className="v8b-place-order rounded-sm shrink-0"
          disabled={!onPlaceOrder}
          onClick={onPlaceOrder}
        >
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M6,1 L6,11 M1,6 L11,6"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          </svg>
          <span className="sm:hidden">Order</span>
          <span className="hidden sm:inline">Place Order</span>
        </button>

        <span className="v8b-sep" aria-hidden />

        <ChartTemplatesMenu />
        <LayoutPicker
          layout={chartLayout}
          onLayoutChange={onChartLayoutChange}
          sync={layoutSync}
          onSyncChange={onLayoutSyncChange}
        />
        {showThemeToggle && <ThemeToggle compact />}
        {backtestParams && onBacktestParamsChange ? (
          <BacktestRunMenu
            running={backtestRunning}
            label={backtestLabel}
            disabled={!onRunBacktest && !backtestRunning}
            params={backtestParams}
            onParamsChange={onBacktestParamsChange}
            onRun={() => onRunBacktest?.()}
            onCancel={onCancelBacktest}
          />
        ) : backtestRunning ? (
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
      </div>
    </header>
  );
}
