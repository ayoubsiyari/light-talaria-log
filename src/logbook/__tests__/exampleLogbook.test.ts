import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeTrade } from '../compute';
import { buildExampleLogbook } from '../exampleLogbook';
import { computeLogbookStats } from '../logbookStats';

describe('exampleLogbook', () => {
  it('builds a week of closed and open tickets', () => {
    const now = Date.UTC(2026, 7, 20, 18, 0, 0);
    const { trades, setups, accounts } = buildExampleLogbook(now);
    assert.ok(trades.length >= 12);
    assert.ok(setups.includes('Opening range'));
    assert.ok(accounts.some((a) => a.kind === 'prop' && a.platform === 'MT5'));
    assert.ok(trades.every((t) => t.accountKind === 'prop' || t.accountKind === 'demo'));
    assert.ok(trades.every((t) => normalizeTrade(t) != null));
    assert.ok(trades.some((t) => t.status === 'open'));
    assert.ok(trades.some((t) => t.status === 'closed' && (t.netPnl ?? 0) > 0));
  });

  it('gives Week / Month / All different closed counts', () => {
    const now = Date.UTC(2026, 7, 20, 18, 0, 0);
    const nowSec = Math.floor(now / 1000);
    const { trades } = buildExampleLogbook(now);
    const week = computeLogbookStats(trades, 'week', nowSec);
    const month = computeLogbookStats(trades, 'month', nowSec);
    const all = computeLogbookStats(trades, 'all', nowSec);
    assert.ok(week.closedCount > 0);
    assert.ok(week.closedCount < month.closedCount);
    assert.ok(month.closedCount < all.closedCount);
  });
});
