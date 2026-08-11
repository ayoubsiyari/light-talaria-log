/**
 * Reject / repair empty/holiday/corrupt prints (common in futures CSV packs).
 * A single open/low ≈ 0 on ES/NQ crushes auto-Y to 0→6000 (“comb” wicks).
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

export interface OhlcFields {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Repair common packed-HTF corruption: low/open = 0 while close stays real.
 * Returns null when there is no usable positive price left.
 */
export function sanitizeOhlc(bar: OhlcFields): OhlcFields | null {
  if (isPositiveOhlc(bar.open, bar.high, bar.low, bar.close)) {
    return bar;
  }
  let open = bar.open;
  let high = bar.high;
  let low = bar.low;
  let close = bar.close;

  // Prefer close as the anchor (last trade).
  if (!(close > 0)) {
    if (open > 0) close = open;
    else if (high > 0) close = high;
    else return null;
  }
  if (!(open > 0)) open = close;
  if (!(high > 0)) high = Math.max(open, close);
  if (!(low > 0)) low = Math.min(open, close);

  high = Math.max(high, open, close);
  low = Math.min(low, open, close);

  if (!isPositiveOhlc(open, high, low, close)) return null;
  return { open, high, low, close };
}

/** Sanitize a full chart bar; drop when unrecoverable. */
export function sanitizeChartBar<T extends OhlcFields & { time: number }>(
  bar: T,
): T | null {
  const ohlc = sanitizeOhlc(bar);
  if (!ohlc) return null;
  if (
    ohlc.open === bar.open &&
    ohlc.high === bar.high &&
    ohlc.low === bar.low &&
    ohlc.close === bar.close
  ) {
    return bar;
  }
  return { ...bar, ...ohlc };
}

/** In-place sanitize of a viewport buffer (packed IDB may still hold zeros). */
export function sanitizeChartBars<T extends OhlcFields & { time: number }>(
  bars: readonly T[],
): T[] {
  if (bars.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < bars.length; i++) {
    const next = sanitizeChartBar(bars[i]!);
    if (next) out.push(next);
  }
  return out;
}
