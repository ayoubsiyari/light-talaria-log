/**
 * Pure money math for the replay order engine.
 * All amounts carry an explicit currency — never add mismatched currencies.
 */

import type { InstrumentSpec } from './instrumentSpec';

export type OrderSide = 'BUY' | 'SELL';

export interface FxRateContext {
  /** Account denomination (e.g. USD). */
  accountCurrency: string;
  /**
   * Mid/last price of the traded instrument at the conversion time.
   * Used when base === account (e.g. USDJPY on USD).
   */
  instrumentPrice: number;
  /**
   * Rate that converts 1 unit of `from` into account currency.
   * Required when neither base nor quote is the account currency
   * (e.g. GBP→USD for EURGBP on a USD account).
   * If missing, conversion is flagged approximate.
   */
  conversionRateToAccount?: number;
  /** When true with a supplied fixed rate, mark result approximate. */
  forceApproximate?: boolean;
}

export interface MoneyAmount {
  amount: number;
  currency: string;
  /** True when conversion used a user-supplied / missing-pair fallback. */
  approximate: boolean;
}

export interface GrossPnLResult {
  /** P&L in quote currency before FX conversion. */
  grossQuote: MoneyAmount;
  /** P&L in account currency. */
  grossAccount: MoneyAmount;
}

export interface NetPnLResult extends GrossPnLResult {
  commissionIn: MoneyAmount;
  commissionOut: MoneyAmount;
  swapAccrued: MoneyAmount;
  netAccount: MoneyAmount;
}

function money(amount: number, currency: string, approximate = false): MoneyAmount {
  return { amount, currency, approximate };
}

/**
 * Convert `from` → account currency per §5.3.
 * Silent 1.0 for mismatched currencies is forbidden.
 */
export function fxRate(
  from: string,
  to: string,
  ctx: FxRateContext,
): { rate: number; approximate: boolean } {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return { rate: 1, approximate: false };

  if (b !== ctx.accountCurrency.toUpperCase()) {
    // Engine always converts into account; caller misuse.
    if (ctx.conversionRateToAccount != null && Number.isFinite(ctx.conversionRateToAccount)) {
      return {
        rate: ctx.conversionRateToAccount,
        approximate: true,
      };
    }
    return { rate: 1, approximate: true };
  }

  // Quote == account handled by caller passing from=quote → rate 1 via a===b above
  // when quote is account. Remaining cases:

  if (ctx.forceApproximate && ctx.conversionRateToAccount != null) {
    return { rate: ctx.conversionRateToAccount, approximate: true };
  }

  if (ctx.conversionRateToAccount != null && Number.isFinite(ctx.conversionRateToAccount)) {
    return {
      rate: ctx.conversionRateToAccount,
      approximate: Boolean(ctx.forceApproximate),
    };
  }

  // Base == account (e.g. USDJPY quote JPY → USD): 1 / price
  // Caller must pass instrumentPrice; we detect via lack of conversionRate.
  // This branch is selected by resolveQuoteToAccount when base is account.

  return { rate: 1, approximate: true };
}

/**
 * Resolve quote→account conversion for a traded instrument.
 * Implements the four §5.3 cases explicitly.
 */
export function quoteToAccountRate(
  spec: InstrumentSpec,
  ctx: FxRateContext,
): { rate: number; approximate: boolean; caseId: 'same' | 'quote' | 'base' | 'cross' } {
  const account = ctx.accountCurrency.toUpperCase();
  const quote = spec.quoteCurrency.toUpperCase();
  const base = spec.baseCurrency.toUpperCase();

  if (quote === account) {
    return { rate: 1, approximate: false, caseId: 'quote' };
  }
  if (base === account) {
    const px = ctx.instrumentPrice;
    if (!Number.isFinite(px) || px === 0) {
      return { rate: 1, approximate: true, caseId: 'base' };
    }
    return { rate: 1 / px, approximate: false, caseId: 'base' };
  }
  if (quote === base) {
    return { rate: 1, approximate: false, caseId: 'same' };
  }
  // Cross: need conversion pair
  if (ctx.conversionRateToAccount != null && Number.isFinite(ctx.conversionRateToAccount)) {
    return {
      rate: ctx.conversionRateToAccount,
      approximate: true,
      caseId: 'cross',
    };
  }
  return { rate: 1, approximate: true, caseId: 'cross' };
}

/** Convert base currency notional → account (for margin). */
export function baseToAccountRate(
  spec: InstrumentSpec,
  ctx: FxRateContext,
): { rate: number; approximate: boolean } {
  const account = ctx.accountCurrency.toUpperCase();
  const base = spec.baseCurrency.toUpperCase();
  const quote = spec.quoteCurrency.toUpperCase();

  if (base === account) return { rate: 1, approximate: false };
  if (quote === account) {
    const px = ctx.instrumentPrice;
    if (!Number.isFinite(px)) return { rate: 1, approximate: true };
    return { rate: px, approximate: false };
  }
  if (ctx.conversionRateToAccount != null && Number.isFinite(ctx.conversionRateToAccount)) {
    // For crosses, conversionRateToAccount is interpreted as base→account here
    // when provided specifically for margin; callers must be explicit.
    return { rate: ctx.conversionRateToAccount, approximate: true };
  }
  return { rate: 1, approximate: true };
}

export function notionalQty(lots: number, spec: InstrumentSpec): number {
  return lots * spec.contractSize;
}

export function pipValueQuote(lots: number, spec: InstrumentSpec): number {
  return spec.pipSize * notionalQty(lots, spec);
}

export function tickValueQuote(lots: number, spec: InstrumentSpec): number {
  return spec.tickSize * notionalQty(lots, spec);
}

export function pipValueAccount(
  lots: number,
  spec: InstrumentSpec,
  ctx: FxRateContext,
): MoneyAmount {
  const q = pipValueQuote(lots, spec);
  const conv = quoteToAccountRate(spec, ctx);
  return money(q * conv.rate, ctx.accountCurrency, conv.approximate);
}

export function direction(side: OrderSide): 1 | -1 {
  return side === 'BUY' ? 1 : -1;
}

export function grossPnL(
  side: OrderSide,
  entryPrice: number,
  exitPrice: number,
  lots: number,
  spec: InstrumentSpec,
  ctx: FxRateContext,
): GrossPnLResult {
  const dir = direction(side);
  const priceDiff = (exitPrice - entryPrice) * dir;
  const qty = notionalQty(lots, spec);
  const grossQuoteAmt = priceDiff * qty;
  const conv = quoteToAccountRate(spec, {
    ...ctx,
    instrumentPrice: ctx.instrumentPrice || exitPrice,
  });
  return {
    grossQuote: money(grossQuoteAmt, spec.quoteCurrency, false),
    grossAccount: money(grossQuoteAmt * conv.rate, ctx.accountCurrency, conv.approximate),
  };
}

export function commissionForSide(
  lots: number,
  spec: InstrumentSpec,
  notionalAccount: number,
  accountCurrency: string,
): MoneyAmount {
  if (spec.commissionMode === 'percent') {
    return money(Math.abs(notionalAccount) * spec.commissionPercent, accountCurrency, false);
  }
  return money(spec.commissionPerLot * lots, accountCurrency, false);
}

export function netPnL(
  side: OrderSide,
  entryPrice: number,
  exitPrice: number,
  lots: number,
  spec: InstrumentSpec,
  ctx: FxRateContext,
  swapAccruedAccount: number,
  entryNotionalAccount: number,
  exitNotionalAccount: number,
): NetPnLResult {
  const g = grossPnL(side, entryPrice, exitPrice, lots, spec, ctx);
  const commissionIn = commissionForSide(lots, spec, entryNotionalAccount, ctx.accountCurrency);
  const commissionOut = commissionForSide(lots, spec, exitNotionalAccount, ctx.accountCurrency);
  const swap = money(swapAccruedAccount, ctx.accountCurrency, g.grossAccount.approximate);
  const net =
    g.grossAccount.amount - commissionIn.amount - commissionOut.amount - swap.amount;
  return {
    ...g,
    commissionIn,
    commissionOut,
    swapAccrued: swap,
    netAccount: money(net, ctx.accountCurrency, g.grossAccount.approximate),
  };
}

/**
 * R-multiple against the *initial* stop captured at entry (§5.5).
 * Returns null when no stop was set at entry.
 */
export function rMultiple(
  netPnLAccount: number,
  _side: OrderSide,
  entryPrice: number,
  initialStopPrice: number | null | undefined,
  lots: number,
  spec: InstrumentSpec,
  ctxAtEntry: FxRateContext,
): number | null {
  if (initialStopPrice == null || !Number.isFinite(initialStopPrice)) return null;
  const riskPerUnit = Math.abs(entryPrice - initialStopPrice);
  if (riskPerUnit < spec.tickSize * 0.5) return null;
  const qty = notionalQty(lots, spec);
  const conv = quoteToAccountRate(spec, {
    ...ctxAtEntry,
    instrumentPrice: ctxAtEntry.instrumentPrice || entryPrice,
  });
  const riskAccount = riskPerUnit * qty * conv.rate;
  if (riskAccount <= 0) return null;
  return netPnLAccount / riskAccount;
}

/** Unrealized P&L using correct side of market: bid for longs, ask for shorts. */
export function unrealizedPnL(
  side: OrderSide,
  entryPrice: number,
  bid: number,
  ask: number,
  lots: number,
  spec: InstrumentSpec,
  ctx: FxRateContext,
): MoneyAmount {
  const mark = side === 'BUY' ? bid : ask;
  return grossPnL(side, entryPrice, mark, lots, spec, {
    ...ctx,
    instrumentPrice: ctx.instrumentPrice || mark,
  }).grossAccount;
}

/** Swap points → account currency for one night (points * pip-ish via tick). */
export function swapPointsToAccount(
  side: OrderSide,
  lots: number,
  spec: InstrumentSpec,
  ctx: FxRateContext,
  triple: boolean,
): MoneyAmount {
  const points = side === 'BUY' ? spec.swapLong : spec.swapShort;
  // Points are in pip units per lot per night (broker convention used here).
  const quoteAmt = points * spec.pipSize * notionalQty(lots, spec);
  const mult = triple ? 3 : 1;
  const conv = quoteToAccountRate(spec, ctx);
  return money(quoteAmt * mult * conv.rate, ctx.accountCurrency, conv.approximate);
}
