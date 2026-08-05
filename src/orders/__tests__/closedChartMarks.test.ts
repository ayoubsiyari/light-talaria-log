/**
 * Closed-trade chart marks from the order journal.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createJournal, type OrderJournal } from '@/orders/journal';
import { closedChartOrdersFromJournal } from '@/orders/tradeJournal';

describe('closedChartOrdersFromJournal', () => {
  it('projects POSITION_CLOSED into chart marks with entry + exit', () => {
    const base = createJournal('marks-1', {
      symbol: 'USDJPY',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      mode: 'netting',
    });
    const journal: OrderJournal = {
      ...base,
      entries: [
        {
          seq: 1,
          cursorTime: 100,
          type: 'POSITION_OPENED',
          payload: {
            positionId: 'pos-1',
            side: 'BUY',
            entryPrice: 159.081,
            size: 0.1,
            symbol: 'USDJPY',
          },
          recordedAtMs: 0,
        },
        {
          seq: 2,
          cursorTime: 200,
          type: 'POSITION_CLOSED',
          payload: {
            positionId: 'pos-1',
            side: 'BUY',
            entryPrice: 159.081,
            fillPrice: 159.179,
            size: 0.1,
            netPnLAccount: 6.16,
            exitReason: 'TP',
            symbol: 'USDJPY',
            openedAt: 100,
          },
          recordedAtMs: 0,
        },
      ],
    };

    const marks = closedChartOrdersFromJournal(journal, 'marks-1');
    assert.equal(marks.length, 1);
    const m = marks[0]!;
    assert.equal(m.closed, true);
    assert.equal(m.entry, 159.081);
    assert.equal(m.exit, 159.179);
    assert.equal(m.exitAt, 200);
    assert.equal(m.exitReason, 'TP');
    assert.equal(m.realizedPnL, 6.16);
    assert.equal(m.side, 'buy');
    assert.equal(m.stopLoss, null);
    assert.equal(m.takeProfit, null);
  });
});
