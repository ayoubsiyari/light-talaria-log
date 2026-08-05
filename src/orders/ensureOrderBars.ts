/**
 * Ensure base-TF bars cover [fromTime, toTime] for order rebuild / long seek.
 * Returns a contiguous bar array the sync getBars provider can filter.
 * Tip is also written into warmCache so Play can continue without a cold miss.
 */

import { getBarsInRange, getSeriesMeta, openDb } from '@/data/idbStore';
import { timeToLogicalIndex } from '@/datasets/seriesViewport';
import { warmCache } from '@/session/warmCache';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { MAX_BACKTEST_BARS, MAX_BARS_IN_MEMORY } from '@/utils/constants';

export async function ensureOrderBars(
  datasetId: string,
  tf: Timeframe,
  fromTime: number,
  toTime: number,
): Promise<ChartBar[]> {
  if (!(toTime > 0) || !(datasetId.length > 0)) return [];

  const from = Number.isFinite(fromTime) ? fromTime : toTime;
  const lo = Math.min(from, toTime);
  const hi = Math.max(from, toTime);

  try {
    const db = await openDb();
    const meta = await getSeriesMeta(db, datasetId, tf);
    if (!meta || meta.rowCount <= 0) {
      // Fall back to whatever is already warm.
      return warmCache.peek(datasetId, tf) ?? [];
    }

    let fromIdx = await timeToLogicalIndex(datasetId, tf, lo);
    let toIdx = await timeToLogicalIndex(datasetId, tf, hi) + 1;
    fromIdx = Math.max(0, Math.min(meta.rowCount, fromIdx));
    toIdx = Math.max(fromIdx, Math.min(meta.rowCount, toIdx));

    // Cap length — prefer the newest window ending at hi (matches replay tip).
    if (toIdx - fromIdx > MAX_BACKTEST_BARS) {
      fromIdx = toIdx - MAX_BACKTEST_BARS;
    }

    const bars = (await getBarsInRange(db, meta, fromIdx, toIdx)) as ChartBar[];

    // Keep a tip-sized window in warmCache for ongoing play / step.
    if (bars.length > 0) {
      const tipBars =
        bars.length > MAX_BARS_IN_MEMORY
          ? bars.slice(bars.length - MAX_BARS_IN_MEMORY)
          : bars;
      warmCache.put(datasetId, tf, tipBars, hi);
    }

    return bars;
  } catch {
    return warmCache.peek(datasetId, tf) ?? [];
  }
}

/** True when `bars` has at least one sample in (fromExclusive, toInclusive]. */
export function barsCoverRange(
  bars: readonly ChartBar[],
  fromExclusive: number,
  toInclusive: number,
): boolean {
  if (bars.length === 0) return false;
  if (toInclusive <= fromExclusive) return true;
  const first = bars[0]!.time;
  const last = bars[bars.length - 1]!.time;
  // Need coverage from just after fromExclusive through toInclusive.
  const needFrom =
    fromExclusive === Number.NEGATIVE_INFINITY ? first : fromExclusive;
  return first <= needFrom + 1e-9 && last >= toInclusive - 1e-9;
}
