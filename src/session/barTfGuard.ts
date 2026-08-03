import { timeframeSeconds } from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';

/**
 * True when consecutive bar spacing looks like `tf` (not a finer series
 * accidentally used as a placeholder — that draws 1m sawtooth on 1D replay).
 */
export function barsMatchTimeframe(
  bars: readonly ChartBar[],
  tf: Timeframe,
): boolean {
  if (bars.length < 3) return true;
  const period = timeframeSeconds(tf);
  const n = Math.min(bars.length, 24);
  let sum = 0;
  let count = 0;
  for (let i = 1; i < n; i++) {
    const d = bars[i]!.time - bars[i - 1]!.time;
    if (d > 0) {
      sum += d;
      count += 1;
    }
  }
  if (count === 0) return true;
  const avg = sum / count;
  // Reject clearly finer series (e.g. 1m drawn as 1D).
  // Allow weekends/gaps on daily (avg can be several× period).
  // Reject much coarser placeholders (e.g. 1h used as 5m).
  return avg >= period * 0.25 && avg <= period * 14;
}
