import { getIndicatorDef } from '@/indicators/defs';
import type { IndicatorId } from '@/types/indicator';

/** Human labels for Style tab color rows (aligned with compute series order). */
export function seriesLabelsFor(id: IndicatorId): string[] {
  const n = getIndicatorDef(id).seriesCount;
  const known: Partial<Record<IndicatorId, string[]>> = {
    bb: ['Upper', 'Basis', 'Lower'],
    keltner: ['Upper', 'Mid', 'Lower'],
    donchian: ['Upper', 'Mid', 'Lower'],
    envelopes: ['Upper', 'Mid', 'Lower'],
    atrBands: ['Upper', 'Mid', 'Lower'],
    ichimoku: ['Span A', 'Span B', 'Tenkan', 'Kijun'],
    pivot: ['PP', 'R1', 'S1', 'R2', 'S2'],
    macd: ['Histogram', 'MACD', 'Signal'],
    ppo: ['Histogram', 'PPO', 'Signal'],
    stoch: ['%K', '%D'],
    stochrsi: ['%K', '%D'],
    adx: ['ADX', '+DI', '−DI'],
    aroon: ['Aroon Up', 'Aroon Down'],
    vortex: ['VI+', 'VI−'],
    fisher: ['Fisher', 'Trigger'],
    elderRay: ['Bull Power', 'Bear Power'],
    supertrend: ['Supertrend', 'Direction'],
    fvg: ['FVG top', 'FVG bottom'],
    orderBlock: ['Bull OB top', 'Bull OB bot', 'Bear OB top', 'Bear OB bot'],
    liquidity: ['BSL', 'SSL'],
    premiumDiscount: ['Premium top', 'Premium bot', 'EQ', 'Discount top', 'Discount bot'],
    killzone: ['KZ top', 'KZ bot'],
    ote: ['OTE top', 'OTE bot'],
  };
  const labels = known[id];
  if (labels && labels.length >= n) return labels.slice(0, n);
  if (n === 1) return [getIndicatorDef(id).shortLabel];
  return Array.from({ length: n }, (_, i) => `Series ${i + 1}`);
}
