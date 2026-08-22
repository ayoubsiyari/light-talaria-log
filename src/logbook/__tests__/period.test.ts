import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeLogbookStats } from '../logbookStats';
import { filterByPeriod, periodStartUnix } from '../period';
import type { LogbookTrade } from '../types';

function closed(id: string, closeTime: number, netPnl: number): LogbookTrade {
  return {
    id,
    source: 'manual',
    status: 'closed',
    symbol: 'ES',
    side: 'long',
    openTime: closeTime - 3600,
    closeTime,
    entryPrice: 5000,
    exitPrice: 5010,
    size: 1,
    stopPrice: null,
    targetPrice: null,
    commission: 0,
    netPnl,
    rMultiple: 1,
    setup: null,
    tags: [],
    grade: null,
    emotion: null,
    rulesFollowed: true,
    plan: '',
    review: '',
    accountId: null,
    accountName: null,
    accountKind: null,
    platform: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('periodStartUnix', () => {
  it('uses local Monday 00:00 for week and the 1st for month', () => {
    const thursday = Math.floor(Date.UTC(2026, 7, 20, 18, 0, 0) / 1000);
    const weekStart = periodStartUnix('week', thursday);
    const monthStart = periodStartUnix('month', thursday);
    assert.ok(weekStart != null && monthStart != null);
    const week = new Date(weekStart * 1000);
    const month = new Date(monthStart * 1000);
    assert.equal(week.getDay(), 1);
    assert.equal(week.getHours(), 0);
    assert.equal(month.getDate(), 1);
    assert.equal(month.getMonth(), 7);
    assert.equal(periodStartUnix('all', thursday), null);
  });
});

describe('filterByPeriod', () => {
  it('keeps this week, this month, and all as distinct slices', () => {
    const nowMs = Date.UTC(2026, 7, 20, 18, 0, 0);
    const nowSec = Math.floor(nowMs / 1000);
    const trades = [
      closed('week', Math.floor(Date.UTC(2026, 7, 18, 12, 0, 0) / 1000), 100),
      closed('month', Math.floor(Date.UTC(2026, 7, 5, 12, 0, 0) / 1000), 50),
      closed('prior', Math.floor(Date.UTC(2026, 6, 22, 12, 0, 0) / 1000), -20),
    ];
    const week = filterByPeriod(trades, 'week', nowSec).map((t) => t.id);
    const month = filterByPeriod(trades, 'month', nowSec).map((t) => t.id);
    const all = filterByPeriod(trades, 'all', nowSec).map((t) => t.id);
    assert.deepEqual(week, ['week']);
    assert.deepEqual(month, ['week', 'month']);
    assert.deepEqual(all, ['week', 'month', 'prior']);

    assert.equal(computeLogbookStats(trades, 'week', nowSec).netPnl, 100);
    assert.equal(computeLogbookStats(trades, 'month', nowSec).netPnl, 150);
    assert.equal(computeLogbookStats(trades, 'all', nowSec).netPnl, 130);
  });
});
