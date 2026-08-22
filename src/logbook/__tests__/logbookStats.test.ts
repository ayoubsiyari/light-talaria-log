import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeLogbookStats } from '../logbookStats';
import { fixtureTenTrades } from './fixture';

describe('logbookStats fixture', () => {
  it('matches the 10-trade spreadsheet check', () => {
    const s = computeLogbookStats(fixtureTenTrades(), 'all', 1_800_000_000);
    assert.equal(s.closedCount, 10);
    assert.equal(s.wins, 5);
    assert.equal(s.losses, 5);
    assert.equal(s.winRate, 0.5);
    assert.equal(s.netPnl, 105);
    assert.equal(s.expectancy, 10.5);
    assert.equal(s.avgWin, 71);
    assert.equal(s.avgLoss, -50);
    assert.ok(s.payoff != null && Math.abs(s.payoff - 1.42) < 0.01);
    assert.ok(s.profitFactor != null && Math.abs(s.profitFactor - 1.42) < 0.01);
    assert.equal(s.equity.at(-1)?.equity, 105);
    assert.equal(s.streak.kind, 'loss');
    assert.equal(s.streak.length, 1);
    assert.equal(s.maxDrawdown, 80);
    assert.equal(s.avgHoldSec, 3600);
    assert.equal(s.closes.length, 10);
    assert.equal(s.bySide.find((r) => r.key === 'Long')?.count, 7);
    assert.equal(s.bySide.find((r) => r.key === 'Short')?.count, 3);
    assert.equal(s.bestClose, 100);
    assert.equal(s.peakEquity, 185);
    assert.equal(s.lastClose?.pnl, -50);

    const revenge = s.byTag.find((r) => r.key === 'revenge');
    assert.ok(revenge);
    assert.equal(revenge.count, 4);
    assert.equal(revenge.wins, 0);
    assert.equal(revenge.netPnl, -190);
    assert.ok(Math.abs(revenge.volumeShare - 0.4) < 1e-9);
    assert.ok(Math.abs(revenge.lossShare - 190 / 250) < 1e-9);
  });
});
