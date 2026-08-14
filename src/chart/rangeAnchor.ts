import type { VisibleRange } from '@/types/bar';

/**
 * TradingView-style window: put `anchorIndex` (live / last candle) at the
 * horizontal center of the plot. History on the left, empty future on the right.
 */
export function rangeCenteredOnIndex(
  anchorIndex: number,
  visibleBars: number,
): VisibleRange {
  const span = Math.max(1, visibleBars);
  const fromIndex = anchorIndex + 0.5 - span / 2;
  return { fromIndex, toIndex: fromIndex + span };
}

/**
 * Keep a fixed candle count with the anchor near the right (~90% into the span).
 * Used on TF switches so bar width / place stay stable across intervals.
 */
export function rangeRightAnchored(
  anchorIndex: number,
  visibleBars: number,
): VisibleRange {
  const span = Math.max(1, visibleBars);
  const rightPad = Math.floor(span * 0.1);
  const toIndex = anchorIndex + 1 + rightPad;
  return { fromIndex: toIndex - span, toIndex };
}

/**
 * True when the series tip sits near the right edge of the viewport
 * (TV “stay on last bar” / end-lock). History pans fail this check so wheel
 * can zoom around the pointer instead.
 */
export function isViewportRightAnchoredOnTip(
  range: VisibleRange,
  barCount: number,
  slackBars = 3,
): boolean {
  if (barCount <= 0) return false;
  const tip = barCount - 1;
  const span = range.toIndex - range.fromIndex;
  if (!(span > 0)) return false;
  if (tip + slackBars < range.fromIndex || tip > range.toIndex + slackBars) {
    return false;
  }
  // Same model as rangeRightAnchored: tip just left of toIndex, small right pad.
  const distFromRight = range.toIndex - (tip + 1);
  const maxPad = Math.max(slackBars, span * 0.2);
  return distFromRight >= -slackBars && distFromRight <= maxPad;
}

/** Change visible span while pinning the current right edge (TV tip zoom). */
export function rangeZoomKeepRight(
  range: VisibleRange,
  nextSpan: number,
): VisibleRange {
  const span = Math.max(1, nextSpan);
  return { fromIndex: range.toIndex - span, toIndex: range.toIndex };
}
