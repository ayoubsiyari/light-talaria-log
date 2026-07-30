import type { ChartColors } from '@/chart/chartTheme';
import { getIndicatorDef } from '@/indicators/defs';
import type { IndicatorId } from '@/types/indicator';

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Resolve per-series colors from Hero chart theme (main thread only). */
export function colorsForIndicator(id: IndicatorId, colors: ChartColors): string[] {
  const def = getIndicatorDef(id);
  const palette = [
    colors.accent,
    colors.upColor,
    colors.downColor,
    colors.muted,
    cssVar('--chart-4', colors.accent),
    cssVar('--chart-5', colors.upColor),
    cssVar('--chart-1', colors.muted),
    cssVar('--chart-2', colors.accent),
  ];

  // Prefer semantic colors for well-known ids
  switch (id) {
    case 'sma':
    case 'rsi':
    case 'willr':
    case 'cci':
      return [colors.accent];
    case 'ema':
    case 'hma':
      return [colors.upColor];
    case 'macd':
    case 'ppo':
      return [colors.upColor, colors.accent, colors.downColor];
    case 'bb':
    case 'keltner':
    case 'donchian':
    case 'envelopes':
    case 'atrBands':
      return [colors.accent, colors.muted, colors.accent];
    case 'stoch':
    case 'stochrsi':
    case 'aroon':
    case 'vortex':
    case 'fisher':
      return [colors.accent, colors.upColor];
    case 'adx':
      return [colors.accent, colors.upColor, colors.downColor];
    case 'elderRay':
    case 'ao':
      return [colors.upColor, colors.downColor];
    case 'fvg':
    case 'ote':
    case 'killzone':
    case 'premiumDiscount':
      return [colors.accent, colors.accent, colors.muted, colors.upColor, colors.downColor];
    case 'orderBlock':
      return [colors.upColor, colors.upColor, colors.downColor, colors.downColor];
    case 'liquidity':
      return [colors.downColor, colors.upColor];
    case 'bosChoch':
      return [colors.accent];
    default:
      break;
  }

  const out: string[] = [];
  for (let i = 0; i < def.seriesCount; i++) {
    out.push(palette[i % palette.length]!);
  }
  return out;
}
