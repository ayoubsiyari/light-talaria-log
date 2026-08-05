/**
 * Idempotent example backtest session + order journal (200 closed trades)
 * with full enrichment fields so Dashboard / Analytics look real.
 */

import { generateSyntheticTrades } from '@/analytics/fixture';
import {
  createJournal,
  loadJournal,
  persistJournal,
  type JournalEntry,
  type OrderJournal,
} from '@/orders/journal';
import { upsertSession } from '@/sessions/sessionStore';
import type { BacktestSession } from '@/types/session';

export const EXAMPLE_ANALYTICS_SESSION_ID = 'talaria-example-analytics-200';
const EXAMPLE_TRADE_COUNT = 200;
const EXAMPLE_START_BALANCE = 10_000;

/** Build POSITION_OPENED / POSITION_CLOSED journal matching live engine payloads. */
export function buildExampleOrderJournal(
  sessionId: string = EXAMPLE_ANALYTICS_SESSION_ID,
  n: number = EXAMPLE_TRADE_COUNT,
): OrderJournal {
  // Recent-ish window so hour/weekday charts look populated.
  const startTime = Date.UTC(2026, 4, 1, 8, 0, 0) / 1000; // 2026-05-01
  const closed = generateSyntheticTrades({
    n,
    seed: 0x2e0_a200,
    startBalance: EXAMPLE_START_BALANCE,
    startTime,
  });

  const journal = createJournal(sessionId, {
    symbol: 'EURUSD',
    accountCurrency: 'USD',
    balance: EXAMPLE_START_BALANCE,
    leverage: 100,
    mode: 'netting',
  });

  const entries: JournalEntry[] = [];
  let seq = 1;
  const recordedAtMs = Date.now();

  for (let i = 0; i < closed.length; i++) {
    const t = closed[i]!;
    const positionId = `ex-pos-${i}`;
    const side = t.side === 'LONG' ? 'BUY' : 'SELL';

    // Correlate exit reason with outcome (fixture exits are random).
    const exitReason =
      t.rMultiple != null && t.rMultiple > 0
        ? t.rMultiple >= 1.8
          ? 'TP'
          : i % 11 === 0
            ? 'TRAILING'
            : 'MANUAL'
        : t.rMultiple != null && t.rMultiple <= -0.95
          ? i % 17 === 0
            ? 'STOP_OUT'
            : 'SL'
          : 'MANUAL';

    entries.push({
      seq: seq++,
      cursorTime: t.openTime,
      type: 'POSITION_OPENED',
      payload: {
        positionId,
        side,
        entryPrice: t.entryPrice,
        size: t.size,
        symbol: t.symbol,
      },
      recordedAtMs,
    });

    entries.push({
      seq: seq++,
      cursorTime: t.closeTime,
      type: 'POSITION_CLOSED',
      payload: {
        positionId,
        side,
        symbol: t.symbol,
        openedAt: t.openTime,
        entryPrice: t.entryPrice,
        // Engine field name (also accept fillsPrice in projector for typos).
        fillPrice: t.exitPrice,
        size: t.size,
        initialStopPrice: t.initialStopPrice,
        initialTargetPrice: t.initialTargetPrice,
        mfePrice: t.mfePrice,
        maePrice: t.maePrice,
        grossPnLAccount: t.grossPnl,
        commissionAccount: t.commission,
        swapAccount: t.swap,
        netPnLAccount: t.netPnl,
        rMultiple: t.rMultiple,
        exitReason,
        ambiguous: t.ambiguousFill,
        pnlApproximate: t.pnlApproximate,
        riskPct: t.riskPct,
        tags: t.tags,
        entryBarHigh: t.entryBarHigh,
        entryBarLow: t.entryBarLow,
      },
      recordedAtMs,
    });
  }

  return { ...journal, entries };
}

function exampleSessionRecord(): BacktestSession {
  return {
    id: EXAMPLE_ANALYTICS_SESSION_ID,
    name: 'Example · 200 trades (analytics)',
    pair: 'EUR/USD',
    timeframe: '15m',
    startDate: '2026-05-01',
    endDate: '2026-07-31',
    datasetId: 'example-analytics-sample',
    legs: [{ pair: 'EUR/USD', datasetId: 'example-analytics-sample' }],
    createdAt: Date.UTC(2026, 4, 1),
  };
}

/**
 * Ensure the example session + 200-trade journal exist in localStorage.
 * @returns true when something was written (UI should refresh).
 */
export function ensureExampleAnalyticsSession(opts?: {
  /** Rewrite journal even if present (Dashboard “Reset example”). */
  force?: boolean;
}): boolean {
  if (typeof localStorage === 'undefined') return false;

  const existing = loadJournal(EXAMPLE_ANALYTICS_SESSION_ID);
  const closedCount =
    existing?.entries.filter((e) => e.type === 'POSITION_CLOSED').length ?? 0;
  const needJournal =
    opts?.force === true || !existing || closedCount < EXAMPLE_TRADE_COUNT;

  let wrote = false;
  if (needJournal) {
    // Local demo only — never upload the sample into a real account's cloud.
    persistJournal(buildExampleOrderJournal(), { skipCloud: true });
    wrote = true;
  }

  // Keep the labeled session row visible in Backtest / Trades (local cache only).
  upsertSession(exampleSessionRecord(), { skipCloud: true });
  return wrote;
}
