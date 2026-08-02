/**
 * Margin, free margin, margin call, and stop-out (§6). Pure functions.
 */

import { baseToAccountRate, notionalQty, type FxRateContext } from './pnl';
import type { InstrumentSpec } from './instrumentSpec';
import type { AccountState, Position } from './orderTypes';

export function positionUsedMargin(
  pos: Position,
  spec: InstrumentSpec,
  ctx: FxRateContext,
  leverage: number,
): number {
  const lev = Math.max(1, leverage);
  const conv = baseToAccountRate(spec, {
    ...ctx,
    instrumentPrice: ctx.instrumentPrice || pos.entryPrice,
  });
  // notional in base units * base→account / leverage
  return (notionalQty(pos.size, spec) * conv.rate) / lev;
}

export function totalUsedMargin(
  positions: readonly Position[],
  spec: InstrumentSpec,
  ctx: FxRateContext,
  leverage: number,
): number {
  let sum = 0;
  for (const p of positions) {
    sum += positionUsedMargin(p, spec, ctx, leverage);
  }
  return sum;
}

export function marginLevel(equity: number, usedMargin: number): number {
  if (usedMargin <= 0) return Number.POSITIVE_INFINITY;
  return (equity / usedMargin) * 100;
}

export function isMarginCall(account: AccountState, spec: InstrumentSpec): boolean {
  if (account.usedMargin <= 0) return false;
  return account.marginLevel <= spec.marginCallLevel;
}

export function isStopOut(account: AccountState, spec: InstrumentSpec): boolean {
  if (account.usedMargin <= 0) return false;
  return account.marginLevel <= spec.stopOutLevel;
}

/** Largest unrealized loser first (most negative unrealized). */
export function stopOutCloseOrder(
  positions: readonly Position[],
  unrealizedById: Record<string, number>,
): Position[] {
  return [...positions].sort((a, b) => {
    const ua = unrealizedById[a.id] ?? 0;
    const ub = unrealizedById[b.id] ?? 0;
    if (ua !== ub) return ua - ub; // more negative first
    return a.id.localeCompare(b.id);
  });
}
