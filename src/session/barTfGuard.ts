import { timeframeSeconds } from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';

/**
 * True when consecutive bar spacing looks like `tf` (not a finer series
 * accidentally used as a placeholder — that draws 1m sawtooth on 1D replay).
 *
 * Uses the **median** in-session gap (ignores weekend / RTH overnight holes)
 * so futures like NQ are not rejected when the first sample window straddles
 * a session break.
 */
export function barsMatchTimeframe(
  bars: readonly ChartBar[],
  tf: Timeframe,
): boolean {
  if (bars.length < 3) return true;
  const period = timeframeSeconds(tf);
  if (!(period > 0)) return true;

  const n = Math.min(bars.length, 64);
  const gaps: number[] = [];
  // Gaps larger than this are session/weekend holes, not TF period.
  const maxSessionGap = period * 48;
  for (let i = 1; i < n; i++) {
    const d = bars[i]!.time - bars[i - 1]!.time;
    if (d > 0 && d <= maxSessionGap) gaps.push(d);
  }
  if (gaps.length === 0) return true;

  gaps.sort((a, b) => a - b);
  const median = gaps[gaps.length >> 1]!;
  // Reject clearly finer series (e.g. 1m drawn as 5m / 1D).
  // Reject clearly coarser placeholders (e.g. 1h used as 5m).
  // Median stays near `period` even when a few gaps are 2× (thin prints).
  return median >= period * 0.25 && median <= period * 2.5;
}
