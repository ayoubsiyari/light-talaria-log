/**
 * Donchian channel breakout — runs inside the backtest Worker only.
 * Long/flat: enter when close breaks above prior N-bar high; exit on break below prior N-bar low.
 */
import type {
  BacktestCostParams,
  BacktestTrade,
  DonchianBreakoutParams,
  EquityPoint,
} from '@/types/backtest';

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
  const equity: EquityPoint[] = [];

  if (n === 0 || period < 2) {
    return { trades, equity, finalEquity: 1, totalPnl: 0 };
  }

  let equityIdx = 1;
  let totalPnl = 0;
  let inLong = false;
  let entryTime = 0;
  let entryPrice = 0;
  let tradeSeq = 0;

  equity.push({ time: times[0]!, equity: equityIdx });

  for (let i = 1; i < n; i++) {
    const ch = channelAt(highs, lows, i, period);
    if (!ch) continue;

    const hi = highs[i]!;
    const lo = lows[i]!;
    const px = closes[i]!;
    const t = times[i]!;
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || !Number.isFinite(px)) continue;

    // Breakout on range extremes (high/low); fill at close for v1 simplicity.
    if (!inLong && hi > ch.hi) {
      inLong = true;
      entryTime = t;
      entryPrice = applyBuyCost(px, costs);
    } else if (inLong && lo < ch.lo) {
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
