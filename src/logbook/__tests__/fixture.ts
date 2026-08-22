import type { LogbookTrade } from '../types';

/** 10 closed trades — hand-checkable stats fixture. */
export function fixtureTenTrades(): LogbookTrade[] {
  const base: Omit<LogbookTrade, 'id' | 'symbol' | 'side' | 'openTime' | 'closeTime' | 'entryPrice' | 'exitPrice' | 'netPnl' | 'rMultiple' | 'setup' | 'tags' | 'emotion' | 'rulesFollowed'> = {
    source: 'manual',
    status: 'closed',
    size: 1,
    stopPrice: null,
    targetPrice: null,
    commission: 0,
    grade: null,
    plan: '',
    review: '',
    accountId: null,
    accountName: null,
    accountKind: null,
    platform: null,
    createdAt: 1,
    updatedAt: 1,
  };

  const day = 86_400;
  const t0 = 1_700_000_000;

  return [
    { ...base, id: '1', symbol: 'EURUSD', side: 'long', openTime: t0, closeTime: t0 + 3600, entryPrice: 1.1, exitPrice: 1.2, netPnl: 100, rMultiple: 2, setup: 'A', tags: ['orb'], emotion: 'calm', rulesFollowed: true },
    { ...base, id: '2', symbol: 'EURUSD', side: 'long', openTime: t0 + day, closeTime: t0 + day + 3600, entryPrice: 1.1, exitPrice: 1.05, netPnl: -50, rMultiple: -1, setup: 'A', tags: ['revenge'], emotion: 'revenge', rulesFollowed: false },
    { ...base, id: '3', symbol: 'NQ', side: 'short', openTime: t0 + 2 * day, closeTime: t0 + 2 * day + 3600, entryPrice: 18000, exitPrice: 17920, netPnl: 80, rMultiple: 1.6, setup: 'B', tags: ['orb'], emotion: 'confident', rulesFollowed: true },
    { ...base, id: '4', symbol: 'ES', side: 'long', openTime: t0 + 3 * day, closeTime: t0 + 3 * day + 3600, entryPrice: 5000, exitPrice: 4990, netPnl: -50, rMultiple: -1, setup: 'A', tags: ['revenge'], emotion: 'revenge', rulesFollowed: false },
    { ...base, id: '5', symbol: 'CL', side: 'long', openTime: t0 + 4 * day, closeTime: t0 + 4 * day + 3600, entryPrice: 80, exitPrice: 80.55, netPnl: 55, rMultiple: 1.1, setup: 'B', tags: ['pullback'], emotion: 'calm', rulesFollowed: true },
    { ...base, id: '6', symbol: 'EURUSD', side: 'short', openTime: t0 + 5 * day, closeTime: t0 + 5 * day + 3600, entryPrice: 1.1, exitPrice: 1.14, netPnl: -40, rMultiple: -0.8, setup: 'A', tags: ['revenge'], emotion: 'tilted', rulesFollowed: false },
    { ...base, id: '7', symbol: 'NQ', side: 'long', openTime: t0 + 6 * day, closeTime: t0 + 6 * day + 3600, entryPrice: 18000, exitPrice: 18090, netPnl: 90, rMultiple: 1.8, setup: 'B', tags: ['orb'], emotion: 'calm', rulesFollowed: true },
    { ...base, id: '8', symbol: 'ES', side: 'short', openTime: t0 + 7 * day, closeTime: t0 + 7 * day + 3600, entryPrice: 5000, exitPrice: 5060, netPnl: -60, rMultiple: -1.2, setup: 'A', tags: ['late'], emotion: 'fomo', rulesFollowed: false },
    { ...base, id: '9', symbol: 'CL', side: 'long', openTime: t0 + 8 * day, closeTime: t0 + 8 * day + 3600, entryPrice: 80, exitPrice: 80.3, netPnl: 30, rMultiple: 0.6, setup: 'B', tags: ['pullback'], emotion: 'calm', rulesFollowed: true },
    { ...base, id: '10', symbol: 'EURUSD', side: 'long', openTime: t0 + 9 * day, closeTime: t0 + 9 * day + 3600, entryPrice: 1.1, exitPrice: 1.05, netPnl: -50, rMultiple: -1, setup: 'A', tags: ['revenge'], emotion: 'revenge', rulesFollowed: false },
  ];
}
