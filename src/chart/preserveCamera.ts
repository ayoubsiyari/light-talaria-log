import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import {
  logicalIndexAtTime,
  timeframeSeconds,
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
  span?: number;
}

/**
 * Convert live bar zoom into the target TF's bar count.
 * Always prefer the same candle density (bar count). Coarser TF used to shrink
 * by wall-clock (120×1m → 16×15m fat candles); finer TF blew out by wall-clock
 * (120×5m → ~600×1m). Keep `camera.span` both ways; only pad coarser when
 * wall-clock needs slightly more bars than the old count.
 */
export function cameraSpanForTf(
  camera: { span: number; fromTime?: number; toTime?: number },
  fromTf: Timeframe,
  toTf: Timeframe,
): number {
  const fromSec = Math.max(1, timeframeSeconds(fromTf));
  const toSec = Math.max(1, timeframeSeconds(toTf));
  const wallSec =
    camera.fromTime != null &&
    camera.toTime != null &&
    camera.toTime > camera.fromTime
      ? camera.toTime - camera.fromTime
      : camera.span * fromSec;
  const wallBars = Math.ceil(wallSec / toSec) + 8;
  const span =
    toSec > fromSec
      ? Math.max(wallBars, camera.span) // coarser: never fewer candles than now
      : camera.span; // finer: same candle count (not wall-clock zoom-out)
  return Math.max(10, Math.min(VISIBLE_BARS_TARGET, span));
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
  // Short HTF buffer after 1m→4h: do NOT shrink span to fit the few bars we
  // have — that made candles huge. Keep the preserved bar count (left pad
  // empty until history heals). Only fall back when we have almost no bars.
  if (visible < MIN_VISIBLE_BARS && tip + 1 < MIN_VISIBLE_BARS) {
    const fitted = Math.max(10, Math.ceil((tip + 1) / 0.85));
    const fallbackSpan = Math.max(
      10,
      Math.min(spanSafe, Math.max(fitted, Math.min(DEFAULT_VISIBLE_BARS, tip + 1))),
    );
    return rangeRightAnchored(tip, fallbackSpan);
  }
  if (visible < MIN_VISIBLE_BARS || (visible > 0 && spanNow > 0 && visible / spanNow < 0.2)) {
    return rangeRightAnchored(tip, spanSafe);
  }
  return range;
}
