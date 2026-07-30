/**
 * DEV-only resource ledger — acquire/release pairs must net to zero at session teardown.
 * Production builds: all calls are no-ops (import.meta.env.DEV guards).
 */

export type LedgerKind =
  | 'charts'
  | 'rafLoops'
  | 'listeners'
  | 'workers'
  | 'subscriptions'
  | 'cacheEntries'
  | 'observers';

type LedgerSnapshot = Record<LedgerKind, number>;

const counts: LedgerSnapshot = {
  charts: 0,
  rafLoops: 0,
  listeners: 0,
  workers: 0,
  subscriptions: 0,
  cacheEntries: 0,
  observers: 0,
};

const enabled = () => import.meta.env?.DEV === true;

export function ledgerAcquire(kind: LedgerKind, n = 1): void {
  if (!enabled()) return;
  counts[kind] += n;
}

export function ledgerRelease(kind: LedgerKind, n = 1): void {
  if (!enabled()) return;
  counts[kind] = Math.max(0, counts[kind] - n);
}

export function ledgerSnapshot(): LedgerSnapshot {
  return { ...counts };
}

/** Log + assert all zeros. Returns true if clean. */
export function ledgerAssertTeardown(label = 'session-teardown'): boolean {
  if (!enabled()) return true;
  const snap = ledgerSnapshot();
  const dirty = (Object.keys(snap) as LedgerKind[]).filter((k) => snap[k] !== 0);
  if (dirty.length === 0) {
    console.info(`[ledger] ${label} OK`, snap);
    return true;
  }
  console.error(`[ledger] ${label} LEAK`, snap);
  return false;
}
