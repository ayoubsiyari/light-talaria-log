/**
 * Hash routes so refresh restores the current page without a router lib.
 * Vite serves index.html for `/`; deep links live in the hash.
 *
 *   #/                 landing
 *   #/sessions         sessions
 *   #/datasets         datasets
 *   #/journal          journal
 *   #/journal/:id      journal (prefer session)
 *   #/chart/:id        chart session
 *   #/chart/:id?t=&trade=  chart at unix time (journal deep link)
 *   #/404              not found (also any unknown path)
 */

export type AppView =
  | 'landing'
  | 'sessions'
  | 'datasets'
  | 'journal'
  | 'chart'
  | 'notFound';

export interface AppRoute {
  view: AppView;
  /** Chart or journal session id when present. */
  sessionId: string | null;
  /** Unix seconds — seek replay cursor after chart load (journal → chart). */
  focusTime?: number | null;
  /** Optional closed-trade / order id to highlight briefly. */
  focusTradeId?: string | null;
}

const DEFAULT_ROUTE: AppRoute = {
  view: 'landing',
  sessionId: null,
  focusTime: null,
  focusTradeId: null,
};

function parseQuery(rawHash: string): URLSearchParams {
  const q = rawHash.indexOf('?');
  if (q < 0) return new URLSearchParams();
  return new URLSearchParams(rawHash.slice(q + 1));
}

function parseFocusFromQuery(params: URLSearchParams): {
  focusTime: number | null;
  focusTradeId: string | null;
} {
  const tRaw = params.get('t');
  let focusTime: number | null = null;
  if (tRaw != null && tRaw !== '') {
    const n = Number(tRaw);
    if (Number.isFinite(n) && n > 0) focusTime = Math.floor(n);
  }
  const trade = params.get('trade');
  const focusTradeId =
    typeof trade === 'string' && trade.trim() ? trade.trim() : null;
  return { focusTime, focusTradeId };
}

function appendFocusQuery(
  base: string,
  focusTime: number | null | undefined,
  focusTradeId: string | null | undefined,
): string {
  const params = new URLSearchParams();
  if (focusTime != null && Number.isFinite(focusTime) && focusTime > 0) {
    params.set('t', String(Math.floor(focusTime)));
  }
  if (focusTradeId) params.set('trade', focusTradeId);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function parseAppRoute(hash: string = window.location.hash): AppRoute {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const { focusTime, focusTradeId } = parseFocusFromQuery(parseQuery(raw));

  if (parts.length === 0) return { ...DEFAULT_ROUTE };

  const head = parts[0]!;
  if (head === 'home' || head === 'landing') {
    return { view: 'landing', sessionId: null, focusTime: null, focusTradeId: null };
  }
  if (head === 'sessions') {
    return { view: 'sessions', sessionId: null, focusTime: null, focusTradeId: null };
  }
  if (head === 'datasets') {
    return { view: 'datasets', sessionId: null, focusTime: null, focusTradeId: null };
  }
  if (head === 'journal') {
    return {
      view: 'journal',
      sessionId: parts[1] ?? null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'chart' && parts[1]) {
    return {
      view: 'chart',
      sessionId: parts[1]!,
      focusTime,
      focusTradeId,
    };
  }
  if (head === 'chart') {
    return {
      view: 'sessions',
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === '404') {
    return {
      view: 'notFound',
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  return {
    view: 'notFound',
    sessionId: null,
    focusTime: null,
    focusTradeId: null,
  };
}

export function formatAppRoute(route: AppRoute): string {
  switch (route.view) {
    case 'landing':
      return '#/';
    case 'sessions':
      return '#/sessions';
    case 'datasets':
      return '#/datasets';
    case 'journal':
      return route.sessionId
        ? `#/journal/${encodeURIComponent(route.sessionId)}`
        : '#/journal';
    case 'chart': {
      if (!route.sessionId) return '#/sessions';
      const base = `#/chart/${encodeURIComponent(route.sessionId)}`;
      return appendFocusQuery(base, route.focusTime, route.focusTradeId);
    }
    case 'notFound':
      return '#/404';
    default:
      return '#/';
  }
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  return (
    a.view === b.view &&
    a.sessionId === b.sessionId &&
    (a.focusTime ?? null) === (b.focusTime ?? null) &&
    (a.focusTradeId ?? null) === (b.focusTradeId ?? null)
  );
}
