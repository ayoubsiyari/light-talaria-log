/**
 * Chart display timezone — labels / HUD / Go To wall-clock.
 * Bar timestamps in storage stay unix UTC; only presentation converts.
 */
import { getAppearance } from '@/chart/appearanceStore';
import type { ChartTimezoneId } from '@/types/chartAppearance';

export type { ChartTimezoneId };

export interface ChartTimezoneOption {
  id: ChartTimezoneId;
  label: string;
  short: string;
}

export const CHART_TIMEZONES: readonly ChartTimezoneOption[] = [
  { id: 'utc', label: 'UTC', short: 'UTC' },
  { id: 'local', label: 'Local (browser)', short: 'Local' },
  { id: 'America/New_York', label: 'New York (US/Eastern)', short: 'NY' },
  { id: 'Europe/London', label: 'London', short: 'LON' },
  { id: 'Europe/Berlin', label: 'Berlin / Frankfurt', short: 'BER' },
  { id: 'Asia/Tokyo', label: 'Tokyo', short: 'TYO' },
  { id: 'Asia/Singapore', label: 'Singapore', short: 'SGP' },
  { id: 'Australia/Sydney', label: 'Sydney', short: 'SYD' },
] as const;

export function isChartTimezoneId(v: unknown): v is ChartTimezoneId {
  return (
    typeof v === 'string' &&
    CHART_TIMEZONES.some((z) => z.id === v)
  );
}

export function getChartTimezone(): ChartTimezoneId {
  const tz = getAppearance().timezone;
  return isChartTimezoneId(tz) ? tz : 'utc';
}

export function timezoneOption(id: ChartTimezoneId): ChartTimezoneOption {
  return CHART_TIMEZONES.find((z) => z.id === id) ?? CHART_TIMEZONES[0]!;
}

/** IANA id for Intl, or undefined = browser local. */
export function resolveIanaTimeZone(id: ChartTimezoneId = getChartTimezone()): string | undefined {
  if (id === 'utc') return 'UTC';
  if (id === 'local') return undefined;
  return id;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

export function zonedParts(
  unixSec: number,
  id: ChartTimezoneId = getChartTimezone(),
): ZonedParts {
  const d = new Date(unixSec * 1000);
  const timeZone = resolveIanaTimeZone(id);
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
    hourCycle: 'h23',
  };
  if (timeZone) opts.timeZone = timeZone;
  const fmt = new Intl.DateTimeFormat('en-US', opts);
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // en-US can yield "24" for hour with hourCycle h23 on some engines — clamp.
  let hour = Number(map.hour ?? 0);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute ?? 0),
    second: Number(map.second ?? 0),
    weekday: map.weekday ?? '',
  };
}

/** Axis label: MM-DD HH:mm in the active display zone. */
export function formatZonedTime(
  unixSec: number,
  id: ChartTimezoneId = getChartTimezone(),
): string {
  if (!Number.isFinite(unixSec)) return '—';
  const p = zonedParts(unixSec, id);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  const hh = String(p.hour).padStart(2, '0');
  const mi = String(p.minute).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** Crosshair: Mo MM-DD HH:mm */
export function formatZonedCrosshairTime(
  unixSec: number,
  id: ChartTimezoneId = getChartTimezone(),
): string {
  if (!Number.isFinite(unixSec)) return '—';
  const p = zonedParts(unixSec, id);
  const dow = (p.weekday || '').slice(0, 2);
  return `${dow} ${formatZonedTime(unixSec, id)}`;
}

/** Bottom HUD clock HH:mm:ss */
export function formatZonedClockHms(
  unixSec: number,
  id: ChartTimezoneId = getChartTimezone(),
): string {
  if (!(unixSec > 0)) return '—';
  const p = zonedParts(unixSec, id);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`;
}

/** YYYY-MM-DD in display zone (Go To / date fields). */
export function formatZonedDateIso(
  unixSec: number,
  id: ChartTimezoneId = getChartTimezone(),
): string {
  const now = Number.isFinite(unixSec) && unixSec > 0 ? unixSec : Date.now() / 1000;
  const p = zonedParts(now, id);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Wall-clock in zone → UTC epoch ms.
 * Used by Go To (`window.timezoneManager.wallClockToUtcMillis`).
 */
export function wallClockToUtcMillis(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  ss = 0,
  id: ChartTimezoneId = getChartTimezone(),
): number {
  if (id === 'utc') {
    return Date.UTC(y, mo - 1, d, hh, mm, ss, 0);
  }
  if (id === 'local') {
    return new Date(y, mo - 1, d, hh, mm, ss, 0).getTime();
  }
  const iana = resolveIanaTimeZone(id)!;
  const desired = Date.UTC(y, mo - 1, d, hh, mm, ss, 0);
  let t = desired;
  for (let i = 0; i < 4; i++) {
    const wall = zonedParts(t / 1000, id);
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
  // Validate zone exists (throws on bad IANA in some engines).
  void iana;
  return t;
}

/**
 * Date whose UTC getters mirror wall-clock in the display zone.
 * Matches V9 `formatV9HudDateLineTitle(ms, convertToTimezone)`.
 */
export function convertToTimezoneDate(
  ms: number,
  id: ChartTimezoneId = getChartTimezone(),
): Date {
  const p = zonedParts(ms / 1000, id);
  return new Date(
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0),
  );
}

/** Bridge for V9 Go To helpers (`window.timezoneManager`). */
export const timezoneManager = {
  getId: () => getChartTimezone(),
  getShortLabel: () => timezoneOption(getChartTimezone()).short,
  convertToTimezone: (ms: number) => convertToTimezoneDate(ms),
  wallClockToUtcMillis: (
    y: number,
    mo: number,
    d: number,
    hh: number,
    mm: number,
    ss = 0,
  ) => wallClockToUtcMillis(y, mo, d, hh, mm, ss),
  getOffsetMs: () => {
    // Legacy helper path in gotoMenuHelpers — prefer wallClockToUtcMillis.
    const now = Date.now();
    const wall = convertToTimezoneDate(now);
    return wall.getTime() - now;
  },
};

export function installTimezoneManager(): void {
  if (typeof window === 'undefined') return;
  (
    window as Window & { timezoneManager?: typeof timezoneManager }
  ).timezoneManager = timezoneManager;
}
