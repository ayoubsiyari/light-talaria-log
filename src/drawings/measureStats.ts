import { indexAtOrBeforeBars } from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';

export interface MeasureStats {
  deltaPrice: number;
  pct: number;
  bars: number;
  elapsedSec: number;
}

export function computeMeasureStats(
  t0: number,
  p0: number,
  t1: number,
  p1: number,
  bars: readonly ChartBar[],
): MeasureStats {
  const deltaPrice = p1 - p0;
  const pct = p0 !== 0 ? (deltaPrice / p0) * 100 : 0;
  const elapsedSec = Math.abs(t1 - t0);
  let barCount = 0;
  if (bars.length > 0) {
    const i0 = indexAtOrBeforeBars(bars, Math.min(t0, t1));
    const i1 = indexAtOrBeforeBars(bars, Math.max(t0, t1));
    barCount = Math.max(0, i1 - i0);
  }
  return { deltaPrice, pct, bars: barCount, elapsedSec };
}

export function formatElapsed(sec: number): string {
  if (sec < 60) return `${Math.max(0, Math.round(sec))}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) {
    const h = sec / 3600;
    return `${h >= 10 ? Math.round(h) : h.toFixed(1)}h`;
  }
  const d = sec / 86400;
  return `${d >= 10 ? Math.round(d) : d.toFixed(1)}d`;
}

/** Compact multi-stat label for the measure box center. */
export function formatMeasureLabel(stats: MeasureStats, digits = 2): string {
  const sign = stats.deltaPrice > 0 ? '+' : '';
  const price = `${sign}${stats.deltaPrice.toFixed(digits)}`;
  const pct = `${sign}${stats.pct.toFixed(2)}%`;
  const bars = `${stats.bars} bar${stats.bars === 1 ? '' : 's'}`;
  const time = formatElapsed(stats.elapsedSec);
  return `${price}  ${pct}  ·  ${bars}  ·  ${time}`;
}
