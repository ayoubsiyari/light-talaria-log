/**
 * Reject empty/holiday/corrupt prints (common in futures CSV packs).
 * A single open/low ≈ 0 on ES/NQ crushes auto-Y to 0→6000.
 */

export function isPositiveOhlc(
  open: number,
  high: number,
  low: number,
  close: number,
): boolean {
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return false;
  }
  // Prices must be strictly positive (FX/futures never trade at 0).
  if (!(open > 0 && high > 0 && low > 0 && close > 0)) return false;
  if (high < low) return false;
  if (high < Math.max(open, close)) return false;
  if (low > Math.min(open, close)) return false;
  return true;
}

export function isValidOhlcBar(bar: {
  open: number;
  high: number;
  low: number;
  close: number;
}): boolean {
  return isPositiveOhlc(bar.open, bar.high, bar.low, bar.close);
}
