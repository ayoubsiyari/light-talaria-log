import type { OrderJournalView } from '@/orders/tradeJournal';
import type { ClosedTrade, ExitReason } from './types';

/** Map order-journal closed trades → analytics ClosedTrade (honest defaults for old journals). */
export function orderJournalToClosedTrades(view: OrderJournalView): ClosedTrade[] {
  // view.trades is newest-first; rebuild chronological for balance curve consistency
  const chrono = view.trades.slice().reverse();
  const out: ClosedTrade[] = new Array(chrono.length);
  for (let i = 0; i < chrono.length; i++) {
    const t = chrono[i]!;
    const long = t.side === 'buy';
    out[i] = {
      id: t.id,
      symbol: t.symbol || view.symbol,
      side: long ? 'LONG' : 'SHORT',
      openTime: t.entryTime,
      closeTime: t.exitTime,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      size: t.size,
      initialStopPrice: t.initialStopPrice,
      initialTargetPrice: t.initialTargetPrice,
      grossPnl: t.grossPnlAccount,
      commission: t.commissionAccount,
      swap: t.swapAccount,
      netPnl: t.pnlAccount,
      rMultiple: t.rMultiple,
      mfePrice: t.mfePrice,
      maePrice: t.maePrice,
      exitReason: t.exitReason as ExitReason,
      ambiguousFill: t.ambiguousFill,
      pnlApproximate: t.pnlApproximate,
      tags: t.tags,
      balanceAfter: t.balanceAfter,
      riskPct: t.riskPct,
      entryBarHigh: t.entryBarHigh,
      entryBarLow: t.entryBarLow,
    };
  }
  return out;
}
