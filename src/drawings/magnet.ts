import { indexAtOrBeforeBars } from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';
import type { DrawingPoint } from './drawingStore';

/** Snap price to nearest OHLC of the bar at `time`. */
export function magnetSnap(
  point: DrawingPoint,
  bars: readonly ChartBar[],
  enabled: boolean,
): DrawingPoint {
  if (!enabled || bars.length === 0) return point;
  const idx = indexAtOrBeforeBars(bars, point.time);
  const bar = bars[idx];
  if (!bar) return point;
  const candidates = [bar.open, bar.high, bar.low, bar.close];
  let best = candidates[0]!;
  let bestDist = Math.abs(point.price - best);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(point.price - candidates[i]!);
    if (d < bestDist) {
      bestDist = d;
      best = candidates[i]!;
    }
  }
  return { time: bar.time, price: best };
}
