/**
 * Hash routes so refresh restores the current page without a router lib.
 * Vite serves index.html for `/`; deep links live in the hash.
 *
 *   #/                      landing
 *   #/app                   app shell (dashboard)
 *   #/app/dashboard|backtest|journal|strategy|profile
 *   #/sessions              → app/backtest (bookmark compat)
 *   #/datasets              datasets
 *   #/journal               → app/journal (bookmark compat)
 *   #/journal/:id           → app/journal + session id
 *   #/chart/:id             chart session
 *   #/chart/:id?t=&trade=   chart at unix time (journal deep link)
 *   #/404                   not found
 */

export type AppTab =
  | 'dashboard'
  | 'backtest'
  | 'journal'
  | 'strategy'
  | 'profile';

export type AppView =
  | 'landing'
  | 'app'
  | 'datasets'
  | 'chart'
  | 'notFound';

export interface AppRoute {
  view: AppView;
  /** Active tab when view === 'app'. */
  appTab: AppTab | null;
  /** Chart or journal session id when present. */
  sessionId: string | null;
  /** Unix seconds — seek replay cursor after chart load (journal → chart). */
  focusTime?: number | null;
  /** Optional closed-trade / order id to highlight briefly. */
  focusTradeId?: string | null;
}

const APP_TABS: readonly AppTab[] = [
  'dashboard',
  'backtest',
  'journal',
  'strategy',
  'profile',
];

const DEFAULT_ROUTE: AppRoute = {
  view: 'landing',
  appTab: null,
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

function isAppTab(v: string | undefined): v is AppTab {
  return !!v && (APP_TABS as readonly string[]).includes(v);
}

export function parseAppRoute(hash: string = window.location.hash): AppRoute {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const { focusTime, focusTradeId } = parseFocusFromQuery(parseQuery(raw));

  if (parts.length === 0) return { ...DEFAULT_ROUTE };

  const head = parts[0]!;
  if (head === 'home' || head === 'landing') {
    return {
      view: 'landing',
      appTab: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'app') {
    const tab = isAppTab(parts[1]) ? parts[1] : 'dashboard';
    const sessionId =
      tab === 'journal' && parts[2] ? parts[2]! : null;
    return {
      view: 'app',
      appTab: tab,
      sessionId,
      focusTime: null,
      focusTradeId: null,
    };
  }
  // Legacy bookmarks → shell tabs
  if (head === 'sessions') {
    return {
      view: 'app',
      appTab: 'backtest',
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'datasets') {
    return {
      view: 'datasets',
      appTab: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'journal') {
    return {
      view: 'app',
      appTab: 'journal',
      sessionId: parts[1] ?? null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'chart' && parts[1]) {
    return {
      view: 'chart',
      appTab: null,
      sessionId: parts[1]!,
      focusTime,
      focusTradeId,
    };
  }
  if (head === 'chart') {
    return {
      view: 'app',
      appTab: 'backtest',
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === '404') {
    return {
      view: 'notFound',
      appTab: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  return {
    view: 'notFound',
    appTab: null,
    sessionId: null,
    focusTime: null,
    focusTradeId: null,
  };
}

export function formatAppRoute(route: AppRoute): string {
  switch (route.view) {
    case 'landing':
      return '#/';
    case 'app': {
      const tab = route.appTab ?? 'dashboard';
      if (tab === 'journal' && route.sessionId) {
        return `#/app/journal/${encodeURIComponent(route.sessionId)}`;
      }
      return `#/app/${tab}`;
    }
    case 'datasets':
      return '#/datasets';
    case 'chart': {
      if (!route.sessionId) return '#/app/backtest';
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
    (a.appTab ?? null) === (b.appTab ?? null) &&
    a.sessionId === b.sessionId &&
    (a.focusTime ?? null) === (b.focusTime ?? null) &&
    (a.focusTradeId ?? null) === (b.focusTradeId ?? null)
  );
}
