/**
 * Shared automation executor — applies direction / RSI / trend / cooldown / SL·TP
 * on top of raw strategy flip signals. Worker-only.
 */
import { computeSma } from '@/indicators/smaEma';
import { computeRsi } from '@/indicators/rsi';
import type {
  AutomationRules,
  BacktestCostParams,
  BacktestEvent,
  BacktestTrade,
  EquityPoint,
} from '@/types/backtest';
import type { OrderSide } from '@/types/order';

export interface RawFlipSignal {
  /** Bar index where the base strategy wants this side. */
  i: number;
  side: OrderSide;
  label: string;
  /** Close any open position without opening the opposite side. */
  exitOnly?: boolean;
}

export interface AutomationInput {
  times: Float64Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  signals: readonly RawFlipSignal[];
  costs: BacktestCostParams;
  rules: AutomationRules;
  /** Period used for trend SMA when trendFilter is on. */
  trendPeriod: number;
}

export interface AutomationOutput {
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

function directionAllows(rules: AutomationRules, side: OrderSide): boolean {
  if (rules.direction === 'both') return true;
  if (rules.direction === 'long') return side === 'buy';
  return side === 'sell';
}

export function runAutomation(input: AutomationInput): AutomationOutput {
  const { times, highs, lows, closes, signals, costs, rules, trendPeriod } = input;
  const n = closes.length;
  const trades: BacktestTrade[] = [];
  const events: BacktestEvent[] = [];
  const equity: EquityPoint[] = [];

  if (n === 0) {
    return { trades, events, equity, finalEquity: 1, totalPnl: 0 };
  }

  const byBar = new Map<number, RawFlipSignal>();
  for (const s of signals) {
    if (s.i > 0 && s.i < n) byBar.set(s.i, s);
  }

  const rsi = rules.rsiEnabled
    ? computeRsi(closes, Math.max(2, Math.floor(rules.rsiPeriod)))
    : null;
  const trend = rules.trendFilter
    ? computeSma(closes, Math.max(2, Math.floor(trendPeriod)))
    : null;

  let equityIdx = 1;
  let totalPnl = 0;
  let side: OrderSide | null = null;
  let entryTime = 0;
  let entryPrice = 0;
  let entryReason = '';
  let openTradeId = '';
  let tradeSeq = 0;
  let eventSeq = 0;
  let cooldownUntil = -1;

  const pushEvent = (partial: Omit<BacktestEvent, 'id'>): void => {
    eventSeq += 1;
    events.push({ id: `e${eventSeq}`, ...partial });
  };

  equity.push({ time: times[0]!, equity: equityIdx });

  const closePosition = (
    t: number,
    px: number,
    reason: string,
    barIndex: number,
    /** When flipping into the opposite side, skip cooldown so reverse can open. */
    armCooldown = true,
  ): void => {
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
    if (armCooldown) {
      const cd = Math.max(0, Math.floor(rules.cooldownBars));
      cooldownUntil = barIndex + cd;
    }
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

  const passesFilters = (sig: RawFlipSignal, i: number): string | null => {
    if (!directionAllows(rules, sig.side)) {
      return `Blocked: ${rules.direction}-only`;
    }
    if (i < cooldownUntil) {
      return `Blocked: cooldown (${cooldownUntil - i} bars left)`;
    }
    if (rsi) {
      const r = rsi[i]!;
      if (!Number.isFinite(r)) return 'Blocked: RSI warming up';
      if (sig.side === 'buy' && r > rules.rsiLongBelow) {
        return `Blocked: RSI ${r.toFixed(0)} > ${rules.rsiLongBelow}`;
      }
      if (sig.side === 'sell' && r < rules.rsiShortAbove) {
        return `Blocked: RSI ${r.toFixed(0)} < ${rules.rsiShortAbove}`;
      }
    }
    if (trend) {
      const m = trend[i]!;
      const px = closes[i]!;
      if (!Number.isFinite(m)) return 'Blocked: trend SMA warming up';
      if (sig.side === 'buy' && px < m) return 'Blocked: price below trend SMA';
      if (sig.side === 'sell' && px > m) return 'Blocked: price above trend SMA';
    }
    return null;
  };

  for (let i = 1; i < n; i++) {
    const px = closes[i]!;
    const t = times[i]!;
    const hi = highs[i]!;
    const lo = lows[i]!;
    if (!Number.isFinite(px)) continue;

    // SL / TP on open position (checked before new signals)
    if (side) {
      const sl = rules.stopLossPct;
      const tp = rules.takeProfitPct;
      if (sl > 0 || tp > 0) {
        if (side === 'buy') {
          const dd = entryPrice > 0 ? (entryPrice - lo) / entryPrice : 0;
          const uu = entryPrice > 0 ? (hi - entryPrice) / entryPrice : 0;
          if (sl > 0 && dd >= sl) {
            closePosition(t, lo, `Stop loss −${(sl * 100).toFixed(2)}%`, i);
          } else if (tp > 0 && uu >= tp) {
            closePosition(t, hi, `Take profit +${(tp * 100).toFixed(2)}%`, i);
          }
        } else {
          const dd = entryPrice > 0 ? (hi - entryPrice) / entryPrice : 0;
          const uu = entryPrice > 0 ? (entryPrice - lo) / entryPrice : 0;
          if (sl > 0 && dd >= sl) {
            closePosition(t, hi, `Stop loss −${(sl * 100).toFixed(2)}%`, i);
          } else if (tp > 0 && uu >= tp) {
            closePosition(t, lo, `Take profit +${(tp * 100).toFixed(2)}%`, i);
          }
        }
      }
    }

    const sig = byBar.get(i);
    if (!sig) continue;

    if (sig.exitOnly) {
      if (side) {
        closePosition(t, px, sig.label, i, true);
      } else {
        pushEvent({
          time: t,
          price: px,
          kind: 'signal',
          label: `${sig.label} · flat`,
          side: sig.side,
        });
      }
      continue;
    }

    const block = passesFilters(sig, i);
    if (block) {
      pushEvent({
        time: t,
        price: px,
        kind: 'signal',
        label: `${sig.label} · ${block}`,
        side: sig.side,
      });
      continue;
    }

    if (side === sig.side) {
      pushEvent({
        time: t,
        price: px,
        kind: 'signal',
        label: sig.label,
        side: sig.side,
      });
      continue;
    }

    if (side && side !== sig.side) {
      closePosition(t, px, sig.label, i, false);
    }
    openPosition(sig.side, t, px, sig.label);
  }

  if (side && n > 0) {
    closePosition(times[n - 1]!, closes[n - 1]!, 'End of session window', n - 1);
  } else if (equity.length === 0 || equity[equity.length - 1]!.time !== times[n - 1]!) {
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
