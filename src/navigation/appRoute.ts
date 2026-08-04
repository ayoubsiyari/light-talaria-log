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
}

const DEFAULT_ROUTE: AppRoute = { view: 'landing', sessionId: null };

export function parseAppRoute(hash: string = window.location.hash): AppRoute {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { ...DEFAULT_ROUTE };

  const head = parts[0]!;
  if (head === 'home' || head === 'landing') return { view: 'landing', sessionId: null };
  if (head === 'sessions') return { view: 'sessions', sessionId: null };
  if (head === 'datasets') return { view: 'datasets', sessionId: null };
  if (head === 'journal') {
    return { view: 'journal', sessionId: parts[1] ?? null };
  }
  if (head === 'chart' && parts[1]) {
    return { view: 'chart', sessionId: parts[1]! };
  }
  if (head === 'chart') {
    return { view: 'sessions', sessionId: null };
  }
  if (head === '404') {
    return { view: 'notFound', sessionId: null };
  }
  return { view: 'notFound', sessionId: null };
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
    case 'chart':
      return route.sessionId
        ? `#/chart/${encodeURIComponent(route.sessionId)}`
        : '#/sessions';
    case 'notFound':
      return '#/404';
    default:
      return '#/';
  }
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  return a.view === b.view && a.sessionId === b.sessionId;
}
