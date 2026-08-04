/**
 * Pure order engine reducer. No React, no IDB, no wall clock, no unseeded RNG.
 *
 * Fills are handed one base-TF bar at a time via stepEngine — the engine never
 * asks for bars, which makes lookahead structurally impossible.
 */

import { createAccountState, recomputeAccount } from './accountState';
import {
  applySlippage,
  evaluateFill,
  fillKindForOrder,
  resolveAmbiguousProtective,
  resolveSpread,
} from './fillModel';
import {
  isValidLot,
  pricesEqual,
  roundToTick,
  type InstrumentSpec,
} from './instrumentSpec';
import {
  isMarginCall,
  isStopOut,
  stopOutCloseOrder,
  totalUsedMargin,
} from './margin';
import {
  commissionForSide,
  grossPnL,
  notionalQty,
  quoteToAccountRate,
  rMultiple,
  swapPointsToAccount,
  unrealizedPnL,
  type FxRateContext,
} from './pnl';
import { seedFromSessionId } from './rng';
import type {
  AccountState,
  EngineCommand,
  EngineEvent,
  MarketContext,
  Order,
  OrderEngineState,
  OrderId,
  Position,
  PositionId,
  RejectReason,
  TradeExitReason,
} from './orderTypes';
import { isTerminal } from './orderTypes';
import type { ChartBar } from '@/types/bar';

const DEV = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/** Max terminal orders retained in state.orders before journal eviction (invariant 9). */
export const MAX_TERMINAL_ORDERS_IN_STATE = 256;

function roundLot(lots: number, step: number): number {
  if (step <= 0) return lots;
  const f = Math.round(1 / step);
  return Math.round(lots * f) / f;
}

export function createInitialState(input: {
  symbol: string;
  accountCurrency: string;
  balance: number;
  leverage: number;
  sessionId: string;
  mode?: 'netting' | 'hedging';
}): OrderEngineState {
  return {
    orders: {},
    positions: {},
    workingIds: [],
    account: createAccountState({
      currency: input.accountCurrency,
      balance: input.balance,
      leverage: input.leverage,
    }),
    seq: 0,
    rngState: seedFromSessionId(input.sessionId),
    mode: input.mode ?? 'netting',
    lastBarTime: null,
    lastSwapUtcDay: null,
    symbol: input.symbol,
  };
}

function pushEvent(
  events: EngineEvent[],
  state: OrderEngineState,
  cursorTime: number,
  type: EngineEvent['type'],
  payload: Record<string, unknown>,
): OrderEngineState {
  const seq = state.seq + 1;
  events.push({ seq, cursorTime, type, payload });
  return { ...state, seq };
}

function addWorking(state: OrderEngineState, id: OrderId): OrderEngineState {
  if (state.workingIds.includes(id)) return state;
  return { ...state, workingIds: [...state.workingIds, id] };
}

function removeWorking(state: OrderEngineState, id: OrderId): OrderEngineState {
  return { ...state, workingIds: state.workingIds.filter((x) => x !== id) };
}

function fxCtx(state: OrderEngineState, price: number, ctx: MarketContext): FxRateContext {
  return {
    accountCurrency: ctx.accountCurrency || state.account.currency,
    instrumentPrice: price,
    conversionRateToAccount: ctx.conversionRateToAccount,
  };
}

function validateSubmit(
  order: EngineCommand & { type: 'SUBMIT' },
  spec: InstrumentSpec,
): RejectReason | null {
  const o = order.order;
  if (!isValidLot(o.size, spec)) {
    if (o.size < spec.minLot || o.size > spec.maxLot) return 'SIZE_OUT_OF_RANGE';
    return 'SIZE_STEP';
  }

  const bid = order.bid;
  const ask = order.ask;
  const level = o.price != null ? roundToTick(o.price, spec) : undefined;
  const stopPx = o.stopPrice != null ? roundToTick(o.stopPrice, spec) : undefined;

  if (o.type === 'LIMIT' && level != null) {
    if (o.side === 'BUY' && level > ask) return 'LIMIT_WRONG_SIDE';
    if (o.side === 'SELL' && level < bid) return 'LIMIT_WRONG_SIDE';
    // Freeze distance from the near side of the spread (not mid) so last-price limits work.
    if (spec.stopLevel > 0) {
      if (o.side === 'BUY' && ask - level < spec.stopLevel - 1e-12) {
        return 'TOO_CLOSE_TO_MARKET';
      }
      if (o.side === 'SELL' && level - bid < spec.stopLevel - 1e-12) {
        return 'TOO_CLOSE_TO_MARKET';
      }
    }
  }

  if ((o.type === 'STOP' || o.type === 'STOP_LIMIT' || o.type === 'TRAILING_STOP') && level != null) {
    // STOP uses price as stop level
    const stopLvl = o.type === 'STOP_LIMIT' ? (stopPx ?? level) : level;
    if (o.side === 'BUY' && stopLvl < ask) return 'STOP_WRONG_SIDE';
    if (o.side === 'SELL' && stopLvl > bid) return 'STOP_WRONG_SIDE';
    if (spec.stopLevel > 0) {
      if (o.side === 'BUY' && stopLvl - ask < spec.stopLevel - 1e-12) {
        return 'TOO_CLOSE_TO_MARKET';
      }
      if (o.side === 'SELL' && bid - stopLvl < spec.stopLevel - 1e-12) {
        return 'TOO_CLOSE_TO_MARKET';
      }
    }
  }

  if (o.stopLoss != null && o.takeProfit != null && level != null) {
    // Protective on entry bracket preview
  }

  // Bracket children (role set) are validated against market / parent at attach time;
  // their own price is the protective level, not the entry.
  if (!o.role && o.stopLoss != null) {
    const entry = level ?? (o.side === 'BUY' ? ask : bid);
    if (o.side === 'BUY' && o.stopLoss >= entry) return 'PROTECTIVE_WRONG_SIDE';
    if (o.side === 'SELL' && o.stopLoss <= entry) return 'PROTECTIVE_WRONG_SIDE';
  }
  if (!o.role && o.takeProfit != null) {
    const entry = level ?? (o.side === 'BUY' ? ask : bid);
    if (o.side === 'BUY' && o.takeProfit <= entry) return 'PROTECTIVE_WRONG_SIDE';
    if (o.side === 'SELL' && o.takeProfit >= entry) return 'PROTECTIVE_WRONG_SIDE';
  }

  return null;
}

/** Apply a user command (submit/cancel/modify). */
export function reduceCommand(
  state: OrderEngineState,
  cmd: EngineCommand,
  spec: InstrumentSpec,
): { state: OrderEngineState; events: EngineEvent[] } {
  const events: EngineEvent[] = [];

  if (cmd.type === 'CANCEL') {
    const order = state.orders[cmd.orderId];
    if (!order || isTerminal(order.status)) return { state, events };
    let next = removeWorking(state, cmd.orderId);
    const cancelled: Order = {
      ...order,
      status: 'CANCELLED',
      updatedAt: cmd.cursorTime,
    };
    next = {
      ...next,
      orders: { ...next.orders, [cmd.orderId]: cancelled },
    };
    next = pushEvent(events, next, cmd.cursorTime, 'ORDER_CANCELLED', {
      orderId: cmd.orderId,
    });
    return { state: next, events };
  }

  if (cmd.type === 'MODIFY') {
    const order = state.orders[cmd.orderId];
    if (!order || isTerminal(order.status)) return { state, events };
    const price = cmd.price != null ? roundToTick(cmd.price, spec) : order.price;
    const stopLoss = cmd.stopLoss != null ? roundToTick(cmd.stopLoss, spec) : order.stopLoss;
    const takeProfit =
      cmd.takeProfit != null ? roundToTick(cmd.takeProfit, spec) : order.takeProfit;

    // Protective side checks for SL/TP modifies
    if (order.role === 'stopLoss' || order.positionId) {
      const pos = order.positionId ? state.positions[order.positionId] : null;
      const entry = pos?.entryPrice ?? cmd.bid;
      const side = pos?.side ?? order.side;
      if (price != null) {
        if (side === 'BUY' && order.role === 'stopLoss' && price >= entry) {
          let next = pushEvent(events, state, cmd.cursorTime, 'ORDER_REJECTED', {
            orderId: order.id,
            reason: 'PROTECTIVE_WRONG_SIDE' satisfies RejectReason,
          });
          return { state: next, events };
        }
        if (side === 'SELL' && order.role === 'stopLoss' && price <= entry) {
          let next = pushEvent(events, state, cmd.cursorTime, 'ORDER_REJECTED', {
            orderId: order.id,
            reason: 'PROTECTIVE_WRONG_SIDE',
          });
          return { state: next, events };
        }
      }
    }

    const modified: Order = {
      ...order,
      price,
      stopPrice: cmd.stopPrice != null ? roundToTick(cmd.stopPrice, spec) : order.stopPrice,
      stopLoss,
      takeProfit,
      size: cmd.size ?? order.size,
      trailDistance: cmd.trailDistance ?? order.trailDistance,
      revision: order.revision + 1,
      updatedAt: cmd.cursorTime,
    };
    let next: OrderEngineState = {
      ...state,
      orders: { ...state.orders, [order.id]: modified },
    };
    next = pushEvent(events, next, cmd.cursorTime, 'ORDER_MODIFIED', {
      orderId: order.id,
      revision: modified.revision,
      price: modified.price,
    });
    return { state: next, events };
  }

  // SUBMIT
  const reason = validateSubmit(cmd, spec);
  const draft = cmd.order;
  const roundedPrice =
    draft.price != null ? roundToTick(draft.price, spec) : undefined;
  const roundedStop =
    draft.stopPrice != null ? roundToTick(draft.stopPrice, spec) : undefined;

  // Margin check at submit for market / immediate risk (Phase 4).
  let marginReject: RejectReason | null = reason;
  if (!marginReject && (draft.type === 'MARKET' || draft.type === 'STOP')) {
    const estPrice = draft.side === 'BUY' ? cmd.ask : cmd.bid;
    const estMargin =
      (notionalQty(draft.size, spec) *
        (spec.baseCurrency.toUpperCase() === state.account.currency.toUpperCase()
          ? 1
          : estPrice)) /
      Math.max(1, state.account.leverage);
    if (estMargin > state.account.freeMargin + 1e-9) {
      marginReject = 'INSUFFICIENT_MARGIN';
    }
  }

  if (marginReject) {
    const rejected: Order = {
      ...draft,
      price: roundedPrice,
      stopPrice: roundedStop,
      status: 'REJECTED',
      revision: 0,
      updatedAt: cmd.cursorTime,
      rejectReason: marginReject,
    };
    let next: OrderEngineState = {
      ...state,
      orders: { ...state.orders, [rejected.id]: rejected },
    };
    next = pushEvent(events, next, cmd.cursorTime, 'ORDER_REJECTED', {
      orderId: rejected.id,
      reason: marginReject,
    });
    return { state: next, events };
  }

  const accepted: Order = {
    ...draft,
    price: roundedPrice,
    stopPrice: roundedStop,
    stopLoss: draft.stopLoss != null ? roundToTick(draft.stopLoss, spec) : undefined,
    takeProfit: draft.takeProfit != null ? roundToTick(draft.takeProfit, spec) : undefined,
    status: 'WORKING',
    revision: 0,
    updatedAt: cmd.cursorTime,
  };

  let next: OrderEngineState = {
    ...state,
    orders: { ...state.orders, [accepted.id]: accepted },
  };
  next = addWorking(next, accepted.id);
  next = pushEvent(events, next, cmd.cursorTime, 'ORDER_ACCEPTED', { orderId: accepted.id });
  next = pushEvent(events, next, cmd.cursorTime, 'ORDER_WORKING', { orderId: accepted.id });
  return { state: next, events };
}

function newPositionId(state: OrderEngineState): PositionId {
  return `pos-${state.seq + 1}`;
}

function exitReasonFromOrder(
  order: Order,
  override?: TradeExitReason,
): TradeExitReason {
  if (override) return override;
  // Type first — trailing brackets often also carry role stopLoss.
  if (order.type === 'TRAILING_STOP') return 'TRAILING';
  if (order.role === 'takeProfit') return 'TP';
  if (order.role === 'stopLoss') return 'SL';
  return 'MANUAL';
}

/** Risk as fraction of equity at open; null when no usable stop. */
function riskPctAtOpen(
  state: OrderEngineState,
  entryPrice: number,
  stopPrice: number | null,
  lots: number,
  spec: InstrumentSpec,
  ctx: MarketContext,
): number | null {
  if (stopPrice == null || !Number.isFinite(stopPrice)) return null;
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance < spec.tickSize * 0.5) return null;
  const equity = Math.max(state.account.equity, state.account.balance, 1e-9);
  const conv = quoteToAccountRate(spec, fxCtx(state, entryPrice, ctx));
  const riskAccount = stopDistance * notionalQty(lots, spec) * conv.rate;
  if (!(riskAccount > 0)) return null;
  return riskAccount / equity;
}

function applyFillToPosition(
  state: OrderEngineState,
  order: Order,
  fillPrice: number,
  cursorTime: number,
  spec: InstrumentSpec,
  ctx: MarketContext,
  ambiguous: boolean,
  events: EngineEvent[],
  opts?: { bar?: ChartBar; exitReason?: TradeExitReason },
): OrderEngineState {
  let next = state;
  const symbol = order.symbol || state.symbol;

  // Closing / reducing against an existing opposite position (netting)
  if (state.mode === 'netting') {
    const existing = Object.values(state.positions).find((p) => p.symbol === symbol);
    if (existing && existing.side !== order.side) {
      return closeOrReducePosition(
        next,
        existing,
        order,
        fillPrice,
        cursorTime,
        spec,
        ctx,
        ambiguous,
        events,
        opts?.exitReason,
      );
    }
    if (existing && existing.side === order.side) {
      // Add to position — weighted average entry; freeze stop/target/MFE from first entry
      const total = existing.size + order.size;
      const entry =
        (existing.entryPrice * existing.size + fillPrice * order.size) / total;
      const pos: Position = {
        ...existing,
        size: total,
        entryPrice: roundToTick(entry, spec),
        updatedAt: cursorTime,
        ambiguousFill: existing.ambiguousFill || ambiguous,
      };
      next = { ...next, positions: { ...next.positions, [pos.id]: pos } };
      next = pushEvent(events, next, cursorTime, 'POSITION_MODIFIED', {
        positionId: pos.id,
        size: pos.size,
        entryPrice: pos.entryPrice,
      });
      return markOrderFilled(next, order, fillPrice, cursorTime, ambiguous, events);
    }
  }

  // Open new
  const posId = newPositionId(next);
  const conv = quoteToAccountRate(spec, fxCtx(next, fillPrice, ctx));
  const notionalAccount =
    notionalQty(order.size, spec) *
    (spec.quoteCurrency.toUpperCase() === next.account.currency.toUpperCase()
      ? fillPrice
      : fillPrice * conv.rate);
  const entryComm = commissionForSide(
    order.size,
    spec,
    notionalAccount,
    next.account.currency,
  );
  const initialStop = order.stopLoss ?? null;
  const initialTarget = order.takeProfit ?? null;
  const riskPct = riskPctAtOpen(next, fillPrice, initialStop, order.size, spec, ctx);
  const bar = opts?.bar;

  const pos: Position = {
    id: posId,
    symbol,
    side: order.side,
    size: order.size,
    entryPrice: fillPrice,
    initialStopPrice: initialStop,
    initialTargetPrice: initialTarget,
    openedAt: cursorTime,
    updatedAt: cursorTime,
    swapAccruedAccount: 0,
    realizedPnLAccount: 0,
    entryCommissionAccount: entryComm.amount,
    ambiguousFill: ambiguous,
    pnlApproximate: conv.approximate,
    mfePrice: fillPrice,
    maePrice: fillPrice,
    riskPct,
    tags: order.tags ? [...order.tags] : [],
    entryBarHigh: bar != null ? bar.high : null,
    entryBarLow: bar != null ? bar.low : null,
  };

  next = {
    ...next,
    positions: { ...next.positions, [posId]: pos },
    account: {
      ...next.account,
      balance: next.account.balance - entryComm.amount,
    },
  };
  next = pushEvent(events, next, cursorTime, 'POSITION_OPENED', {
    positionId: posId,
    side: pos.side,
    size: pos.size,
    entryPrice: pos.entryPrice,
    initialStopPrice: pos.initialStopPrice,
    initialTargetPrice: pos.initialTargetPrice,
    entryCommissionAccount: pos.entryCommissionAccount,
    pnlApproximate: !!pos.pnlApproximate,
    ambiguousFill: !!pos.ambiguousFill,
    riskPct: pos.riskPct,
    tags: pos.tags,
    entryBarHigh: pos.entryBarHigh,
    entryBarLow: pos.entryBarLow,
  });
  next = markOrderFilled(next, order, fillPrice, cursorTime, ambiguous, events);

  // Spawn bracket children if SL/TP on entry order
  if (order.stopLoss != null || order.takeProfit != null) {
    next = spawnBrackets(next, order, pos, cursorTime, events);
  }

  return next;
}

function spawnBrackets(
  state: OrderEngineState,
  parent: Order,
  pos: Position,
  cursorTime: number,
  events: EngineEvent[],
): OrderEngineState {
  let next = state;
  const oco = `oco-${pos.id}`;
  if (parent.stopLoss != null) {
    const id = `${parent.id}-sl`;
    const sl: Order = {
      id,
      parentId: parent.id,
      ocoGroupId: oco,
      symbol: pos.symbol,
      side: pos.side === 'BUY' ? 'SELL' : 'BUY',
      type: 'STOP',
      size: pos.size,
      price: parent.stopLoss,
      tif: 'GTC',
      status: 'WORKING',
      revision: 0,
      createdAt: cursorTime,
      updatedAt: cursorTime,
      positionId: pos.id,
      role: 'stopLoss',
    };
    next = { ...next, orders: { ...next.orders, [id]: sl } };
    next = addWorking(next, id);
    next = pushEvent(events, next, cursorTime, 'ORDER_WORKING', {
      orderId: id,
      role: 'stopLoss',
    });
  }
  if (parent.takeProfit != null) {
    const id = `${parent.id}-tp`;
    const tp: Order = {
      id,
      parentId: parent.id,
      ocoGroupId: oco,
      symbol: pos.symbol,
      side: pos.side === 'BUY' ? 'SELL' : 'BUY',
      type: 'LIMIT',
      size: pos.size,
      price: parent.takeProfit,
      tif: 'GTC',
      status: 'WORKING',
      revision: 0,
      createdAt: cursorTime,
      updatedAt: cursorTime,
      positionId: pos.id,
      role: 'takeProfit',
    };
    next = { ...next, orders: { ...next.orders, [id]: tp } };
    next = addWorking(next, id);
    next = pushEvent(events, next, cursorTime, 'ORDER_WORKING', {
      orderId: id,
      role: 'takeProfit',
    });
  }
  return next;
}

function closeOrReducePosition(
  state: OrderEngineState,
  pos: Position,
  order: Order,
  fillPrice: number,
  cursorTime: number,
  spec: InstrumentSpec,
  ctx: MarketContext,
  ambiguous: boolean,
  events: EngineEvent[],
  exitReasonOverride?: TradeExitReason,
): OrderEngineState {
  let next = state;
  const closeSize = Math.min(pos.size, order.size);
  const fx = fxCtx(next, fillPrice, ctx);
  const g = grossPnL(pos.side, pos.entryPrice, fillPrice, closeSize, spec, fx);
  const conv = quoteToAccountRate(spec, fx);
  const exitNotional =
    notionalQty(closeSize, spec) *
    (spec.quoteCurrency.toUpperCase() === next.account.currency.toUpperCase()
      ? fillPrice
      : fillPrice * conv.rate);
  const exitComm = commissionForSide(
    closeSize,
    spec,
    exitNotional,
    next.account.currency,
  );
  const entryCommShare = pos.entryCommissionAccount * (closeSize / pos.size);
  const swapShare = pos.swapAccruedAccount * (closeSize / pos.size);
  const commissionAccount = entryCommShare + exitComm.amount;
  const net = g.grossAccount.amount - commissionAccount - swapShare;
  const pnlApproximate =
    !!pos.pnlApproximate || g.grossAccount.approximate || conv.approximate;
  const exitReason = exitReasonFromOrder(order, exitReasonOverride);
  const rMult = rMultiple(
    net,
    pos.side,
    pos.entryPrice,
    pos.initialStopPrice,
    closeSize,
    spec,
    fxCtx(next, pos.entryPrice, ctx),
  );

  const remaining = roundLot(pos.size - closeSize, spec.lotStep);
  // Credit realized gross − exit commission − swap share. Entry commission was
  // already deducted at open; its share is part of net for reporting only.
  const balanceDelta = g.grossAccount.amount - exitComm.amount - swapShare;

  if (remaining <= 0) {
    const { [pos.id]: _removed, ...rest } = next.positions;
    next = {
      ...next,
      positions: rest,
      account: {
        ...next.account,
        balance: next.account.balance + balanceDelta,
      },
    };
    next = pushEvent(events, next, cursorTime, 'POSITION_CLOSED', {
      positionId: pos.id,
      side: pos.side,
      openedAt: pos.openedAt,
      entryPrice: pos.entryPrice,
      fillPrice,
      size: closeSize,
      initialStopPrice: pos.initialStopPrice,
      initialTargetPrice: pos.initialTargetPrice,
      mfePrice: pos.mfePrice,
      maePrice: pos.maePrice,
      grossPnLAccount: g.grossAccount.amount,
      commissionAccount,
      swapAccount: swapShare,
      netPnLAccount: net,
      rMultiple: rMult,
      exitReason,
      ambiguous: ambiguous || !!pos.ambiguousFill,
      pnlApproximate,
      riskPct: pos.riskPct,
      tags: pos.tags,
      entryBarHigh: pos.entryBarHigh,
      entryBarLow: pos.entryBarLow,
    });
    next = cancelPositionOrders(next, pos.id, cursorTime, events);
  } else {
    const posNext: Position = {
      ...pos,
      size: remaining,
      updatedAt: cursorTime,
      entryCommissionAccount: pos.entryCommissionAccount - entryCommShare,
      swapAccruedAccount: pos.swapAccruedAccount - swapShare,
      realizedPnLAccount: pos.realizedPnLAccount + net,
      ambiguousFill: pos.ambiguousFill || ambiguous,
      pnlApproximate: pos.pnlApproximate || pnlApproximate,
    };
    next = {
      ...next,
      positions: { ...next.positions, [pos.id]: posNext },
      account: {
        ...next.account,
        balance: next.account.balance + balanceDelta,
      },
    };
    next = pushEvent(events, next, cursorTime, 'POSITION_MODIFIED', {
      positionId: pos.id,
      size: remaining,
      realizedPnLAccount: posNext.realizedPnLAccount,
    });
  }

  return markOrderFilled(next, order, fillPrice, cursorTime, ambiguous, events);
}

/** Update MFE/MAE from bar OHLC — O(open positions), no allocations. */
function updateExcursions(state: OrderEngineState, bar: ChartBar): OrderEngineState {
  const ids = Object.keys(state.positions);
  if (ids.length === 0) return state;
  let changed = false;
  let positions = state.positions;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const p = positions[id]!;
    let mfe = p.mfePrice;
    let mae = p.maePrice;
    if (p.side === 'BUY') {
      if (bar.high > mfe) mfe = bar.high;
      if (bar.low < mae) mae = bar.low;
    } else {
      if (bar.low < mfe) mfe = bar.low;
      if (bar.high > mae) mae = bar.high;
    }
    if (mfe !== p.mfePrice || mae !== p.maePrice) {
      if (!changed) {
        positions = { ...positions };
        changed = true;
      }
      positions[id] = { ...p, mfePrice: mfe, maePrice: mae, updatedAt: bar.time };
    }
  }
  return changed ? { ...state, positions } : state;
}

function cancelPositionOrders(
  state: OrderEngineState,
  positionId: PositionId,
  cursorTime: number,
  events: EngineEvent[],
): OrderEngineState {
  let next = state;
  for (const id of [...next.workingIds]) {
    const o = next.orders[id];
    if (!o || o.positionId !== positionId) continue;
    const cancelled: Order = { ...o, status: 'CANCELLED', updatedAt: cursorTime };
    next = {
      ...next,
      orders: { ...next.orders, [id]: cancelled },
    };
    next = removeWorking(next, id);
    next = pushEvent(events, next, cursorTime, 'ORDER_CANCELLED', {
      orderId: id,
      reason: 'position_closed',
    });
  }
  return next;
}

function cancelOcoSiblings(
  state: OrderEngineState,
  filled: Order,
  cursorTime: number,
  events: EngineEvent[],
): OrderEngineState {
  if (!filled.ocoGroupId) return state;
  let next = state;
  for (const id of [...next.workingIds]) {
    if (id === filled.id) continue;
    const o = next.orders[id];
    if (!o || o.ocoGroupId !== filled.ocoGroupId) continue;
    const cancelled: Order = { ...o, status: 'CANCELLED', updatedAt: cursorTime };
    next = {
      ...next,
      orders: { ...next.orders, [id]: cancelled },
    };
    next = removeWorking(next, id);
    next = pushEvent(events, next, cursorTime, 'ORDER_CANCELLED', {
      orderId: id,
      reason: 'oco',
    });
  }
  return next;
}

function markOrderFilled(
  state: OrderEngineState,
  order: Order,
  fillPrice: number,
  cursorTime: number,
  ambiguous: boolean,
  events: EngineEvent[],
): OrderEngineState {
  const filled: Order = {
    ...order,
    status: 'FILLED',
    filledAt: cursorTime,
    fillPrice,
    updatedAt: cursorTime,
    ambiguousFill: ambiguous || order.ambiguousFill,
  };
  let next: OrderEngineState = {
    ...state,
    orders: { ...state.orders, [order.id]: filled },
  };
  next = removeWorking(next, order.id);
  next = pushEvent(events, next, cursorTime, 'ORDER_FILLED', {
    orderId: order.id,
    fillPrice,
    size: order.size,
    ambiguous,
  });
  if (ambiguous) {
    next = pushEvent(events, next, cursorTime, 'AMBIGUOUS_FILL', {
      orderId: order.id,
      fillPrice,
    });
  }
  next = cancelOcoSiblings(next, filled, cursorTime, events);
  return next;
}

function updateTrailingStops(
  state: OrderEngineState,
  bar: ChartBar,
  spec: InstrumentSpec,
): OrderEngineState {
  // Trigger was already evaluated this bar; ratchet water marks only after (§4.8).
  // Order.side is the close side: SELL trail protects a long; BUY trail protects a short.
  let orders = state.orders;
  let changed = false;
  for (const id of state.workingIds) {
    const o = orders[id];
    if (!o || o.type !== 'TRAILING_STOP' || o.trailDistance == null) continue;
    if (o.side === 'SELL') {
      // Long protection: high-water ratchets up; stop level never decreases.
      const hw = Math.max(o.trailHighWater ?? bar.high, bar.high);
      const stopLevel = roundToTick(hw - o.trailDistance, spec);
      const prev = o.price ?? stopLevel;
      const nextPrice = Math.max(prev, stopLevel);
      if (!pricesEqual(nextPrice, prev, spec) || o.trailHighWater !== hw) {
        orders = {
          ...orders,
          [id]: {
            ...o,
            trailHighWater: hw,
            price: nextPrice,
            updatedAt: bar.time,
            revision: o.revision + 1,
          },
        };
        changed = true;
      }
    } else {
      // Short protection: low-water ratchets down; stop level never increases.
      const lw = Math.min(o.trailLowWater ?? bar.low, bar.low);
      const stopLevel = roundToTick(lw + o.trailDistance, spec);
      const prev = o.price ?? stopLevel;
      const nextPrice = Math.min(prev, stopLevel);
      if (!pricesEqual(nextPrice, prev, spec) || o.trailLowWater !== lw) {
        orders = {
          ...orders,
          [id]: {
            ...o,
            trailLowWater: lw,
            price: nextPrice,
            updatedAt: bar.time,
            revision: o.revision + 1,
          },
        };
        changed = true;
      }
    }
  }
  return changed ? { ...state, orders } : state;
}

function refreshEquity(
  state: OrderEngineState,
  bar: ChartBar,
  spread: number,
  spec: InstrumentSpec,
  ctx: MarketContext,
): { state: OrderEngineState; unrealizedById: Record<string, number> } {
  const bid = bar.close;
  const ask = bar.close + spread;
  let unreal = 0;
  const unrealizedById: Record<string, number> = {};
  const positions = Object.values(state.positions);
  for (const pos of positions) {
    const u = unrealizedPnL(
      pos.side,
      pos.entryPrice,
      bid,
      ask,
      pos.size,
      spec,
      fxCtx(state, bid, ctx),
    );
    unrealizedById[pos.id] = u.amount;
    unreal += u.amount;
  }
  const used = totalUsedMargin(
    positions,
    spec,
    fxCtx(state, bid, ctx),
    state.account.leverage,
  );
  const account = recomputeAccount(state.account, unreal, used);
  return { state: { ...state, account }, unrealizedById };
}

/** Whole UTC days since Unix epoch — no Date object (determinism ban). */
function utcDayIndex(unixSec: number): number {
  return Math.floor(unixSec / 86400);
}

/** 0=Sun … 6=Sat. Epoch day 0 was Thursday. */
function utcWeekday(unixSec: number): number {
  return (utcDayIndex(unixSec) + 4) % 7;
}

function secondsIntoUtcDay(unixSec: number): number {
  return ((unixSec % 86400) + 86400) % 86400;
}

/**
 * Accrue swap when the bar crosses session swap time on a weekday.
 * Never on weekends (Sat/Sun). Triple on configured weekday.
 */
function accrueSwapIfNeeded(
  state: OrderEngineState,
  bar: ChartBar,
  prevBarTime: number | null,
  spec: InstrumentSpec,
  ctx: MarketContext,
  events: EngineEvent[],
): OrderEngineState {
  if (ctx.marketOpen === false) return state;
  const wd = utcWeekday(bar.time);
  if (wd === 0 || wd === 6) return state; // Sunday / Saturday

  const dayIdx = utcDayIndex(bar.time);
  if (state.lastSwapUtcDay === dayIdx) return state;

  const sod = secondsIntoUtcDay(bar.time);
  const prevSod =
    prevBarTime != null && utcDayIndex(prevBarTime) === dayIdx
      ? secondsIntoUtcDay(prevBarTime)
      : -1;
  const crossed =
    prevSod < spec.swapTimeUtc && sod >= spec.swapTimeUtc;
  if (!crossed) return state;

  const triple = wd === spec.tripleSwapWeekday;
  let next = state;
  const positions = { ...next.positions };
  let any = false;
  for (const id of Object.keys(positions)) {
    const pos = positions[id]!;
    const swap = swapPointsToAccount(
      pos.side,
      pos.size,
      spec,
      fxCtx(next, bar.close, ctx),
      triple,
    );
    if (swap.amount === 0) continue;
    any = true;
    positions[id] = {
      ...pos,
      swapAccruedAccount: pos.swapAccruedAccount + swap.amount,
      updatedAt: bar.time,
    };
    // Swap amount is signed (usually negative). Apply directly to balance.
    next = {
      ...next,
      account: {
        ...next.account,
        balance: next.account.balance + swap.amount,
      },
    };
    next = pushEvent(events, next, bar.time, 'SWAP_ACCRUED', {
      positionId: id,
      amount: swap.amount,
      triple,
      dayIdx,
    });
  }
  if (!any && Object.keys(positions).length === 0) {
    return { ...next, lastSwapUtcDay: dayIdx };
  }
  return {
    ...next,
    positions,
    lastSwapUtcDay: dayIdx,
  };
}

function applyStopOut(
  state: OrderEngineState,
  bar: ChartBar,
  spread: number,
  spec: InstrumentSpec,
  ctx: MarketContext,
  unrealizedById: Record<string, number>,
  events: EngineEvent[],
): OrderEngineState {
  let next = state;
  let guard = 0;
  while (isStopOut(next.account, spec) && guard++ < 32) {
    const list = Object.values(next.positions);
    if (list.length === 0) break;
    const ordered = stopOutCloseOrder(list, unrealizedById);
    const victim = ordered[0]!;
    const bid = bar.close;
    const ask = bar.close + spread;
    const fillPrice = victim.side === 'BUY' ? bid : ask;
    const closeOrder: Order = {
      id: `stopout-${victim.id}-${next.seq + 1}`,
      symbol: victim.symbol,
      side: victim.side === 'BUY' ? 'SELL' : 'BUY',
      type: 'MARKET',
      size: victim.size,
      tif: 'IOC',
      status: 'WORKING',
      revision: 0,
      createdAt: bar.time,
      updatedAt: bar.time,
      positionId: victim.id,
    };
    next = {
      ...next,
      orders: { ...next.orders, [closeOrder.id]: closeOrder },
    };
    next = addWorking(next, closeOrder.id);
    next = applyFillToPosition(
      next,
      closeOrder,
      fillPrice,
      bar.time,
      spec,
      ctx,
      false,
      events,
      { bar, exitReason: 'STOP_OUT' },
    );
    next = pushEvent(events, next, bar.time, 'STOP_OUT', {
      positionId: victim.id,
      fillPrice,
      size: victim.size,
    });
    const refreshed = refreshEquity(next, bar, spread, spec, ctx);
    next = refreshed.state;
    unrealizedById = refreshed.unrealizedById;
  }
  return next;
}

function evictTerminalOrders(state: OrderEngineState): OrderEngineState {
  const terminal = Object.values(state.orders).filter((o) => isTerminal(o.status));
  if (terminal.length <= MAX_TERMINAL_ORDERS_IN_STATE) return state;
  terminal.sort((a, b) => (a.updatedAt - b.updatedAt) || a.id.localeCompare(b.id));
  const removeCount = terminal.length - MAX_TERMINAL_ORDERS_IN_STATE;
  const toRemove = new Set(terminal.slice(0, removeCount).map((o) => o.id));
  const orders = { ...state.orders };
  for (const id of toRemove) delete orders[id];
  return { ...state, orders };
}

/**
 * Called once per base-TF bar as the replay cursor advances.
 * `bar` is ALWAYS base TF and ALWAYS ≤ cursorTime.
 */
export function stepEngine(
  state: OrderEngineState,
  bar: ChartBar,
  spec: InstrumentSpec,
  ctx: MarketContext,
): { state: OrderEngineState; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  const cursorTime = bar.time;

  // DEV no-lookahead asserts (§7.3)
  if (DEV) {
    if (state.lastBarTime != null && bar.time <= state.lastBarTime) {
      throw new Error(
        `[orders] stepEngine bar.time ${bar.time} not strictly > last ${state.lastBarTime}`,
      );
    }
    // Freeze bar in DEV so retained references are caught by mutation attempts
    Object.freeze(bar);
  }

  let next: OrderEngineState = { ...state, lastBarTime: bar.time };
  const barSpread = (bar as ChartBar & { spread?: number }).spread;
  const spread =
    barSpread != null && Number.isFinite(barSpread)
      ? barSpread
      : ctx.spread > 0
        ? ctx.spread
        : resolveSpread(undefined, spec);
  const vol = ctx.volatilityFactor ?? 0;

  // Gap open: evaluate working orders against open before range (§4.5)
  const isGap =
    state.lastBarTime != null &&
    bar.time - state.lastBarTime > (/* base period unknown here */ 60 * 1.5);
  void isGap;

  // Excursion tracking before fills so the close bar's OHLC is included.
  next = updateExcursions(next, bar);

  // Snapshot working ids — fills may mutate the list
  const working = [...next.workingIds];

  // Protective ambiguity: if a position has both SL and TP working, resolve jointly
  const positions = Object.values(next.positions);
  for (const pos of positions) {
    const sl = working
      .map((id) => next.orders[id])
      .find(
        (o) =>
          o &&
          o.positionId === pos.id &&
          o.role === 'stopLoss' &&
          bar.time > o.createdAt,
      );
    const tp = working
      .map((id) => next.orders[id])
      .find(
        (o) =>
          o &&
          o.positionId === pos.id &&
          o.role === 'takeProfit' &&
          bar.time > o.createdAt,
      );
    if (sl?.price != null && tp?.price != null) {
      const amb = resolveAmbiguousProtective({
        side: pos.side,
        stopLoss: sl.price,
        takeProfit: tp.price,
        bar,
        spread,
        spec,
      });
      if (amb.winner === 'stopLoss' && amb.fillPrice != null) {
        next = applyFillToPosition(
          next,
          sl,
          applySlippage(sl.side, amb.fillPrice, false, spec, vol),
          cursorTime,
          spec,
          ctx,
          amb.ambiguous,
          events,
          { bar },
        );
        continue;
      }
      if (amb.winner === 'takeProfit' && amb.fillPrice != null) {
        next = applyFillToPosition(
          next,
          tp,
          amb.fillPrice, // limits: no slippage
          cursorTime,
          spec,
          ctx,
          false,
          events,
          { bar },
        );
        continue;
      }
    }
  }

  // Remaining working orders
  for (const id of [...next.workingIds]) {
    const order = next.orders[id];
    if (!order || isTerminal(order.status)) continue;

    // Never evaluate on/before the submit bar — market fills at *next* open (§4.3).
    // Also prevents Play from replaying history and filling a fresh order on bar 0.
    if (bar.time <= order.createdAt) continue;

    // Skip protective already handled above if filled
    if (order.role === 'stopLoss' || order.role === 'takeProfit') {
      const still = next.orders[id];
      if (!still || isTerminal(still.status)) continue;
      // If sibling still working, joint resolver already decided neither — skip individual
      const sibling = next.workingIds
        .map((x) => next.orders[x])
        .find(
          (o) =>
            o &&
            o.ocoGroupId &&
            o.ocoGroupId === order.ocoGroupId &&
            o.id !== order.id &&
            !isTerminal(o.status),
        );
      if (sibling) continue;
    }

    const kind = fillKindForOrder(order.side, order.type, order.role);
    if (!kind) continue;

    // Market: fill at this bar's open (submitted on previous bar)
    if (order.type === 'MARKET') {
      const fr = evaluateFill(kind, 0, bar, spread, spec);
      if (fr.triggered && fr.fillPrice != null) {
        const px = applySlippage(order.side, fr.fillPrice, false, spec, vol);
        next = applyFillToPosition(
          next,
          order,
          px,
          cursorTime,
          spec,
          ctx,
          false,
          events,
          { bar },
        );
      }
      continue;
    }

    // STOP_LIMIT: stop triggers → becomes LIMIT
    if (order.type === 'STOP_LIMIT') {
      const stopLevel = order.stopPrice ?? order.price;
      if (stopLevel == null) continue;
      const stopKind = order.side === 'BUY' ? 'BUY_STOP' : 'SELL_STOP';
      const stopHit = evaluateFill(stopKind, stopLevel, bar, spread, spec);
      if (stopHit.triggered) {
        const converted: Order = {
          ...order,
          type: 'LIMIT',
          price: order.price ?? stopLevel,
          revision: order.revision + 1,
          updatedAt: cursorTime,
        };
        next = { ...next, orders: { ...next.orders, [id]: converted } };
        // evaluate limit on same bar
        const limitKind = order.side === 'BUY' ? 'BUY_LIMIT' : 'SELL_LIMIT';
        const fr = evaluateFill(limitKind, converted.price!, bar, spread, spec);
        if (fr.triggered && fr.fillPrice != null) {
          next = applyFillToPosition(
            next,
            converted,
            fr.fillPrice,
            cursorTime,
            spec,
            ctx,
            false,
            events,
            { bar },
          );
        }
      }
      continue;
    }

    const level = order.price;
    if (level == null) continue;
    const fr = evaluateFill(kind, level, bar, spread, spec);
    if (fr.triggered && fr.fillPrice != null) {
      const isLimit =
        order.type === 'LIMIT' || order.role === 'takeProfit';
      const px = applySlippage(order.side, fr.fillPrice, isLimit, spec, vol);
      next = applyFillToPosition(
        next,
        order,
        px,
        cursorTime,
        spec,
        ctx,
        false,
        events,
        { bar },
      );
    }
  }

  // Newly opened positions on this bar also pick up the bar's OHLC range.
  next = updateExcursions(next, bar);

  // Trailing ratchet AFTER trigger evaluation (§4.8)
  next = updateTrailingStops(next, bar, spec);

  // Swap before equity/stop-out so overnight charge can push margin level down.
  next = accrueSwapIfNeeded(next, bar, state.lastBarTime, spec, ctx, events);

  let refreshed = refreshEquity(next, bar, spread, spec, ctx);
  next = refreshed.state;

  if (isMarginCall(next.account, spec)) {
    next = pushEvent(events, next, cursorTime, 'MARGIN_CALL', {
      marginLevel: next.account.marginLevel,
      equity: next.account.equity,
      usedMargin: next.account.usedMargin,
    });
  }

  next = applyStopOut(
    next,
    bar,
    spread,
    spec,
    ctx,
    refreshed.unrealizedById,
    events,
  );
  refreshed = refreshEquity(next, bar, spread, spec, ctx);
  next = refreshed.state;

  next = evictTerminalOrders(next);

  // DEV: no fill in the future
  if (DEV) {
    for (const e of events) {
      if (e.type === 'ORDER_FILLED') {
        const t = e.cursorTime;
        if (t > cursorTime) throw new Error('[orders] fill in the future');
      }
    }
  }

  return { state: next, events };
}

/** Serialize-friendly state hash for determinism tests. */
export function hashState(state: OrderEngineState): string {
  // Stable JSON — sort keys via stringify of normalized shape
  const normalized = {
    seq: state.seq,
    rngState: state.rngState,
    account: state.account,
    workingIds: [...state.workingIds].sort(),
    orders: Object.keys(state.orders)
      .sort()
      .map((k) => state.orders[k]),
    positions: Object.keys(state.positions)
      .sort()
      .map((k) => state.positions[k]),
    lastBarTime: state.lastBarTime,
    lastSwapUtcDay: state.lastSwapUtcDay,
    mode: state.mode,
    symbol: state.symbol,
  };
  const json = JSON.stringify(normalized);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type { AccountState };
