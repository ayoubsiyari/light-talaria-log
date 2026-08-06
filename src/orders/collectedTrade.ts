/**
 * Full trade record collected automatically from the chart order engine
 * when a position opens and when SL/TP/manual close hits.
 *
 * Notes / screenshots / strategy fields stay null until ticket UI ships.
 * Per-bar R series + post-exit bars reserved (null) until a cheap bar sampler exists.
 */

import type { InstrumentSpec } from './instrumentSpec';
import { notionalQty, quoteToAccountRate } from './pnl';
import type {
  OrderSide,
  OrderType,
  Position,
  TradeExitReason,
} from './orderTypes';

export interface PartialClose {
  time: number;
  price: number;
  size: number;
  netPnLAccount: number;
  exitReason: TradeExitReason;
}

/** Canonical closed-trade payload nested on POSITION_CLOSED. */
export interface CollectedTrade {
  // Identity
  tradeId: string;
  id: string;
  symbol: string;
  ticker: string;
  sourceFileId: string | null;
  type: 'buy' | 'sell';
  direction: 'buy' | 'sell';
  orderType: OrderType;
  status: 'closed';

  // Prices
  openPrice: number;
  entryPrice: number;
  closePrice: number;
  exitPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  initial_sl: number | null;
  initial_tp: number | null;

  // Size / risk
  quantity: number;
  riskAmount: number | null;
  riskPerTrade: number | null;
  originalRiskAmount: number | null;
  rewardToRiskRatio: number | null;
  rMultiple: number | null;
  riskPct: number | null;

  // PnL (account currency)
  pnl: number;
  netPnL: number;
  realizedPnL: number;
  grossPnL: number;
  commission: number;
  swap: number;

  // Timing (UTC from session cursor timestamps)
  openTime: number;
  closeTime: number;
  holdingTimeHours: number;
  dayOfWeek: number;
  hourOfEntry: number;
  hourOfExit: number;
  month: number;
  year: number;

  // Excursion
  mfe: number;
  mae: number;
  highestPrice: number;
  lowestPrice: number;
  /** Reserved: per-bar favorable R path. */
  bar_mfe_r: number[] | null;
  /** Reserved: per-bar adverse R path. */
  bar_mae_r: number[] | null;
  mfe_r: number | null;
  mae_r: number | null;
  /** Reserved: OHLC after exit for review. */
  postExitBars: null;
  entryBarHigh: number | null;
  entryBarLow: number | null;

  // Close
  closeType: TradeExitReason;
  partialCloses: PartialClose[];

  // Notes / tags (manual later)
  preTradeNotes: string | null;
  postTradeNotes: string | null;
  v9TradeNotes: string | null;
  tags: string[];
  setup: string | null;
  strategy_variables: Record<string, unknown> | null;
  rulesFollowed: string[] | null;

  // Media (manual later)
  entryScreenshot: string | null;
  exitScreenshot: string | null;
  railScreenshots: string[];
  mediaRefs: string[];

  // Costs at entry
  spread_pips_at_entry: number | null;
  commission_at_entry: number;
  pip_value_at_entry: number | null;

  ambiguousFill: boolean;
  pnlApproximate: boolean;
  accountCurrency: string;
}

export function directionFromSide(side: OrderSide): 'buy' | 'sell' {
  return side === 'BUY' ? 'buy' : 'sell';
}

/** Risk in account currency at entry (null if no usable stop). */
export function riskAmountAtEntry(
  entryPrice: number,
  stopPrice: number | null,
  lots: number,
  spec: InstrumentSpec,
  accountCurrency: string,
  conversionRateToAccount?: number,
): number | null {
  if (stopPrice == null || !Number.isFinite(stopPrice)) return null;
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance < spec.tickSize * 0.5) return null;
  const conv = quoteToAccountRate(spec, {
    accountCurrency,
    instrumentPrice: entryPrice,
    conversionRateToAccount,
  });
  const riskAccount = stopDistance * notionalQty(lots, spec) * conv.rate;
  return riskAccount > 0 ? riskAccount : null;
}

export function rewardToRiskRatio(
  entryPrice: number,
  stopPrice: number | null,
  targetPrice: number | null,
): number | null {
  if (stopPrice == null || targetPrice == null) return null;
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  if (!(risk > 0) || !(reward > 0)) return null;
  return reward / risk;
}

/** Favorable / adverse excursion in R units vs initial stop. */
export function excursionR(
  side: OrderSide,
  entryPrice: number,
  stopPrice: number | null,
  mfePrice: number,
  maePrice: number,
): { mfe_r: number | null; mae_r: number | null } {
  if (stopPrice == null) return { mfe_r: null, mae_r: null };
  const risk = Math.abs(entryPrice - stopPrice);
  if (!(risk > 0)) return { mfe_r: null, mae_r: null };
  if (side === 'BUY') {
    return {
      mfe_r: (mfePrice - entryPrice) / risk,
      mae_r: (entryPrice - maePrice) / risk,
    };
  }
  return {
    mfe_r: (entryPrice - mfePrice) / risk,
    mae_r: (maePrice - entryPrice) / risk,
  };
}

export function highestLowest(
  side: OrderSide,
  mfePrice: number,
  maePrice: number,
): { highestPrice: number; lowestPrice: number } {
  if (side === 'BUY') {
    return { highestPrice: mfePrice, lowestPrice: maePrice };
  }
  // Short: MFE is lower price, MAE is higher
  return { highestPrice: maePrice, lowestPrice: mfePrice };
}

export function timingFields(openTime: number, closeTime: number) {
  const openMs = openTime * 1000;
  const closeMs = closeTime * 1000;
  const od = new Date(openMs);
  const cd = new Date(closeMs);
  const holdingSec = Math.max(0, closeTime - openTime);
  return {
    holdingTimeHours: holdingSec / 3600,
    dayOfWeek: od.getUTCDay(),
    hourOfEntry: od.getUTCHours(),
    hourOfExit: cd.getUTCHours(),
    month: od.getUTCMonth() + 1,
    year: od.getUTCFullYear(),
  };
}

export function spreadPips(
  spreadPrice: number | null | undefined,
  pipSize: number,
): number | null {
  if (spreadPrice == null || !(pipSize > 0) || !Number.isFinite(spreadPrice)) {
    return null;
  }
  return spreadPrice / pipSize;
}

export function pipValueAccount(
  lots: number,
  spec: InstrumentSpec,
  entryPrice: number,
  accountCurrency: string,
  conversionRateToAccount?: number,
): number | null {
  if (!(spec.pipSize > 0) || !(lots > 0)) return null;
  const conv = quoteToAccountRate(spec, {
    accountCurrency,
    instrumentPrice: entryPrice,
    conversionRateToAccount,
  });
  const v = spec.pipSize * notionalQty(lots, spec) * conv.rate;
  return Number.isFinite(v) ? v : null;
}

export interface BuildCollectedTradeInput {
  position: Position;
  fillPrice: number;
  closeTime: number;
  closeSize: number;
  grossPnLAccount: number;
  commissionAccount: number;
  swapAccount: number;
  netPnLAccount: number;
  rMultiple: number | null;
  exitReason: TradeExitReason;
  ambiguous: boolean;
  pnlApproximate: boolean;
  accountCurrency: string;
  /** Working protective levels at close (before cancel). */
  stopLossAtClose: number | null;
  takeProfitAtClose: number | null;
  sourceFileId: string | null;
}

export function buildCollectedTrade(input: BuildCollectedTradeInput): CollectedTrade {
  const pos = input.position;
  const dir = directionFromSide(pos.side);
  const { mfe_r, mae_r } = excursionR(
    pos.side,
    pos.entryPrice,
    pos.initialStopPrice,
    pos.mfePrice,
    pos.maePrice,
  );
  const { highestPrice, lowestPrice } = highestLowest(
    pos.side,
    pos.mfePrice,
    pos.maePrice,
  );
  const timing = timingFields(pos.openedAt, input.closeTime);
  const riskAmount = pos.originalRiskAmount;
  const rr = rewardToRiskRatio(
    pos.entryPrice,
    pos.initialStopPrice,
    pos.initialTargetPrice,
  );
  const realized =
    pos.realizedPnLAccount + input.netPnLAccount;

  return {
    tradeId: pos.id,
    id: pos.id,
    symbol: pos.symbol,
    ticker: pos.symbol,
    sourceFileId: input.sourceFileId,
    type: dir,
    direction: dir,
    orderType: pos.orderType,
    status: 'closed',

    openPrice: pos.entryPrice,
    entryPrice: pos.entryPrice,
    closePrice: input.fillPrice,
    exitPrice: input.fillPrice,
    stopLoss: input.stopLossAtClose,
    takeProfit: input.takeProfitAtClose,
    initial_sl: pos.initialStopPrice,
    initial_tp: pos.initialTargetPrice,

    quantity: input.closeSize,
    riskAmount,
    riskPerTrade: riskAmount,
    originalRiskAmount: pos.originalRiskAmount,
    rewardToRiskRatio: rr,
    rMultiple: input.rMultiple,
    riskPct: pos.riskPct,

    pnl: input.grossPnLAccount,
    netPnL: input.netPnLAccount,
    realizedPnL: realized,
    grossPnL: input.grossPnLAccount,
    commission: input.commissionAccount,
    swap: input.swapAccount,

    openTime: pos.openedAt,
    closeTime: input.closeTime,
    ...timing,

    mfe: pos.mfePrice,
    mae: pos.maePrice,
    highestPrice,
    lowestPrice,
    bar_mfe_r: null,
    bar_mae_r: null,
    mfe_r,
    mae_r,
    postExitBars: null,
    entryBarHigh: pos.entryBarHigh,
    entryBarLow: pos.entryBarLow,

    closeType: input.exitReason,
    partialCloses: pos.partialCloses.slice(),

    preTradeNotes: null,
    postTradeNotes: null,
    v9TradeNotes: null,
    tags: pos.tags.slice(),
    setup: null,
    strategy_variables: null,
    rulesFollowed: null,

    entryScreenshot: null,
    exitScreenshot: null,
    railScreenshots: [],
    mediaRefs: [],

    spread_pips_at_entry: pos.spreadPipsAtEntry,
    commission_at_entry: pos.commissionAtEntry,
    pip_value_at_entry: pos.pipValueAtEntry,

    ambiguousFill: input.ambiguous,
    pnlApproximate: input.pnlApproximate,
    accountCurrency: input.accountCurrency,
  };
}

/** Narrow parse of nested collected payload (journal / cloud). */
export function asCollectedTrade(v: unknown): CollectedTrade | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.tradeId !== 'string' || typeof o.entryPrice !== 'number') {
    return null;
  }
  return v as CollectedTrade;
}
