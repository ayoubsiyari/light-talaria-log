/**
 * CME-style futures root multipliers / ticks for the order engine.
 * Detection is root + optional continuous/month suffix (ES, ES1, ESZ24).
 */

export interface FuturesRootSpec {
  root: string;
  /** Minimum price increment. */
  tickSize: number;
  digits: number;
  /**
   * Quote currency per 1.0 price point × 1 contract
   * (e.g. ES = $50/pt, CL = $1000/pt).
   */
  contractSize: number;
  quoteCurrency: string;
  /** UI distance step (usually 1.0 point; energy often 0.01). */
  pointSize: number;
}

/** Longest root first so MES wins over ES. */
export const FUTURES_ROOT_SPECS: readonly FuturesRootSpec[] = (
  [
    { root: 'MNQ', tickSize: 0.25, digits: 2, contractSize: 2, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'MES', tickSize: 0.25, digits: 2, contractSize: 5, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'MYM', tickSize: 1, digits: 0, contractSize: 0.5, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'M2K', tickSize: 0.1, digits: 1, contractSize: 5, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'MGC', tickSize: 0.1, digits: 1, contractSize: 10, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'MCL', tickSize: 0.01, digits: 2, contractSize: 100, quoteCurrency: 'USD', pointSize: 0.01 },
    { root: 'RTY', tickSize: 0.1, digits: 1, contractSize: 50, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'NQ', tickSize: 0.25, digits: 2, contractSize: 20, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'ES', tickSize: 0.25, digits: 2, contractSize: 50, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'YM', tickSize: 1, digits: 0, contractSize: 5, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'CL', tickSize: 0.01, digits: 2, contractSize: 1000, quoteCurrency: 'USD', pointSize: 0.01 },
    { root: 'GC', tickSize: 0.1, digits: 1, contractSize: 100, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'SI', tickSize: 0.005, digits: 3, contractSize: 5000, quoteCurrency: 'USD', pointSize: 0.01 },
    { root: 'NG', tickSize: 0.001, digits: 3, contractSize: 10000, quoteCurrency: 'USD', pointSize: 0.001 },
    { root: 'HG', tickSize: 0.0005, digits: 4, contractSize: 25000, quoteCurrency: 'USD', pointSize: 0.01 },
    { root: 'PL', tickSize: 0.1, digits: 1, contractSize: 50, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'RB', tickSize: 0.0001, digits: 4, contractSize: 42000, quoteCurrency: 'USD', pointSize: 0.0001 },
    { root: 'HO', tickSize: 0.0001, digits: 4, contractSize: 42000, quoteCurrency: 'USD', pointSize: 0.0001 },
    { root: 'ZB', tickSize: 1 / 32, digits: 5, contractSize: 1000, quoteCurrency: 'USD', pointSize: 1 },
    { root: 'ZN', tickSize: 1 / 64, digits: 5, contractSize: 1000, quoteCurrency: 'USD', pointSize: 1 },
    { root: '6E', tickSize: 0.00005, digits: 5, contractSize: 125000, quoteCurrency: 'USD', pointSize: 0.0001 },
    { root: '6B', tickSize: 0.0001, digits: 4, contractSize: 62500, quoteCurrency: 'USD', pointSize: 0.0001 },
    { root: '6J', tickSize: 0.0000005, digits: 7, contractSize: 12_500_000, quoteCurrency: 'USD', pointSize: 0.000001 },
  ] as const
).slice().sort((a, b) => b.root.length - a.root.length);

function futuresSuffixOk(rest: string): boolean {
  if (rest === '') return true;
  if (/^\d/.test(rest)) return true;
  if (/^[FGHJKMNQUVXZ]\d{2,4}$/i.test(rest)) return true;
  return false;
}

/** Match ES / ES1 / ESZ24 → root spec, or null if not a known future. */
export function matchFuturesRoot(symbol: string): FuturesRootSpec | null {
  const u = String(symbol || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  if (!u) return null;
  for (const row of FUTURES_ROOT_SPECS) {
    if (!u.startsWith(row.root)) continue;
    const rest = u.slice(row.root.length);
    if (futuresSuffixOk(rest)) return row;
  }
  return null;
}
