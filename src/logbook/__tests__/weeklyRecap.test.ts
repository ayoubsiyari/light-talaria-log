import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { weeklyRecap } from '../weeklyRecap';
import { fixtureTenTrades } from './fixture';

describe('weeklyRecap', () => {
  it('summarizes the last seven days only', () => {
    const trades = fixtureTenTrades();
    const lastClose = trades[trades.length - 1]!.closeTime!;
    const recap = weeklyRecap(trades, lastClose + 60);
    assert.ok(recap.closedCount > 0 && recap.closedCount <= 7);
    assert.ok(recap.ruleBreakRate == null || (recap.ruleBreakRate >= 0 && recap.ruleBreakRate <= 1));
  });
});
