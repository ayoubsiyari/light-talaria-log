import {
  logicalIndexAtTime,
  timeAtLogicalIndex,
} from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';
import type { DrawingPoint } from './drawingStore';

/**
 * Translate drawing anchors by a logical-index delta (paper / equal bar slots).
 *
 * Wall-clock `time + dt` stretches/squashes shapes across session gaps (NQ
 * overnight, FX weekends) because paint maps time → index non-linearly.
 */
export function translatePointsByLogical(
  points: readonly DrawingPoint[],
  bars: readonly ChartBar[],
  dIndex: number,
  dPrice: number,
): DrawingPoint[] {
  if (points.length === 0) return [];
  if (bars.length === 0 || (!Number.isFinite(dIndex) && !Number.isFinite(dPrice))) {
    return points.map((p) => ({ ...p }));
  }
  const di = Number.isFinite(dIndex) ? dIndex : 0;
  const dp = Number.isFinite(dPrice) ? dPrice : 0;
  if (di === 0 && dp === 0) return points.map((p) => ({ ...p }));

  return points.map((p) => {
    const originIndex = logicalIndexAtTime(bars, p.time);
    const nextTime = timeAtLogicalIndex(bars, originIndex + di) ?? p.time;
    return {
      time: nextTime,
      price: p.price + dp,
    };
  });
}

/** Logical span between two anchors (bar slots) — stable under translate. */
export function logicalSpan(
  a: DrawingPoint,
  b: DrawingPoint,
  bars: readonly ChartBar[],
): number {
  if (bars.length === 0) return 0;
  return Math.abs(
    logicalIndexAtTime(bars, b.time) - logicalIndexAtTime(bars, a.time),
  );
}
