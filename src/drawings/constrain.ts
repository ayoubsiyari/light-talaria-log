import {
  logicalIndexAtTime,
  timeAtLogicalIndex,
} from '@/data/timeframeAgg';
import type { ChartBar } from '@/types/bar';
import type { DrawingPoint } from './drawingStore';
import type { DrawingToolId } from './toolRegistry';
import { getTool } from './toolRegistry';

/** Tools where Shift constrains the second (or later) point to H / V / 45°. */
export function toolSupportsShiftConstrain(tool: DrawingToolId): boolean {
  const mode = getTool(tool).points;
  if (mode.kind !== 'fixed' || mode.count < 2) return false;
  // Single-click axis tools don't need constrain.
  if (
    tool === 'hline' ||
    tool === 'vline' ||
    tool === 'crossLine' ||
    tool === 'horizontalRay'
  ) {
    return false;
  }
  return true;
}

function medianBarRange(bars: readonly ChartBar[]): number {
  if (bars.length === 0) return 1;
  const samples: number[] = [];
  const n = Math.min(bars.length, 40);
  const start = Math.max(0, bars.length - n);
  for (let i = start; i < bars.length; i++) {
    const b = bars[i]!;
    const r = Math.abs(b.high - b.low);
    if (r > 0) samples.push(r);
  }
  if (samples.length === 0) {
    const c = Math.abs(bars[bars.length - 1]!.close);
    return c > 0 ? c * 0.001 : 1;
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]! || 1;
}

/**
 * Shift-constrain `to` relative to `from` (TV: horizontal / vertical / 45°).
 * Uses bar-index vs price-range normalization so angles feel right on screen.
 */
export function shiftConstrainPoint(
  from: DrawingPoint,
  to: DrawingPoint,
  bars: readonly ChartBar[],
): DrawingPoint {
  if (bars.length === 0) return to;

  const i0 = logicalIndexAtTime(bars, from.time);
  const i1 = logicalIndexAtTime(bars, to.time);
  const di = i1 - i0;
  const dp = to.price - from.price;
  const unit = medianBarRange(bars);
  const nx = di;
  const ny = unit > 0 ? dp / unit : dp;

  const absX = Math.abs(nx);
  const absY = Math.abs(ny);

  // Near-horizontal
  if (absY < absX * 0.414) {
    // tan(22.5°) ≈ 0.414
    return { time: to.time, price: from.price };
  }
  // Near-vertical
  if (absX < absY * 0.414) {
    return { time: from.time, price: to.price };
  }

  // 45° — equal steps in normalized space
  const signX = nx === 0 ? (ny >= 0 ? 1 : -1) : Math.sign(nx);
  const signY = ny === 0 ? (nx >= 0 ? 1 : -1) : Math.sign(ny);
  const mag = Math.max(absX, absY);
  const nextIdx = i0 + signX * mag;
  const nextTime = timeAtLogicalIndex(bars, nextIdx);
  return {
    time: nextTime ?? to.time,
    price: from.price + signY * mag * unit,
  };
}

/**
 * Apply Shift constrain when placing the 2nd+ point of a line-like tool.
 * `existing` are already committed anchors; `point` is the candidate.
 */
export function applyShiftConstrainIfNeeded(
  tool: DrawingToolId,
  existing: readonly DrawingPoint[],
  point: DrawingPoint,
  bars: readonly ChartBar[],
  shiftHeld: boolean,
): DrawingPoint {
  if (!shiftHeld || !toolSupportsShiftConstrain(tool) || existing.length === 0) {
    return point;
  }
  return shiftConstrainPoint(existing[0]!, point, bars);
}
