/**
 * Account equity / margin snapshot helpers (pure).
 */

import type { AccountState } from './orderTypes';

export function createAccountState(input: {
  currency: string;
  balance: number;
  leverage: number;
}): AccountState {
  return {
    currency: input.currency,
    balance: input.balance,
    equity: input.balance,
    usedMargin: 0,
    freeMargin: input.balance,
    marginLevel: Number.POSITIVE_INFINITY,
    leverage: input.leverage,
  };
}

export function recomputeAccount(
  account: AccountState,
  unrealizedSum: number,
  usedMargin: number,
): AccountState {
  const equity = account.balance + unrealizedSum;
  const freeMargin = equity - usedMargin;
  const marginLevel =
    usedMargin > 0 ? (equity / usedMargin) * 100 : Number.POSITIVE_INFINITY;
  return {
    ...account,
    equity,
    usedMargin,
    freeMargin,
    marginLevel,
  };
}
