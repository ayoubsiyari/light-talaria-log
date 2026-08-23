import {
  indexAtOrBeforeBars,
  tfBucketEnd,
  tfBucketStart,
  timeframeSeconds,
  type AggregateBarsOpts,
} from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';

/**
 * Build OHLC for an open coarse bucket from finer (clock) bars up to cursorTime.
 * Returns null when no clock bars fall inside the open interval yet.
 * Optional `bucketEnd` for session days that are not exactly `periodSec` long (DST).
 */
export function formBucketFromClock(
  clockBars: readonly ChartBar[],
  bucketOpen: number,
  periodSec: number,
  cursorTime: number,
  bucketEndExclusive?: number,
): ChartBar | null {
  if (clockBars.length === 0 || cursorTime < bucketOpen) return null;
  const bucketEnd = bucketEndExclusive ?? bucketOpen + periodSec;
  const lastAllowed = Math.min(cursorTime, bucketEnd - 1);

  let i = indexAtOrBeforeBars(clockBars, bucketOpen);
  if (clockBars[i]!.time < bucketOpen) i += 1;
  if (i >= clockBars.length) return null;

  const first = clockBars[i]!;
  if (first.time > lastAllowed || first.time >= bucketEnd) return null;

  let open = first.open;
  let high = first.high;
  let low = first.low;
  let close = first.close;
  let volume = first.volume ?? 0;

  for (let j = i + 1; j < clockBars.length; j++) {
    const b = clockBars[j]!;
    if (b.time > lastAllowed || b.time >= bucketEnd) break;
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
    close = b.close;
    volume += b.volume ?? 0;
  }

  return { time: bucketOpen, open, high, low, close, volume };
}

/**
 * For panes coarser than the replay clock: keep closed IDB bars, but replace the
 * open candle with a tick-by-tick forming OHLC from clock bars.
 * Same TF as clock → returned unchanged (reveal mask handles visibility).
 * Pass `aggOpts.symbol` so 1D forming uses FX NY / CME CT / UTC crypto.
 */
export function withFormingOpenBar(
  coarseBars: readonly ChartBar[],
  clockBars: readonly ChartBar[],
  coarseTf: Timeframe,
  clockTf: Timeframe,
  cursorTime: number,
  aggOpts?: AggregateBarsOpts,
): readonly ChartBar[] {
  const coarsePeriod = timeframeSeconds(coarseTf);
  const clockPeriod = timeframeSeconds(clockTf);
  if (coarsePeriod <= clockPeriod) return coarseBars;
  if (coarseBars.length === 0 || clockBars.length === 0) return coarseBars;

  const openBucket = tfBucketStart(cursorTime, coarseTf, aggOpts);
  const bucketEnd = tfBucketEnd(openBucket, coarseTf, aggOpts);
  const idx = indexAtOrBeforeBars(coarseBars, cursorTime);
  const at = coarseBars[idx];
  if (!at) return coarseBars;

  const formed = formBucketFromClock(
    clockBars,
    openBucket,
    coarsePeriod,
    cursorTime,
    bucketEnd,
  );
  if (!formed) return coarseBars;

  if (at.time === openBucket) {
    if (
      at.open === formed.open &&
      at.high === formed.high &&
      at.low === formed.low &&
      at.close === formed.close &&
      (at.volume ?? 0) === (formed.volume ?? 0)
    ) {
      return coarseBars;
    }
    const next = coarseBars.slice();
    next[idx] = formed;
    return next;
  }

  // Open bucket missing from buffer (viewport gap) — append forming bar after last ≤ cursor
  if (at.time < openBucket) {
    const next = coarseBars.slice(0, idx + 1);
    next.push(formed);
    return next;
  }

  return coarseBars;
}
