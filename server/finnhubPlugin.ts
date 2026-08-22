import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin, Connect } from 'vite';

const UPSTREAM = 'https://finnhub.io/api/v1';
const FX_CALENDAR = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CACHE_MS = 5 * 60_000;
const NEWS_CATS = new Set(['general', 'forex', 'crypto', 'merger']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FX_DISK = path.join(os.tmpdir(), 'talaria-desk-calendar.json');
const FX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const cache = new Map<string, { at: number; body: string; status: number }>();
let configuredKey = '';
let finnhubCalBlocked = false;

function token(): string {
  return (process.env.FINNHUB_API_KEY || configuredKey || '').trim();
}

function sendJson(res: Connect.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');
  res.end(JSON.stringify(body));
}

function finnhubCalendarItems(up: { status: number; body: string }): unknown[] {
  if (up.status >= 400) return [];
  try {
    const parsed = JSON.parse(up.body) as { economicCalendar?: unknown };
    const items = parsed.economicCalendar ?? parsed;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function mapFxEvent(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (!title) return null;
  return {
    event: title,
    country: typeof o.country === 'string' ? o.country : '',
    impact: typeof o.impact === 'string' ? o.impact.toLowerCase() : '',
    time: typeof o.date === 'string' ? o.date : '',
    actual: o.actual ?? '',
    estimate: o.forecast ?? o.estimate ?? '',
    prev: o.previous ?? o.prev ?? '',
  };
}

function itemsFromFxBody(text: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map(mapFxEvent).filter((row): row is Record<string, unknown> => row != null);
  } catch {
    return null;
  }
}

function readFxDisk(): string | null {
  try {
    return fs.readFileSync(FX_DISK, 'utf8');
  } catch {
    return null;
  }
}

function writeFxDisk(text: string): void {
  try {
    fs.writeFileSync(FX_DISK, text);
  } catch {
    /* ignore */
  }
}

async function fetchFxCalendar(): Promise<{ status: number; items: Record<string, unknown>[] }> {
  const hit = cache.get('ff-week');
  if (hit && Date.now() - hit.at < CACHE_MS) {
    const cached = itemsFromFxBody(hit.body);
    if (cached && cached.length > 0) return { status: 200, items: cached };
  }
  try {
    const res = await fetch(FX_CALENDAR, {
      headers: { Accept: 'application/json', 'User-Agent': FX_UA },
    });
    const text = await res.text();
    const fresh = res.ok ? itemsFromFxBody(text) : null;
    if (fresh && fresh.length > 0) {
      cache.set('ff-week', { at: Date.now(), body: text, status: 200 });
      writeFxDisk(text);
      return { status: 200, items: fresh };
    }
  } catch {
    /* stale below */
  }
  const staleText = hit?.body ?? readFxDisk();
  const stale = staleText ? itemsFromFxBody(staleText) : null;
  if (stale && stale.length > 0) return { status: 200, items: stale };
  return { status: 502, items: [] };
}

async function finnhubGet(pathAndQuery: string): Promise<{ status: number; body: string }> {
  const hit = cache.get(pathAndQuery);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const key = token();
  if (!key) {
    return { status: 503, body: JSON.stringify({ ok: false, error: 'missing-key' }) };
  }
  const url = `${UPSTREAM}${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}token=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  const packed = { at: Date.now(), body: text, status: res.status };
  if (res.ok) cache.set(pathAndQuery, packed);
  return packed;
}

async function handle(req: Connect.IncomingMessage, res: Connect.ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = url.pathname;

  try {
    if (route === '/api/finnhub/news') {
      const category = url.searchParams.get('category') ?? 'forex';
      if (!NEWS_CATS.has(category)) {
        sendJson(res, 400, { ok: false, error: 'category' });
        return;
      }
      const up = await finnhubGet(`/news?category=${encodeURIComponent(category)}`);
      if (up.status === 503) {
        sendJson(res, 503, JSON.parse(up.body));
        return;
      }
      if (up.status >= 400) {
        sendJson(res, 502, { ok: false, error: 'upstream' });
        return;
      }
      const parsed = JSON.parse(up.body) as unknown;
      sendJson(res, 200, { ok: true, items: parsed });
      return;
    }

    if (route === '/api/finnhub/calendar') {
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';
      if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
        sendJson(res, 400, { ok: false, error: 'dates' });
        return;
      }
      if (!finnhubCalBlocked) {
        const up = await finnhubGet(
          `/calendar/economic?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        if (up.status === 401 || up.status === 403) finnhubCalBlocked = true;
        const finnhubItems = finnhubCalendarItems(up);
        if (finnhubItems.length > 0) {
          sendJson(res, 200, { ok: true, source: 'finnhub', items: finnhubItems });
          return;
        }
      }
      const fx = await fetchFxCalendar();
      if (fx.items.length === 0) {
        sendJson(res, 502, { ok: false, error: 'upstream' });
        return;
      }
      sendJson(res, 200, { ok: true, source: 'calendar', items: fx.items });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not-found' });
  } catch {
    sendJson(res, 502, { ok: false, error: 'upstream' });
  }
}

function attach(middlewares: Connect.Server): void {
  middlewares.use((req, res, next) => {
    const path = req.url?.split('?')[0] ?? '';
    if (!path.startsWith('/api/finnhub/')) {
      next();
      return;
    }
    void handle(req, res);
  });
}

/** Vite middleware: GET /api/finnhub/news|calendar → Finnhub (key stays on the server). */
export function finnhubApiPlugin(apiKey = ''): Plugin {
  configuredKey = apiKey;
  return {
    name: 'fast-chart-finnhub-api',
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}
