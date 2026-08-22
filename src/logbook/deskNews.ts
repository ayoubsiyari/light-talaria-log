export type NewsCategory = 'forex' | 'general' | 'crypto';
export type NewsDay = 'today' | 'tomorrow';
export type NewsKind = 'headlines' | 'calendar';
export type NewsImpact = 'high' | 'medium' | 'low';

export interface DeskNewsFilter {
  category: NewsCategory;
  days: NewsDay[];
  kinds: NewsKind[];
  impact: NewsImpact[];
}

export const DEFAULT_NEWS_FILTER: DeskNewsFilter = {
  category: 'forex',
  days: ['today', 'tomorrow'],
  kinds: ['calendar'],
  impact: ['high', 'medium'],
};

export interface DeskHeadline {
  kind: 'headlines';
  id: string;
  day: NewsDay;
  time: number;
  title: string;
  source: string;
  url: string;
}

export interface DeskEvent {
  kind: 'calendar';
  id: string;
  day: NewsDay;
  time: number;
  title: string;
  country: string;
  flag: string;
  impact: NewsImpact;
  actual: string;
  estimate: string;
  prev: string;
}

export type DeskNewsItem = DeskHeadline | DeskEvent;

interface RawHeadline {
  id?: number | string;
  datetime?: number;
  headline?: string;
  source?: string;
  url?: string;
}

interface RawEvent {
  event?: string;
  title?: string;
  country?: string;
  impact?: string;
  time?: string;
  date?: string;
  actual?: string | number | null;
  estimate?: string | number | null;
  forecast?: string | number | null;
  prev?: string | number | null;
  previous?: string | number | null;
}

const COUNTRY_ISO: Record<string, string> = {
  UK: 'GB',
  GBR: 'GB',
  USA: 'US',
  EU: 'EU',
  EZ: 'EU',
  EA: 'EU',
  EMU: 'EU',
  USD: 'US',
  GBP: 'GB',
  EUR: 'EU',
  JPY: 'JP',
  AUD: 'AU',
  CAD: 'CA',
  NZD: 'NZ',
  CHF: 'CH',
  CNY: 'CN',
  CNH: 'CN',
  HKD: 'HK',
  SGD: 'SG',
  INR: 'IN',
  KRW: 'KR',
  MXN: 'MX',
  BRL: 'BR',
  ZAR: 'ZA',
  TRY: 'TR',
  SEK: 'SE',
  NOK: 'NO',
  DKK: 'DK',
};

export function localYmdFromDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayBounds(now: Date, which: NewsDay): { start: number; end: number; ymd: string } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (which === 'tomorrow') d.setDate(d.getDate() + 1);
  const start = Math.floor(d.getTime() / 1000);
  const end = start + 86400;
  return { start, end, ymd: localYmdFromDate(d) };
}

export function parseImpact(raw: string | undefined): NewsImpact | null {
  const v = (raw ?? '').toLowerCase();
  if (v === 'high' || v === '1') return 'high';
  if (v === 'medium' || v === 'med' || v === '2') return 'medium';
  if (v === 'low' || v === 'holiday' || v === '3') return 'low';
  return null;
}

export function formatStat(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return Number.isInteger(value)
      ? String(value)
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  const t = String(value).trim();
  return t.length > 0 ? t : '—';
}

export function countryFlag(code: string): string {
  const raw = code.trim().toUpperCase();
  const iso = COUNTRY_ISO[raw] ?? (raw.length === 2 ? raw : '');
  if (!/^[A-Z]{2}$/.test(iso)) return '';
  return String.fromCodePoint(...[...iso].map((c) => 127397 + c.charCodeAt(0)));
}

export function eventUnix(time: string | undefined): number | null {
  if (!time) return null;
  const t = time.trim().replace(' ', 'T');
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function classifyDay(unix: number, now: Date): NewsDay | null {
  const today = dayBounds(now, 'today');
  if (unix >= today.start && unix < today.end) return 'today';
  const tomorrow = dayBounds(now, 'tomorrow');
  if (unix >= tomorrow.start && unix < tomorrow.end) return 'tomorrow';
  return null;
}

export function normalizeHeadlines(raw: unknown, now: Date): DeskHeadline[] {
  if (!Array.isArray(raw)) return [];
  const out: DeskHeadline[] = [];
  for (const row of raw as RawHeadline[]) {
    const time = typeof row.datetime === 'number' ? row.datetime : 0;
    const day = classifyDay(time, now);
    if (!day) continue;
    const title = (row.headline ?? '').trim();
    if (!title) continue;
    out.push({
      kind: 'headlines',
      id: `h-${String(row.id ?? `${time}-${title}`)}`,
      day,
      time,
      title,
      source: (row.source ?? '').trim() || 'Finnhub',
      url: typeof row.url === 'string' ? row.url : '',
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function normalizeEvents(raw: unknown, now: Date): DeskEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: DeskEvent[] = [];
  for (const row of raw as RawEvent[]) {
    const unix = eventUnix(row.time ?? row.date);
    if (unix == null) continue;
    const day = classifyDay(unix, now);
    if (!day) continue;
    const title = (row.event ?? row.title ?? '').trim();
    if (!title) continue;
    const impact = parseImpact(row.impact) ?? 'medium';
    const country = (row.country ?? '').trim().toUpperCase() || '—';
    out.push({
      kind: 'calendar',
      id: `e-${country}-${unix}-${title}`,
      day,
      time: unix,
      title,
      country,
      flag: countryFlag(country),
      impact,
      actual: formatStat(row.actual),
      estimate: formatStat(row.estimate ?? row.forecast),
      prev: formatStat(row.prev ?? row.previous),
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function applyNewsFilter(items: DeskNewsItem[], filter: DeskNewsFilter): DeskNewsItem[] {
  const days = new Set(filter.days);
  const kinds = new Set(filter.kinds);
  const impact = new Set(filter.impact);
  return items.filter((item) => {
    if (!days.has(item.day)) return false;
    if (!kinds.has(item.kind)) return false;
    if (item.kind === 'calendar' && !impact.has(item.impact)) return false;
    return true;
  });
}

export function parseFilter(raw: unknown): DeskNewsFilter {
  if (!raw || typeof raw !== 'object') return DEFAULT_NEWS_FILTER;
  const o = raw as Record<string, unknown>;
  const category: NewsCategory =
    o.category === 'general' || o.category === 'crypto' || o.category === 'forex'
      ? o.category
      : 'forex';
  const days = Array.isArray(o.days)
    ? o.days.filter((d): d is NewsDay => d === 'today' || d === 'tomorrow')
    : DEFAULT_NEWS_FILTER.days;
  const kinds = Array.isArray(o.kinds)
    ? o.kinds.filter((k): k is NewsKind => k === 'headlines' || k === 'calendar')
    : DEFAULT_NEWS_FILTER.kinds;
  const impact = Array.isArray(o.impact)
    ? o.impact.filter((i): i is NewsImpact => i === 'high' || i === 'medium' || i === 'low')
    : DEFAULT_NEWS_FILTER.impact;
  return {
    category,
    days: days.length > 0 ? days : DEFAULT_NEWS_FILTER.days,
    kinds: kinds.length > 0 ? kinds : DEFAULT_NEWS_FILTER.kinds,
    impact: impact.length > 0 ? impact : DEFAULT_NEWS_FILTER.impact,
  };
}
