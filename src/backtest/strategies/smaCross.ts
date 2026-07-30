/**
 * SMA crossover strategy — runs inside the backtest Worker only.
 * Long/flat: enter on fast cross above slow; exit on cross below.
 */
import { computeSma } from '@/indicators/smaEma';
import type {
  BacktestCostParams,
  BacktestTrade,
  EquityPoint,
  SmaCrossParams,
} from '@/types/backtest';

export interface SmaCrossInput {
  times: Float64Array;
  closes: Float32Array;
  sma: SmaCrossParams;
  costs: BacktestCostParams;
}

export interface SmaCrossOutput {
  trades: BacktestTrade[];
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

export function runSmaCross(input: SmaCrossInput): SmaCrossOutput {
  const { times, closes, sma, costs } = input;
  const n = closes.length;
  const trades: BacktestTrade[] = [];
  const equity: EquityPoint[] = [];

  if (n === 0 || sma.fastPeriod < 1 || sma.slowPeriod <= sma.fastPeriod) {
    return { trades, equity, finalEquity: 1, totalPnl: 0 };
  }

  const fast = computeSma(closes, sma.fastPeriod);
  const slow = computeSma(closes, sma.slowPeriod);

  let equityIdx = 1;
  let totalPnl = 0;
  let inLong = false;
  let entryTime = 0;
  let entryPrice = 0;
  let tradeSeq = 0;

  if (n > 0) {
    equity.push({ time: times[0]!, equity: equityIdx });
  }

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

    if (!inLong && crossUp) {
      inLong = true;
      entryTime = t;
      entryPrice = applyBuyCost(px, costs);
    } else if (inLong && crossDown) {
      const exitPrice = applySellCost(px, costs);
      const pnl = exitPrice - entryPrice;
      const pnlPct = entryPrice !== 0 ? pnl / entryPrice : 0;
      equityIdx *= 1 + pnlPct;
      totalPnl += pnl;
      tradeSeq += 1;
      trades.push({
        id: `t${tradeSeq}`,
        side: 'buy',
        entryTime,
        entryPrice,
        exitTime: t,
        exitPrice,
        pnl,
        pnlPct,
      });
      equity.push({ time: t, equity: equityIdx });
      inLong = false;
    }
  }

  // Flat open position at last bar (mark-to-market, no forced fill in trade list)
  if (inLong && n > 0) {
    const lastPx = closes[n - 1]!;
    const mtm = applySellCost(lastPx, costs) - entryPrice;
    const mtmPct = entryPrice !== 0 ? mtm / entryPrice : 0;
    equity.push({ time: times[n - 1]!, equity: equityIdx * (1 + mtmPct) });
  } else if (n > 0 && (equity.length === 0 || equity[equity.length - 1]!.time !== times[n - 1]!)) {
    equity.push({ time: times[n - 1]!, equity: equityIdx });
  }

  return {
    trades,
    equity,
    finalEquity: equity.length > 0 ? equity[equity.length - 1]!.equity : 1,
    totalPnl,
  };
}
