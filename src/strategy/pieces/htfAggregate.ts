/**
 * Aggregate LTF SoA bars → HTF in the Worker (no extra IDB fetch).
 * Pass `symbol` so 1D uses FX NY / CME CT / UTC crypto sessions.
 */
import type { Timeframe } from '@/types/ui';
import { tfBucketStart, timeframeSeconds } from '@/data/timeframeAgg';
import type { BarSeries } from '@/strategy/pieces/evalHelpers';

export function aggregateSeriesToHtf(
  series: BarSeries,
  htf: Timeframe,
  symbol?: string | null,
): BarSeries {
  const period = timeframeSeconds(htf);
  const n = series.closes.length;
  if (n === 0 || period <= 0) {
    return {
      times: new Float64Array(0),
      opens: new Float32Array(0),
      highs: new Float32Array(0),
      lows: new Float32Array(0),
      closes: new Float32Array(0),
    };
  }

  const opts = { symbol };
  const times: number[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];

  let bucket = tfBucketStart(series.times[0]!, htf, opts);
  let o = series.opens[0]!;
  let h = series.highs[0]!;
  let l = series.lows[0]!;
  let c = series.closes[0]!;

  for (let i = 1; i < n; i++) {
    const t = series.times[i]!;
    const b = tfBucketStart(t, htf, opts);
    if (b !== bucket) {
      times.push(bucket);
      opens.push(o);
      highs.push(h);
      lows.push(l);
      closes.push(c);
      bucket = b;
      o = series.opens[i]!;
      h = series.highs[i]!;
      l = series.lows[i]!;
      c = series.closes[i]!;
    } else {
      h = Math.max(h, series.highs[i]!);
      l = Math.min(l, series.lows[i]!);
      c = series.closes[i]!;
    }
  }
  times.push(bucket);
  opens.push(o);
  highs.push(h);
  lows.push(l);
  closes.push(c);

  return {
    times: Float64Array.from(times),
    opens: Float32Array.from(opens),
    highs: Float32Array.from(highs),
    lows: Float32Array.from(lows),
    closes: Float32Array.from(closes),
  };
}

/** Expand HTF boolean flags onto LTF bars (forward-fill each HTF candle). */
export function mapHtfFlagsToLtf(
  ltfTimes: Float64Array,
  htfTimes: Float64Array,
  htfFlags: Uint8Array,
  htfSides: Uint8Array,
  htfPeriodSec: number,
): { flags: Uint8Array; sides: Uint8Array } {
  const n = ltfTimes.length;
  const flags = new Uint8Array(n);
  const sides = new Uint8Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = ltfTimes[i]!;
    while (
      j + 1 < htfTimes.length &&
      htfTimes[j + 1]! + htfPeriodSec <= t
    ) {
      j += 1;
    }
    // Active HTF bar: last whose start <= t
    while (j + 1 < htfTimes.length && htfTimes[j + 1]! <= t) j += 1;
    if (j < htfFlags.length && htfTimes[j]! <= t) {
      flags[i] = htfFlags[j]!;
      sides[i] = htfSides[j]!;
    }
  }
  return { flags, sides };
}
