/**
 * Project the event-sourced order journal into closed trades for the Journal UI.
 * These are the fills from Place Order / replay — not SMA strategy backtests.
 */

import { getSession, listSessions } from '@/sessions/sessionStore';
import {
  clearJournal,
  loadJournal,
  type JournalEntry,
  type OrderJournal,
} from './journal';
import type { TradeExitReason } from './orderTypes';

const STORAGE_PREFIX = 'talaria.orderJournal.v1:';

const EXIT_REASONS = new Set<TradeExitReason>([
  'TP',
  'SL',
  'MANUAL',
  'STOP_OUT',
  'TRAILING',
]);

export interface OrderTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  size: number;
  /** Realized net P&L in account currency. */
  pnlAccount: number;
  initialStopPrice: number | null;
  initialTargetPrice: number | null;
  grossPnlAccount: number;
  commissionAccount: number;
  swapAccount: number;
  rMultiple: number | null;
  mfePrice: number;
  maePrice: number;
  exitReason: TradeExitReason;
  ambiguousFill: boolean;
  pnlApproximate: boolean;
  tags: string[];
  riskPct: number | null;
  entryBarHigh: number | null;
  entryBarLow: number | null;
  balanceAfter: number;
}

export interface OrderJournalView {
  sessionId: string;
  sessionName: string;
  symbol: string;
  accountCurrency: string;
  startBalance: number;
  trades: OrderTrade[];
  /** Balance after each closed trade (absolute account equity samples). */
  equity: { time: number; equity: number }[];
  netPnl: number;
  finalBalance: number;
  eventCount: number;
}

function sessionLabel(sessionId: string, symbol: string): string {
  const s = getSession(sessionId);
  if (s?.name) return s.name;
  return symbol || sessionId;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asExitReason(v: unknown): TradeExitReason {
  if (typeof v === 'string' && EXIT_REASONS.has(v as TradeExitReason)) {
    return v as TradeExitReason;
  }
  return 'MANUAL';
}

function asTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t): t is string => typeof t === 'string' && t.length > 0);
}

/** Build closed-trade list from POSITION_OPENED / POSITION_CLOSED events. */
export function projectOrderJournal(journal: OrderJournal): OrderJournalView {
  const symbol = journal.bootstrap.symbol;
  const startBalance = journal.bootstrap.balance;
  const opens = new Map<
    string,
    { side: 'BUY' | 'SELL'; entryPrice: number; entryTime: number; size: number }
  >();
  const trades: OrderTrade[] = [];
  let balance = startBalance;
  const equity: { time: number; equity: number }[] = [
    { time: journal.entries[0]?.cursorTime ?? 0, equity: startBalance },
  ];

  for (const e of journal.entries) {
    if (e.type === 'POSITION_OPENED') {
      const id = asStr(e.payload.positionId);
      const side = asStr(e.payload.side);
      const entryPrice = asNum(e.payload.entryPrice);
      const size = asNum(e.payload.size);
      if (!id || (side !== 'BUY' && side !== 'SELL') || entryPrice == null || size == null) {
        continue;
      }
      opens.set(id, {
        side,
        entryPrice,
        entryTime: e.cursorTime,
        size,
      });
      continue;
    }

    if (e.type === 'POSITION_CLOSED') {
      const id = asStr(e.payload.positionId);
      const fillPrice = asNum(e.payload.fillPrice);
      const size = asNum(e.payload.size);
      const net = asNum(e.payload.netPnLAccount) ?? 0;
      if (!id || fillPrice == null || size == null) continue;
      const open = opens.get(id);
      opens.delete(id);
      balance += net;
      equity.push({ time: e.cursorTime, equity: balance });

      const sidePayload = asStr(e.payload.side);
      const side: 'buy' | 'sell' =
        sidePayload === 'BUY' || sidePayload === 'SELL'
          ? sidePayload === 'BUY'
            ? 'buy'
            : 'sell'
          : open
            ? open.side === 'BUY'
              ? 'buy'
              : 'sell'
            : 'buy';

      const entryPrice =
        asNum(e.payload.entryPrice) ?? open?.entryPrice ?? fillPrice;
      const entryTime =
        asNum(e.payload.openedAt) ?? open?.entryTime ?? e.cursorTime;
      const mfe = asNum(e.payload.mfePrice) ?? entryPrice;
      const mae = asNum(e.payload.maePrice) ?? entryPrice;

      trades.push({
        id: `${id}-${e.seq}`,
        symbol,
        side,
        entryTime,
        entryPrice,
        exitTime: e.cursorTime,
        exitPrice: fillPrice,
        size,
        pnlAccount: net,
        initialStopPrice: asNum(e.payload.initialStopPrice),
        initialTargetPrice: asNum(e.payload.initialTargetPrice),
        grossPnlAccount: asNum(e.payload.grossPnLAccount) ?? net,
        commissionAccount: asNum(e.payload.commissionAccount) ?? 0,
        swapAccount: asNum(e.payload.swapAccount) ?? 0,
        rMultiple: asNum(e.payload.rMultiple),
        mfePrice: mfe,
        maePrice: mae,
        exitReason: asExitReason(e.payload.exitReason),
        ambiguousFill: asBool(e.payload.ambiguous),
        pnlApproximate: asBool(e.payload.pnlApproximate),
        tags: asTags(e.payload.tags),
        riskPct: asNum(e.payload.riskPct),
        entryBarHigh: asNum(e.payload.entryBarHigh),
        entryBarLow: asNum(e.payload.entryBarLow),
        balanceAfter: balance,
      });
    }
  }

  const netPnl = trades.reduce((s, t) => s + t.pnlAccount, 0);
  return {
    sessionId: journal.sessionId,
    sessionName: sessionLabel(journal.sessionId, symbol),
    symbol,
    accountCurrency: journal.bootstrap.accountCurrency,
    startBalance,
    trades: trades.slice().reverse(), // newest first
    equity,
    netPnl,
    finalBalance: balance,
    eventCount: journal.entries.length,
  };
}

function listStoredSessionIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) {
      ids.push(k.slice(STORAGE_PREFIX.length));
    }
  }
  return ids;
}

/**
 * All order journals that have at least one closed trade, newest activity first.
 * `live` (current chart session bridge) is preferred when present.
 */
export function listOrderJournalViews(live?: OrderJournal | null): OrderJournalView[] {
  const byId = new Map<string, OrderJournal>();
  for (const id of listStoredSessionIds()) {
    const j = loadJournal(id);
    if (j) byId.set(id, j);
  }
  if (live?.sessionId) byId.set(live.sessionId, live);

  // Also surface sessions that exist but have empty journals (so UI can list them).
  for (const s of listSessions()) {
    if (!byId.has(s.id)) {
      const j = loadJournal(s.id);
      if (j) byId.set(s.id, j);
    }
  }

  const views = [...byId.values()]
    .map(projectOrderJournal)
    .filter((v) => v.trades.length > 0 || v.eventCount > 0);

  views.sort((a, b) => {
    const at = a.trades[0]?.exitTime ?? 0;
    const bt = b.trades[0]?.exitTime ?? 0;
    return bt - at;
  });
  return views;
}

export function getOrderJournalView(
  sessionId: string,
  live?: OrderJournal | null,
): OrderJournalView | null {
  const journal =
    live?.sessionId === sessionId ? live : loadJournal(sessionId);
  if (!journal) return null;
  return projectOrderJournal(journal);
}

export function clearOrderJournal(sessionId: string): void {
  clearJournal(sessionId);
}

/** Stats for the order-trade journal view. */
export function computeOrderJournalStats(view: OrderJournalView): {
  tradeCount: number;
  winRate: number | null;
  netPnl: number;
  finalBalance: number;
  returnPct: number;
  payoffR: number | null;
  minEquity: number;
  maxEquity: number;
} {
  const trades = view.trades;
  const wins = trades.filter((t) => t.pnlAccount > 0);
  const losses = trades.filter((t) => t.pnlAccount < 0);
  const winSum = wins.reduce((s, t) => s + t.pnlAccount, 0);
  const lossSum = losses.reduce((s, t) => s + Math.abs(t.pnlAccount), 0);
  const avgWin = wins.length ? winSum / wins.length : 0;
  const avgLoss = losses.length ? lossSum / losses.length : 0;
  let minEquity = Infinity;
  let maxEquity = -Infinity;
  for (const p of view.equity) {
    if (p.equity < minEquity) minEquity = p.equity;
    if (p.equity > maxEquity) maxEquity = p.equity;
  }
  if (!Number.isFinite(minEquity)) {
    minEquity = view.startBalance;
    maxEquity = view.startBalance;
  }
  return {
    tradeCount: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    netPnl: view.netPnl,
    finalBalance: view.finalBalance,
    returnPct:
      view.startBalance > 0
        ? ((view.finalBalance - view.startBalance) / view.startBalance) * 100
        : 0,
    payoffR: avgLoss > 0 ? avgWin / avgLoss : null,
    minEquity,
    maxEquity,
  };
}

/** @deprecated alias kept for greps — event row type from orders/journal */
export type { JournalEntry as OrderJournalEvent };
