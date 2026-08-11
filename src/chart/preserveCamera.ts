import type { ChartBar, VisibleRange } from '@/types/bar';
import {
  logicalIndexAtTime,
  visibleRangeFromTimeWindow,
} from '@/data/timeframeAgg';
import { VISIBLE_BARS_TARGET } from '@/utils/constants';
import { DEFAULT_VISIBLE_BARS } from './interaction';
import { rangeRightAnchored } from './rangeAnchor';

/** Camera capture used across TF / symbol switches. */
export interface PreservedCamera {
  fromTime?: number;
  toTime?: number;
  anchorTime?: number;
}

const MIN_VISIBLE_BARS = 8;

/** How many real bars sit inside a logical viewport (pads excluded). */
export function visibleBarsInRange(
  barsLen: number,
  range: VisibleRange,
): number {
  if (barsLen <= 0 || range.toIndex <= range.fromIndex) return 0;
  const tip = barsLen - 1;
  const lo = Math.max(0, Math.floor(range.fromIndex));
  const hi = Math.min(tip, Math.ceil(range.toIndex) - 1);
  if (hi < lo) return 0;
  return hi - lo + 1;
}

/**
 * Map a preserved camera onto a new TF buffer.
 *
 * Prefer wall-clock window (1m→15m keeps the same time span so candles fill
 * the plot). Bar-count-only zoom on a coarser TF left a thin tip / empty pad
 * and looked like a blank chart.
 */
export function preservedVisibleRange(
  bars: readonly ChartBar[],
  preserved: PreservedCamera | null,
  span: number,
  tipRatio: number,
): VisibleRange {
  if (bars.length === 0) return { fromIndex: 0, toIndex: 1 };

  const tip = bars.length - 1;
  // Match engine pan MAX_VISIBLE so preserve never leaves a span that the
  // first drag will clamp (visible jump after coarser→finer TF).
  const spanSafe = Math.max(10, Math.min(VISIBLE_BARS_TARGET, span));
  // tipRatio≤0 means the old viewport sat entirely past the tip → blank plot.
  const tipRatioSafe =
    Number.isFinite(tipRatio) && tipRatio > 0.05
      ? Math.min(1.2, tipRatio)
      : 0.9;

  let range: VisibleRange;

  if (
    preserved?.fromTime != null &&
    preserved?.toTime != null &&
    Number.isFinite(preserved.fromTime) &&
    Number.isFinite(preserved.toTime) &&
    preserved.toTime > preserved.fromTime
  ) {
    range = visibleRangeFromTimeWindow(
      bars,
      preserved.fromTime,
      preserved.toTime,
    );
  } else if (
    tipRatioSafe > 1.001 &&
    preserved?.toTime != null &&
    Number.isFinite(preserved.toTime)
  ) {
    const toIndex = logicalIndexAtTime(bars, preserved.toTime);
    range = { fromIndex: toIndex - spanSafe, toIndex };
  } else {
    const anchorTime =
      preserved?.anchorTime ?? preserved?.toTime ?? bars[tip]!.time;
    const anchorIndex = Math.min(tip, logicalIndexAtTime(bars, anchorTime));
    const fromIndex = anchorIndex - tipRatioSafe * spanSafe;
    range = { fromIndex, toIndex: fromIndex + spanSafe };
  }

  let spanNow = range.toIndex - range.fromIndex;
  // Wall-clock remap (1h→5m) can exceed pan MAX_VISIBLE — shrink keeping the
  // right edge so the first drag does not clamp/jump.
  if (spanNow > VISIBLE_BARS_TARGET) {
    range = {
      fromIndex: range.toIndex - VISIBLE_BARS_TARGET,
      toIndex: range.toIndex,
    };
    spanNow = VISIBLE_BARS_TARGET;
  }

  const visible = visibleBarsInRange(bars.length, range);
  // Tip-only / short 15m buffers: wall-clock can map to a huge empty pad with
  // candles crushed on the right — fit zoom to the bars we actually have.
  const crushed =
    visible > 0 && spanNow > 0 && visible / spanNow < 0.2;
  if (visible < MIN_VISIBLE_BARS || crushed) {
    const fitted = Math.max(10, Math.ceil((tip + 1) / 0.85));
    const fallbackSpan = Math.max(
      10,
      Math.min(spanSafe, Math.max(fitted, Math.min(DEFAULT_VISIBLE_BARS, tip + 1))),
    );
    return rangeRightAnchored(tip, fallbackSpan);
  }
  return range;
}
