import { indexAtOrBeforeBars } from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';
import type { DrawingPoint } from './drawingStore';

/** Drawing magnet: off, proximity snap (weak), or always OHLC (strong). */
export type MagnetMode = 'off' | 'weak' | 'strong';

export function normalizeMagnetMode(mode: MagnetMode | boolean | undefined): MagnetMode {
  if (mode === true) return 'strong';
  if (mode === false || mode == null) return 'off';
  return mode;
}

/** Cycle toolbar: off → weak → strong → off. */
export function nextMagnetMode(mode: MagnetMode): MagnetMode {
  if (mode === 'off') return 'weak';
  if (mode === 'weak') return 'strong';
  return 'off';
}

export function magnetModeLabel(mode: MagnetMode): string {
  if (mode === 'weak') return 'Magnet · weak';
  if (mode === 'strong') return 'Magnet · strong';
  return 'Magnet · off';
}

/**
 * Snap a drawing anchor to the nearest bar OHLC.
 * - strong: always snap time + nearest O/H/L/C
 * - weak: snap only when price is within ~35% of that bar's range
 */
export function magnetSnap(
  point: DrawingPoint,
  bars: readonly ChartBar[],
  mode: MagnetMode | boolean,
): DrawingPoint {
  const m = normalizeMagnetMode(mode);
  if (m === 'off' || bars.length === 0) return point;

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

  if (m === 'weak') {
    const range = Math.abs(bar.high - bar.low);
    const threshold = range > 0 ? range * 0.35 : Math.abs(bar.close) * 1e-4;
    if (bestDist > threshold) {
      // Still park X on the bar (TV weak snaps X when near a candle).
      return { time: bar.time, price: point.price };
    }
  }

  return { time: bar.time, price: best };
}
