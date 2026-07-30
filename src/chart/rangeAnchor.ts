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
