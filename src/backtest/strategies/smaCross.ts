/**
 * SMA crossover strategy — runs inside the backtest Worker only.
 * Long/short flip: cross up → long; cross down → short.
 * Emits condition events for chart markers.
 */
import { computeSma } from '@/indicators/smaEma';
import type {
  BacktestCostParams,
  BacktestEvent,
  BacktestTrade,
  EquityPoint,
  SmaCrossParams,
} from '@/types/backtest';
import type { OrderSide } from '@/types/order';

export interface SmaCrossInput {
  times: Float64Array;
  closes: Float32Array;
  sma: SmaCrossParams;
  costs: BacktestCostParams;
}

export interface SmaCrossOutput {
  trades: BacktestTrade[];
  events: BacktestEvent[];
  equity: EquityPoint[];
  finalEquity: number;
  totalPnl: number;
}

function applyBuyCost(price: number, costs: BacktestCostParams): number {
  return price * (1 + costs.slippage) + costs.spread / 2;
}

function applySellCost(price: number, costs: BacktestCostParams): number {
  return price * (1 - costs.slippage) - costs.spread / 2;
}

function pnlFor(
  side: OrderSide,
  entry: number,
  exit: number,
): { pnl: number; pnlPct: number } {
  const pnl = side === 'buy' ? exit - entry : entry - exit;
  const pnlPct = entry !== 0 ? pnl / entry : 0;
  return { pnl, pnlPct };
}

export function runSmaCross(input: SmaCrossInput): SmaCrossOutput {
  const { times, closes, sma, costs } = input;
  const n = closes.length;
  const trades: BacktestTrade[] = [];
  const events: BacktestEvent[] = [];
  const equity: EquityPoint[] = [];
  const fastN = Math.floor(sma.fastPeriod);
  const slowN = Math.floor(sma.slowPeriod);

  if (n === 0 || fastN < 1 || slowN <= fastN) {
    return { trades, events, equity, finalEquity: 1, totalPnl: 0 };
  }

  const fast = computeSma(closes, fastN);
  const slow = computeSma(closes, slowN);

  let equityIdx = 1;
  let totalPnl = 0;
  let side: OrderSide | null = null;
  let entryTime = 0;
  let entryPrice = 0;
  let entryReason = '';
  let openTradeId = '';
  let tradeSeq = 0;
  let eventSeq = 0;

  const pushEvent = (partial: Omit<BacktestEvent, 'id'>): void => {
    eventSeq += 1;
    events.push({ id: `e${eventSeq}`, ...partial });
  };

  if (n > 0) {
    equity.push({ time: times[0]!, equity: equityIdx });
  }

  const closePosition = (t: number, px: number, reason: string): void => {
    if (!side) return;
    const exitPrice = side === 'buy' ? applySellCost(px, costs) : applyBuyCost(px, costs);
    const { pnl, pnlPct } = pnlFor(side, entryPrice, exitPrice);
    equityIdx *= 1 + pnlPct;
    totalPnl += pnl;
    trades.push({
      id: openTradeId,
      side,
      entryTime,
      entryPrice,
      exitTime: t,
      exitPrice,
      pnl,
      pnlPct,
      entryReason,
      exitReason: reason,
    });
    pushEvent({
      time: t,
      price: exitPrice,
      kind: 'exit',
      label: reason,
      side,
      tradeId: openTradeId,
    });
    equity.push({ time: t, equity: equityIdx });
    side = null;
    openTradeId = '';
  };

  const openPosition = (
    next: OrderSide,
    t: number,
    px: number,
    reason: string,
  ): void => {
    tradeSeq += 1;
    openTradeId = `t${tradeSeq}`;
    entryTime = t;
    entryPrice = next === 'buy' ? applyBuyCost(px, costs) : applySellCost(px, costs);
    entryReason = reason;
    side = next;
    pushEvent({
      time: t,
      price: entryPrice,
      kind: 'entry',
      label: reason,
      side: next,
      tradeId: openTradeId,
    });
  };

  for (let i = 1; i < n; i++) {
    const f0 = fast[i - 1]!;
    const s0 = slow[i - 1]!;
    const f1 = fast[i]!;
    const s1 = slow[i]!;
    if (!Number.isFinite(f0) || !Number.isFinite(s0) || !Number.isFinite(f1) || !Number.isFinite(s1)) {
      continue;
    }

    const crossUp = f0 <= s0 && f1 > s1;
    const crossDown = f0 >= s0 && f1 < s1;
    const px = closes[i]!;
    const t = times[i]!;

    if (crossUp) {
      const reason = `SMA${fastN} crossed above SMA${slowN}`;
      if (side === 'sell') closePosition(t, px, reason);
      if (side !== 'buy') openPosition('buy', t, px, reason);
      else pushEvent({ time: t, price: px, kind: 'signal', label: reason, side: 'buy' });
    } else if (crossDown) {
      const reason = `SMA${fastN} crossed below SMA${slowN}`;
      if (side === 'buy') closePosition(t, px, reason);
      if (side !== 'sell') openPosition('sell', t, px, reason);
      else pushEvent({ time: t, price: px, kind: 'signal', label: reason, side: 'sell' });
    }
  }

  if (side && n > 0) {
    closePosition(times[n - 1]!, closes[n - 1]!, 'End of session window');
  } else if (n > 0 && (equity.length === 0 || equity[equity.length - 1]!.time !== times[n - 1]!)) {
    equity.push({ time: times[n - 1]!, equity: equityIdx });
  }

  return {
    trades,
    events,
    equity,
    finalEquity: equity.length > 0 ? equity[equity.length - 1]!.equity : 1,
    totalPnl,
  };
}
