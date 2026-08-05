/**
 * Donchian channel breakout — runs inside the backtest Worker only.
 * Long/short flip: break above prior N-bar high → long; break below low → short.
 * Emits condition events for chart markers.
 */
import type {
  BacktestCostParams,
  BacktestEvent,
  BacktestTrade,
  DonchianBreakoutParams,
  EquityPoint,
} from '@/types/backtest';
import type { OrderSide } from '@/types/order';

export interface DonchianInput {
  times: Float64Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  donchian: DonchianBreakoutParams;
  costs: BacktestCostParams;
}

export interface DonchianOutput {
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

/** Highest high / lowest low over [i - period, i) — excludes bar i (no look-ahead). */
function channelAt(
  highs: Float32Array,
  lows: Float32Array,
  i: number,
  period: number,
): { hi: number; lo: number } | null {
  if (i < period) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = i - period; j < i; j++) {
    const h = highs[j]!;
    const l = lows[j]!;
    if (h > hi) hi = h;
    if (l < lo) lo = l;
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return { hi, lo };
}

export function runDonchianBreakout(input: DonchianInput): DonchianOutput {
  const { times, highs, lows, closes, donchian, costs } = input;
  const n = closes.length;
  const period = Math.floor(donchian.period);
  const trades: BacktestTrade[] = [];
  const events: BacktestEvent[] = [];
  const equity: EquityPoint[] = [];

  if (n === 0 || period < 2) {
    return { trades, events, equity, finalEquity: 1, totalPnl: 0 };
  }

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

  equity.push({ time: times[0]!, equity: equityIdx });

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
    const ch = channelAt(highs, lows, i, period);
    if (!ch) continue;

    const hi = highs[i]!;
    const lo = lows[i]!;
    const px = closes[i]!;
    const t = times[i]!;
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || !Number.isFinite(px)) continue;

    if (hi > ch.hi) {
      const reason = `Broke ${period}-bar high`;
      if (side === 'sell') closePosition(t, px, reason);
      if (side !== 'buy') openPosition('buy', t, px, reason);
      else pushEvent({ time: t, price: px, kind: 'signal', label: reason, side: 'buy' });
    } else if (lo < ch.lo) {
      const reason = `Broke ${period}-bar low`;
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
