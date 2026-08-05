/**
 * Hash routes so refresh restores the current page without a router lib.
 * Vite serves index.html for `/`; deep links live in the hash.
 *
 * Canonical routes (written by formatAppRoute — no duplicates):
 *   #/                              landing
 *   #/auth/signin                   sign in
 *   #/auth/signup                   sign up
 *   #/app/dashboard|trades|backtest|datasets|strategy|resources|profile
 *   #/app/trades/:sessionId         trades focused on a session
 *   #/chart/:sessionId              chart workspace
 *   #/404                           not found
 *
 * Compat (read only — never written by formatAppRoute):
 *   #/sessions → backtest
 *   #/journal → trades
 *   #/journal/:id → trades + session id
 *   #/datasets → #/app/datasets
 */

export type AppTab =
  | 'dashboard'
  | 'trades'
  | 'backtest'
  | 'datasets'
  | 'strategy'
  | 'resources'
  | 'profile';

export type AuthMode = 'signin' | 'signup';

export type AppView =
  | 'landing'
  | 'auth'
  | 'app'
  | 'chart'
  | 'notFound';

export interface AppRoute {
  view: AppView;
  appTab: AppTab | null;
  authMode: AuthMode | null;
  sessionId: string | null;
  focusTime?: number | null;
  focusTradeId?: string | null;
}

const APP_TABS: readonly AppTab[] = [
  'dashboard',
  'trades',
  'backtest',
  'datasets',
  'strategy',
  'resources',
  'profile',
];

const DEFAULT_ROUTE: AppRoute = {
  view: 'landing',
  appTab: null,
  authMode: null,
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

/** Legacy tab ids → current */
function normalizeTab(raw: string | undefined): AppTab {
  if (raw === 'journal') return 'trades';
  if (raw === 'sessions') return 'backtest';
  if (raw === 'stratbank') return 'strategy';
  if (isAppTab(raw)) return raw;
  return 'dashboard';
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
      authMode: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'auth') {
    const mode = parts[1];
    if (mode === 'signin' || mode === 'signup') {
      return {
        view: 'auth',
        appTab: null,
        authMode: mode,
        sessionId: null,
        focusTime: null,
        focusTradeId: null,
      };
    }
    return {
      view: 'notFound',
      appTab: null,
      authMode: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'app') {
    const tab = normalizeTab(parts[1]);
    const sessionId =
      (tab === 'trades' || tab === 'backtest') && parts[2] ? parts[2]! : null;
    return {
      view: 'app',
      appTab: tab,
      authMode: null,
      sessionId,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'sessions') {
    return {
      view: 'app',
      appTab: 'backtest',
      authMode: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  // Legacy orphan path → shell Datasets tab
  if (head === 'datasets') {
    return {
      view: 'app',
      appTab: 'datasets',
      authMode: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'journal') {
    return {
      view: 'app',
      appTab: 'trades',
      authMode: null,
      sessionId: parts[1] ?? null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === 'chart' && parts[1]) {
    return {
      view: 'chart',
      appTab: null,
      authMode: null,
      sessionId: parts[1]!,
      focusTime,
      focusTradeId,
    };
  }
  if (head === 'chart') {
    return {
      view: 'app',
      appTab: 'backtest',
      authMode: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  if (head === '404') {
    return {
      view: 'notFound',
      appTab: null,
      authMode: null,
      sessionId: null,
      focusTime: null,
      focusTradeId: null,
    };
  }
  return {
    view: 'notFound',
    appTab: null,
    authMode: null,
    sessionId: null,
    focusTime: null,
    focusTradeId: null,
  };
}

export function formatAppRoute(route: AppRoute): string {
  switch (route.view) {
    case 'landing':
      return '#/';
    case 'auth':
      return route.authMode === 'signup' ? '#/auth/signup' : '#/auth/signin';
    case 'app': {
      const tab = route.appTab ?? 'dashboard';
      if (tab === 'trades' && route.sessionId) {
        return `#/app/trades/${encodeURIComponent(route.sessionId)}`;
      }
      return `#/app/${tab}`;
    }
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
    (a.authMode ?? null) === (b.authMode ?? null) &&
    a.sessionId === b.sessionId &&
    (a.focusTime ?? null) === (b.focusTime ?? null) &&
    (a.focusTradeId ?? null) === (b.focusTradeId ?? null)
  );
}

/** True when the route requires a signed-in account. */
export function routeRequiresAuth(route: AppRoute): boolean {
  return route.view === 'app' || route.view === 'chart';
}
