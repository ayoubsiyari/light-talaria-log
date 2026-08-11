/**
 * Reject / repair empty/holiday/corrupt prints (common in futures CSV packs).
 *
 * ES 4h often ships low≈0 or low≈60 while O/H/C sit near 4800 — that is
 * **data**, not a Canvas bug. Rendering correctly draws the wick to that low
 * and auto-Y collapses. We repair before paint.
 */

/** Low below this fraction of the body is treated as pack corruption. */
const MIN_LOW_VS_BODY = 0.25;
/** High above body / this fraction is treated as pack corruption. */
const MAX_HIGH_VS_BODY = 0.25;

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

/**
 * True when the wick is implausibly far from the body (ES L=61 with C≈4800).
 * Real FX 100-pip bars and normal futures ranges stay well inside this gate.
 */
export function hasAbsurdWick(
  open: number,
  high: number,
  low: number,
  close: number,
): boolean {
  if (!isPositiveOhlc(open, high, low, close)) return true;
  const bodyLo = Math.min(open, close);
  const bodyHi = Math.max(open, close);
  if (low < bodyLo * MIN_LOW_VS_BODY) return true;
  if (high > bodyHi / MAX_HIGH_VS_BODY) return true;
  return false;
}

export function isValidOhlcBar(bar: {
  open: number;
  high: number;
  low: number;
  close: number;
}): boolean {
  return (
    isPositiveOhlc(bar.open, bar.high, bar.low, bar.close) &&
    !hasAbsurdWick(bar.open, bar.high, bar.low, bar.close)
  );
}

export interface OhlcFields {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Repair packed corruption: low/open = 0 or absurd near-zero lows (ES L=61).
 * Returns null when there is no usable positive price left.
 */
export function sanitizeOhlc(bar: OhlcFields): OhlcFields | null {
  if (isValidOhlcBar(bar)) return bar;

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

  const bodyLo = Math.min(open, close);
  const bodyHi = Math.max(open, close);

  if (!(high > 0) || high < bodyHi || high > bodyHi / MAX_HIGH_VS_BODY) {
    high = bodyHi;
  }
  if (!(low > 0) || low > bodyLo || low < bodyLo * MIN_LOW_VS_BODY) {
    low = bodyLo;
  }

  high = Math.max(high, open, close);
  low = Math.min(low, open, close);

  if (!isValidOhlcBar({ open, high, low, close })) return null;
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

/** Sanitize a viewport buffer (packed IDB may still hold bad lows). */
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
