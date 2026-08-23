/**
 * Daily session anchors by market — not wall-clock UTC midnight.
 *
 * - Forex / spot metals: NY 17:00 → next 17:00 (TradingView FX D1). Sunday
 *   reopen after Fri close belongs to Monday’s candle (no Sunday D1).
 * - Equity-index futures (CME Globex style): Chicago 17:00 → next 17:00.
 * - Crypto (24/7): UTC midnight (unchanged).
 *
 * Bar `time` = session **open** unix. Intraday TFs stay on UTC grids.
 */
import { matchFuturesRoot } from '@/orders/futuresSpec';

export type DailySessionKind = 'fx_ny' | 'futures_cme' | 'utc';

const CRYPTO_RE =
  /^(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|DOT|AVAX|LINK|MATIC|UNI)(USD|USDT|USDC)?$/;
const CRYPTO_SUFFIX_RE =
  /^(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|DOT|AVAX|LINK|MATIC|UNI).*(USDT|USDC|USD|PERP|SWAP)$/;

function compactSymbol(symbol: string): string {
  return String(symbol || '')
    .replace(/[\s/\-_.]/g, '')
    .toUpperCase();
}

/** Resolve daily session policy from a pair / root symbol. */
export function inferDailySessionKind(
  symbol?: string | null,
): DailySessionKind {
  if (!symbol?.trim()) return 'utc';
  const u = compactSymbol(symbol);
  if (!u) return 'utc';
  if (CRYPTO_RE.test(u) || CRYPTO_SUFFIX_RE.test(u)) return 'utc';
  if (matchFuturesRoot(symbol)) return 'futures_cme';
  // Spot FX + XAU/XAG and anything else treated as FX in this app.
  return 'fx_ny';
}

export function usesSessionDaily(kind: DailySessionKind): boolean {
  return kind === 'fx_ny' || kind === 'futures_cme';
}

function ianaForKind(kind: DailySessionKind): string {
  if (kind === 'futures_cme') return 'America/Chicago';
  return 'America/New_York';
}

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedPartsUnix(unixSec: number, timeZone: string): ZoneParts {
  const d = new Date(unixSec * 1000);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  let hour = Number(map.hour ?? 0);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute ?? 0),
    second: Number(map.second ?? 0),
  };
}

/** Wall-clock in IANA zone → UTC unix seconds (DST-aware). */
export function wallClockToUnixSec(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  timeZone: string,
): number {
  if (timeZone === 'UTC') {
    return Math.floor(Date.UTC(y, mo - 1, d, hh, mm, ss, 0) / 1000);
  }
  const desired = Date.UTC(y, mo - 1, d, hh, mm, ss, 0);
  let t = desired;
  for (let i = 0; i < 4; i++) {
    const wall = zonedPartsUnix(t / 1000, timeZone);
    const wallAsUtc = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
      0,
    );
    const delta = desired - wallAsUtc;
    if (delta === 0) break;
    t += delta;
  }
  return Math.floor(t / 1000);
}

function addCalendarDays(y: number, mo: number, d: number, delta: number): {
  y: number;
  mo: number;
  d: number;
} {
  const dt = new Date(Date.UTC(y, mo - 1, d + delta));
  return {
    y: dt.getUTCFullYear(),
    mo: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

const SESSION_CLOSE_HOUR = 17;

/**
 * Open unix of the trading day that contains `unixSec`.
 * Half-open sessions: [open, nextOpen). Exactly 17:00 starts the new day.
 */
export function sessionDayBucketStart(
  unixSec: number,
  kind: DailySessionKind,
): number {
  if (!Number.isFinite(unixSec)) return 0;
  if (kind === 'utc') {
    return Math.floor(unixSec / 86_400) * 86_400;
  }
  const tz = ianaForKind(kind);
  const wall = zonedPartsUnix(unixSec, tz);
  const mins = wall.hour * 60 + wall.minute;
  const closeMins = SESSION_CLOSE_HOUR * 60;
  let y = wall.year;
  let mo = wall.month;
  let d = wall.day;
  // Before 17:00 → still previous session (opened yesterday 17:00).
  // Exactly 17:00 starts the new day (half-open [open, nextOpen)).
  if (mins < closeMins) {
    const prev = addCalendarDays(y, mo, d, -1);
    y = prev.y;
    mo = prev.mo;
    d = prev.d;
  }
  return wallClockToUnixSec(y, mo, d, SESSION_CLOSE_HOUR, 0, 0, tz);
}

/** Exclusive end = next session open (handles DST 23h/25h days). */
export function sessionDayBucketEnd(
  bucketOpen: number,
  kind: DailySessionKind,
): number {
  if (kind === 'utc') return bucketOpen + 86_400;
  const tz = ianaForKind(kind);
  const wall = zonedPartsUnix(bucketOpen, tz);
  const next = addCalendarDays(wall.year, wall.month, wall.day, 1);
  return wallClockToUnixSec(
    next.y,
    next.mo,
    next.d,
    SESSION_CLOSE_HOUR,
    0,
    0,
    tz,
  );
}

/** Convenience: open for a symbol (defaults to UTC when unknown). */
export function dailyBucketStart(
  unixSec: number,
  symbol?: string | null,
): number {
  return sessionDayBucketStart(unixSec, inferDailySessionKind(symbol));
}

export function dailyBucketEnd(
  bucketOpen: number,
  symbol?: string | null,
): number {
  return sessionDayBucketEnd(bucketOpen, inferDailySessionKind(symbol));
}
