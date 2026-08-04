/**
 * Infer LIMIT vs STOP from which side of the market the entry sits.
 * Buy: at/below ask → LIMIT, above ask → STOP.
 * Sell: at/above bid → LIMIT, below bid → STOP.
 */

export type PendingOrderType = 'LIMIT' | 'STOP';

export function inferPendingType(
  side: 'buy' | 'sell' | 'BUY' | 'SELL',
  price: number,
  bid: number,
  ask: number,
): PendingOrderType {
  const buy = side === 'buy' || side === 'BUY';
  if (buy) return price <= ask ? 'LIMIT' : 'STOP';
  return price >= bid ? 'LIMIT' : 'STOP';
}
