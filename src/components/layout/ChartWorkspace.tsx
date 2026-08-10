import { useCallback, useMemo, useRef } from 'react';
import type { CrosshairPoint, CrosshairMode, SeriesType } from '@/chart';
import { formatPrice } from '@/chart';
import { ChartContainer } from '@/components/ChartContainer';
import { VolumeIndicator } from '@/components/layout/VolumeIndicator';
import { defaultSpecForSymbol } from '@/orders/instrumentSpec';
import type { Timeframe } from '@/types/ui';

interface ChartWorkspaceProps {
  symbol: string;
  timeframe: Timeframe;
  crosshairMode: CrosshairMode;
  seriesType: SeriesType;
  showVolume: boolean;
  onShowVolumeChange: (v: boolean) => void;
  volumeOpacity: number;
  onVolumeOpacityChange: (v: number) => void;
}

function formatOhlc(point: CrosshairPoint | null, digits: number): string {
  const bar = point?.bar;
  if (!bar) return 'O —  H —  L —  C —';
  return `O ${formatPrice(bar.open, digits)}  H ${formatPrice(bar.high, digits)}  L ${formatPrice(bar.low, digits)}  C ${formatPrice(bar.close, digits)}`;
}

/**
 * Chart area + OHLC readout.
 * OHLC updates via DOM refs (no React setState on move) so the canvas
 * host never re-renders mid-drag — that was breaking pan.
 */
export function ChartWorkspace({
  symbol,
  timeframe,
  crosshairMode,
  seriesType,
  showVolume,
  onShowVolumeChange,
  volumeOpacity,
  onVolumeOpacityChange,
}: ChartWorkspaceProps) {
  const ohlcRef = useRef<HTMLSpanElement>(null);
  const changeRef = useRef<HTMLSpanElement>(null);
  const priceSpec = useMemo(() => defaultSpecForSymbol(symbol), [symbol]);

  const onCrosshairMove = useCallback(
    (point: CrosshairPoint | null) => {
      const digits = priceSpec.digits;
      if (ohlcRef.current) {
        ohlcRef.current.textContent = formatOhlc(point, digits);
      }
      if (changeRef.current) {
        if (point?.bar) {
          const d = point.bar.close - point.bar.open;
          const pct = point.bar.open !== 0 ? (d / point.bar.open) * 100 : 0;
          const sign = d >= 0 ? '+' : '';
          changeRef.current.textContent = `${sign}${formatPrice(d, digits)} (${sign}${pct.toFixed(2)}%)`;
          changeRef.current.className = `tabular-nums ${d >= 0 ? 'text-success' : 'text-danger'}`;
          changeRef.current.hidden = false;
        } else {
          changeRef.current.textContent = '';
          changeRef.current.hidden = true;
        }
      }
    },
    [priceSpec.digits],
  );

  return (
    <div className="relative flex-1 min-h-0 min-w-0 bg-background">
      <div className="pointer-events-none absolute top-2 left-3 z-10 text-xs font-medium tracking-wide flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-foreground">{symbol}</span>
        <span className="text-muted">·</span>
        <span className="text-muted">{timeframe}</span>
        <span ref={ohlcRef} className="text-foreground tabular-nums">
          O — H — L — C —
        </span>
        <span ref={changeRef} className="tabular-nums" hidden />
      </div>

      <VolumeIndicator
        visible={showVolume}
        opacity={volumeOpacity}
        onVisibleChange={onShowVolumeChange}
        onOpacityChange={onVolumeOpacityChange}
      />

      <ChartContainer
        onCrosshairMove={onCrosshairMove}
        crosshairMode={crosshairMode}
        seriesType={seriesType}
        showVolume={showVolume}
        volumeOpacity={volumeOpacity}
        priceDigits={priceSpec.digits}
        priceTickSize={priceSpec.tickSize}
      />
    </div>
  );
}
