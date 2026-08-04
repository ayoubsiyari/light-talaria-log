import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildExampleOrderJournal } from '@/analytics/exampleSession';
import { orderJournalToClosedTrades } from '@/analytics/fromJournal';
import { projectOrderJournal } from '@/orders/tradeJournal';

describe('example analytics session', () => {
  it('projects 200 closed trades with enrichment fields', () => {
    const journal = buildExampleOrderJournal();
    const view = projectOrderJournal(journal);
    assert.equal(view.trades.length, 200);

    const closed = orderJournalToClosedTrades(view);
    assert.equal(closed.length, 200);

    const sample = closed[0]!;
    assert.ok(sample.rMultiple != null && Number.isFinite(sample.rMultiple));
    assert.ok(sample.initialStopPrice != null);
    assert.ok(sample.initialTargetPrice != null);
    assert.ok(Number.isFinite(sample.mfePrice));
    assert.ok(Number.isFinite(sample.maePrice));
    assert.ok(Number.isFinite(sample.commission));
    assert.ok(sample.riskPct != null);
    assert.ok(sample.entryBarHigh != null);
    assert.ok(sample.entryBarLow != null);
    assert.ok(['TP', 'SL', 'MANUAL', 'STOP_OUT', 'TRAILING'].includes(sample.exitReason));
  });

  it('reads engine fillPrice (not fillsPrice typo)', () => {
    const journal = buildExampleOrderJournal('t', 1);
    const closed = journal.entries.find((e) => e.type === 'POSITION_CLOSED');
    assert.ok(closed);
    assert.equal(typeof closed!.payload.fillPrice, 'number');
    assert.equal(closed!.payload.fillsPrice, undefined);
    const view = projectOrderJournal(journal);
    assert.equal(view.trades.length, 1);
    assert.equal(view.trades[0]!.exitPrice, closed!.payload.fillPrice);
  });
});
