/**
 * Advertise synthetic second TFs whenever a 1m series is available.
 * Bars are built on-demand in the viewport loader (no 60× IDB storage).
 */
import {
  estimatedSyntheticRowCount,
  SECOND_TIMEFRAMES,
  type SecondTimeframe,
} from '@/data/synthesizeSeconds';
import {
  sortTimeframes,
  synthesizableSecondTimeframes,
} from '@/data/timeframeAgg';
import type { SeriesCatalog } from '@/types/series';
import type { Timeframe } from '@/types/ui';

export function withDerivedTimeframes(catalog: SeriesCatalog): SeriesCatalog {
  const has1m =
    catalog.baseTf === '1m' || catalog.timeframes.includes('1m');
  if (!has1m) return catalog;

  const extras = synthesizableSecondTimeframes('1m').filter(
    (tf) => !catalog.timeframes.includes(tf),
  );
  if (extras.length === 0) {
    return {
      ...catalog,
      timeframes: sortTimeframes(catalog.timeframes),
    };
  }

  const m1Count = catalog.rowCounts['1m'] ?? 0;
  const rowCounts: Partial<Record<Timeframe, number>> = { ...catalog.rowCounts };
  for (const tf of extras) {
    if (m1Count > 0 && (SECOND_TIMEFRAMES as readonly string[]).includes(tf)) {
      rowCounts[tf] = estimatedSyntheticRowCount(
        m1Count,
        tf as SecondTimeframe,
      );
    }
  }

  return {
    ...catalog,
    timeframes: sortTimeframes([...catalog.timeframes, ...extras]),
    rowCounts,
  };
}
