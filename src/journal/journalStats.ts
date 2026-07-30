/**
 * O(trades) / O(equity points) stats — never touch OHLC bars.
 */
import type { BacktestResult, BacktestTrade, EquityPoint } from '@/types/backtest';

export interface JournalStats {
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  /** Sum of trade pnl (price units). */
  netPnl: number;
  /** Final equity index (start = 1). */
  finalEquity: number;
  /** (finalEquity − 1) × 100. */
  equityReturnPct: number;
  /** Average winning pnl / |average losing pnl|; null if no wins or losses. */
  payoffR: number | null;
  maxEquity: number;
  minEquity: number;
}

export function computeJournalStats(result: BacktestResult): JournalStats {
  return computeFromTrades(result.trades, result.equity, result.finalEquity, result.totalPnl);
}

export function computeFromTrades(
  trades: readonly BacktestTrade[],
  equity: readonly EquityPoint[],
  finalEquity: number,
  totalPnl: number,
): JournalStats {
  let wins = 0;
  let losses = 0;
  let winSum = 0;
  let lossSum = 0;

  for (const t of trades) {
    if (t.pnl > 0) {
      wins += 1;
      winSum += t.pnl;
    } else if (t.pnl < 0) {
      losses += 1;
      lossSum += t.pnl;
    }
  }

  const tradeCount = trades.length;
  const winRate = tradeCount > 0 ? wins / tradeCount : null;

  let payoffR: number | null = null;
  if (wins > 0 && losses > 0) {
    const avgWin = winSum / wins;
    const avgLoss = Math.abs(lossSum / losses);
    if (avgLoss > 0) payoffR = avgWin / avgLoss;
  }

  let maxEquity = finalEquity;
  let minEquity = finalEquity;
  if (equity.length > 0) {
    maxEquity = -Infinity;
    minEquity = Infinity;
    for (const p of equity) {
      if (p.equity > maxEquity) maxEquity = p.equity;
      if (p.equity < minEquity) minEquity = p.equity;
    }
  }

  return {
    tradeCount,
    wins,
    losses,
    winRate,
    netPnl: totalPnl,
    finalEquity,
    equityReturnPct: (finalEquity - 1) * 100,
    payoffR,
    maxEquity: Number.isFinite(maxEquity) ? maxEquity : finalEquity,
    minEquity: Number.isFinite(minEquity) ? minEquity : finalEquity,
  };
}
