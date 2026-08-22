/**
 * Local-only sample ledger so the cream desk looks lived-in.
 * Writes into this browser's logbook IDB for the signed-in (or anon) scope.
 * Never overwrites a book that already has tickets.
 */
import { draftToTrade } from './compute';
import type { LogbookAccount, LogbookDraft, LogbookTrade } from './types';

const HOUR = 3600;

const FTMO: LogbookAccount = {
  id: 'demo-acct-ftmo',
  name: 'FTMO 100k',
  kind: 'prop',
  platform: 'MT5',
  firm: 'FTMO',
  balance: 100_000,
  onHome: true,
  rules: {
    dailyLossPct: 5,
    maxLossPct: 10,
    profitTargetPct: 10,
    maxRiskPct: 1,
    minTradingDays: 4,
    newsTrading: false,
    weekendHold: false,
    notes: 'No holding through red news. Flat Friday 21:00 UTC.',
  },
  createdAt: 1,
  updatedAt: 1,
};

const OANDA: LogbookAccount = {
  id: 'demo-acct-demo',
  name: 'OANDA practice',
  kind: 'demo',
  platform: 'cTrader',
  firm: null,
  balance: 10_000,
  onHome: false,
  rules: null,
  createdAt: 1,
  updatedAt: 1,
};

function mondayLocal(nowMs: number): Date {
  const x = new Date(nowMs);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
}

function closed(
  id: string,
  partial: Omit<
    LogbookDraft,
    | 'id'
    | 'pnlOverride'
    | 'rOverride'
    | 'commission'
    | 'accountId'
    | 'accountName'
    | 'accountKind'
    | 'platform'
  > & {
    commission?: number;
    accountId?: string | null;
    accountName?: string | null;
    accountKind?: LogbookDraft['accountKind'];
    platform?: string | null;
  },
  nowMs: number,
): LogbookTrade {
  return draftToTrade(
    {
      id,
      commission: 0,
      pnlOverride: true,
      rOverride: true,
      accountId: FTMO.id,
      accountName: FTMO.name,
      accountKind: FTMO.kind,
      platform: FTMO.platform,
      ...partial,
    },
    nowMs,
  );
}

/** Sample tickets: this week, earlier this month, and last month — so Week / Month / All differ. */
export function buildExampleLogbook(
  nowMs: number = Date.now(),
): { trades: LogbookTrade[]; setups: string[]; accounts: LogbookAccount[] } {
  const monday = mondayLocal(nowMs);
  const nowSec = Math.floor(nowMs / 1000);
  const at = (dayOffset: number, hour: number, minute = 12): number => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    let t = Math.floor(d.getTime() / 1000);
    if (t > nowSec) t -= 7 * 86400;
    return t;
  };
  const setups = ['Opening range', 'London break', 'NY open'];

  const trades: LogbookTrade[] = [
    closed(
      'demo-1',
      {
        symbol: 'EURUSD',
        side: 'long',
        openTime: at(0, 8, 14),
        closeTime: at(0, 9, 2),
        entryPrice: 1.0872,
        exitPrice: 1.0918,
        size: 1,
        stopPrice: 1.084,
        targetPrice: 1.094,
        netPnl: 460,
        rMultiple: 1.4,
        setup: 'Opening range',
        tags: ['orb', 'london'],
        grade: 'A',
        emotion: 'calm',
        rulesFollowed: true,
        plan: 'Long the London open range hold.',
        review: 'Left a little on the table. Fine.',
      },
      nowMs,
    ),
    closed(
      'demo-2',
      {
        symbol: 'NQ',
        side: 'short',
        openTime: at(0, 10, 5),
        closeTime: at(0, 10, 48),
        entryPrice: 19840,
        exitPrice: 19792,
        size: 1,
        stopPrice: 19872,
        targetPrice: 19760,
        netPnl: 960,
        rMultiple: 1.5,
        setup: 'NY open',
        tags: ['ny', 'fade'],
        grade: 'A',
        emotion: 'confident',
        rulesFollowed: true,
        plan: 'Fade the first spike into supply.',
        review: 'Held the stop. Clean.',
        accountId: OANDA.id,
        accountName: OANDA.name,
        accountKind: OANDA.kind,
        platform: OANDA.platform,
      },
      nowMs,
    ),
    closed(
      'demo-3',
      {
        symbol: 'ES',
        side: 'long',
        openTime: at(1, 9, 20),
        closeTime: at(1, 9, 55),
        entryPrice: 5624,
        exitPrice: 5611,
        size: 1,
        stopPrice: 5612,
        targetPrice: 5648,
        netPnl: -650,
        rMultiple: -1.1,
        setup: 'Opening range',
        tags: ['late'],
        grade: 'C',
        emotion: 'fomo',
        rulesFollowed: false,
        plan: 'Wait for the retest. Did not.',
        review: 'Chased. Size was fine; timing was not.',
      },
      nowMs,
    ),
    closed(
      'demo-4',
      {
        symbol: 'GBPUSD',
        side: 'short',
        openTime: at(1, 11, 8),
        closeTime: at(1, 12, 1),
        entryPrice: 1.274,
        exitPrice: 1.2694,
        size: 0.8,
        stopPrice: 1.2772,
        targetPrice: 1.266,
        netPnl: 368,
        rMultiple: 1.4,
        setup: 'London break',
        tags: ['london'],
        grade: 'B',
        emotion: 'calm',
        rulesFollowed: true,
        plan: 'Break of the London low, first pullback.',
        review: 'Took 1.4R. Target was further.',
      },
      nowMs,
    ),
    closed(
      'demo-5',
      {
        symbol: 'CL',
        side: 'long',
        openTime: at(2, 8, 40),
        closeTime: at(2, 9, 18),
        entryPrice: 78.42,
        exitPrice: 79.1,
        size: 1,
        stopPrice: 77.9,
        targetPrice: 79.6,
        netPnl: 680,
        rMultiple: 1.3,
        setup: 'Opening range',
        tags: ['orb', 'oil'],
        grade: 'A',
        emotion: 'calm',
        rulesFollowed: true,
        plan: 'Hold above the Asia range.',
        review: 'Worked. Scaled nothing — full off at +1.3R.',
      },
      nowMs,
    ),
    closed(
      'demo-6',
      {
        symbol: 'EURUSD',
        side: 'short',
        openTime: at(2, 13, 4),
        closeTime: at(2, 13, 41),
        entryPrice: 1.0904,
        exitPrice: 1.0938,
        size: 1,
        stopPrice: 1.093,
        targetPrice: 1.084,
        netPnl: -340,
        rMultiple: -1,
        setup: 'London break',
        tags: ['revenge'],
        grade: 'F',
        emotion: 'revenge',
        rulesFollowed: false,
        plan: 'No plan. Flattened the morning win.',
        review: 'Stop logging after a green morning.',
      },
      nowMs,
    ),
    closed(
      'demo-7',
      {
        symbol: 'NQ',
        side: 'long',
        openTime: at(3, 9, 6),
        closeTime: at(3, 10, 22),
        entryPrice: 19710,
        exitPrice: 19805,
        size: 1,
        stopPrice: 19655,
        targetPrice: 19840,
        netPnl: 1900,
        rMultiple: 1.7,
        setup: 'NY open',
        tags: ['ny', 'trend'],
        grade: 'A+',
        emotion: 'confident',
        rulesFollowed: true,
        plan: 'Trend day. Buy the first higher low.',
        review: 'Best ticket of the week.',
      },
      nowMs,
    ),
    closed(
      'demo-8',
      {
        symbol: 'USDJPY',
        side: 'long',
        openTime: at(3, 12, 10),
        closeTime: at(3, 12, 44),
        entryPrice: 148.22,
        exitPrice: 148.01,
        size: 1,
        stopPrice: 147.9,
        targetPrice: 148.8,
        netPnl: -210,
        rMultiple: -0.7,
        setup: 'London break',
        tags: ['late'],
        grade: 'B',
        emotion: 'anxious',
        rulesFollowed: true,
        plan: 'Scratch if it does not go in 20 minutes.',
        review: 'Scratched. Rules held.',
      },
      nowMs,
    ),
    closed(
      'demo-9',
      {
        symbol: 'ES',
        side: 'short',
        openTime: at(4, 10, 18),
        closeTime: at(4, 11, 5),
        entryPrice: 5648,
        exitPrice: 5629,
        size: 1,
        stopPrice: 5662,
        targetPrice: 5610,
        netPnl: 950,
        rMultiple: 1.4,
        setup: 'NY open',
        tags: ['ny'],
        grade: 'A',
        emotion: 'calm',
        rulesFollowed: true,
        plan: 'Failed high of day.',
        review: 'Covered into the round number.',
      },
      nowMs,
    ),
    closed(
      'demo-10',
      {
        symbol: 'GBPUSD',
        side: 'long',
        openTime: at(-10, 9, 8),
        closeTime: at(-10, 10, 2),
        entryPrice: 1.274,
        exitPrice: 1.2812,
        size: 1,
        stopPrice: 1.269,
        targetPrice: 1.284,
        netPnl: 420,
        rMultiple: 1.1,
        setup: 'London break',
        tags: ['london'],
        grade: 'B',
        emotion: 'calm',
        rulesFollowed: true,
        plan: 'Earlier in the month. Buy the London hold.',
        review: 'Fine. Not this week.',
      },
      nowMs,
    ),
    closed(
      'demo-11',
      {
        symbol: 'NQ',
        side: 'short',
        openTime: at(-25, 14, 20),
        closeTime: at(-25, 15, 4),
        entryPrice: 19640,
        exitPrice: 19688,
        size: 1,
        stopPrice: 19610,
        targetPrice: 19540,
        netPnl: -480,
        rMultiple: -0.8,
        setup: 'NY open',
        tags: ['late'],
        grade: 'C',
        emotion: 'fomo',
        rulesFollowed: false,
        plan: 'Last month. Chase after the impulse.',
        review: 'Should have sat it out.',
      },
      nowMs,
    ),
    draftToTrade(
      {
        id: 'demo-open-1',
        symbol: 'EURUSD',
        side: 'long',
        openTime: Math.min(at(4, 13, 8), nowSec - HOUR),
        closeTime: null,
        entryPrice: 1.0888,
        exitPrice: null,
        size: 0.5,
        stopPrice: 1.0855,
        targetPrice: 1.096,
        commission: 0,
        netPnl: null,
        rMultiple: null,
        pnlOverride: false,
        rOverride: false,
        setup: 'London break',
        tags: ['open'],
        grade: null,
        emotion: 'calm',
        rulesFollowed: true,
        plan: 'Still working. Stop is the London low.',
        review: '',
        accountId: FTMO.id,
        accountName: FTMO.name,
        accountKind: FTMO.kind,
        platform: FTMO.platform,
      },
      nowMs,
    ),
    draftToTrade(
      {
        id: 'demo-open-2',
        symbol: 'GC',
        side: 'short',
        openTime: Math.min(at(5, 8, 22), nowSec - 1800),
        closeTime: null,
        entryPrice: 2488,
        exitPrice: null,
        size: 1,
        stopPrice: 2496,
        targetPrice: 2464,
        commission: 0,
        netPnl: null,
        rMultiple: null,
        pnlOverride: false,
        rOverride: false,
        setup: 'Opening range',
        tags: ['gold'],
        grade: null,
        emotion: 'anxious',
        rulesFollowed: true,
        plan: 'Fade the spike. Half off if we tag 2476.',
        review: '',
        accountId: OANDA.id,
        accountName: OANDA.name,
        accountKind: OANDA.kind,
        platform: OANDA.platform,
      },
      nowMs,
    ),
  ];

  return { trades, setups, accounts: [FTMO, OANDA] };
}
