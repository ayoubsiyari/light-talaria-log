import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deleteLogbookTrade,
  getLogbookTrade,
  listLogbookTrades,
  listPlaybookSetups,
  replaceLogbookForTests,
  restoreLogbookTrade,
  upsertLogbookTrade,
} from '../logbookStore';
import type { LogbookDraft } from '../types';

function draft(partial: Partial<LogbookDraft> = {}): LogbookDraft {
  return {
    symbol: 'es',
    side: 'long',
    openTime: 1_700_000_000,
    closeTime: 1_700_003_600,
    entryPrice: 5000,
    exitPrice: 5010,
    size: 1,
    stopPrice: 4990,
    targetPrice: 5020,
    commission: 0,
    netPnl: 10,
    rMultiple: 1,
    pnlOverride: true,
    rOverride: true,
    setup: 'ORB',
    tags: ['orb'],
    grade: 'A',
    emotion: 'calm',
    rulesFollowed: true,
    plan: 'plan',
    review: 'review',
    accountId: null,
    accountName: null,
    accountKind: null,
    platform: null,
    ...partial,
  };
}

describe('logbookStore memory CRUD', () => {
  it('upsert, get, list, delete persist in memory', async () => {
    replaceLogbookForTests([]);
    const created = await upsertLogbookTrade(draft());
    assert.ok(created.id);
    assert.equal(created.symbol, 'ES');
    assert.equal(getLogbookTrade(created.id)?.netPnl, 10);
    assert.equal(listLogbookTrades().length, 1);
    assert.deepEqual(listPlaybookSetups(), []);

    await upsertLogbookTrade(draft({ id: created.id }), { addSetup: true });
    assert.ok(listPlaybookSetups().includes('ORB'));

    await upsertLogbookTrade({
      ...draft({ id: created.id, review: 'updated', netPnl: 12 }),
    });
    assert.equal(getLogbookTrade(created.id)?.review, 'updated');
    assert.equal(getLogbookTrade(created.id)?.netPnl, 12);

    const gone = await deleteLogbookTrade(created.id);
    assert.equal(gone?.id, created.id);
    assert.equal(getLogbookTrade(created.id), null);
    assert.equal(listLogbookTrades().length, 0);
  });

  it('restore puts a deleted ticket back', async () => {
    replaceLogbookForTests([]);
    const created = await upsertLogbookTrade(draft());
    const gone = await deleteLogbookTrade(created.id);
    assert.ok(gone);
    await restoreLogbookTrade(gone);
    assert.equal(getLogbookTrade(created.id)?.symbol, 'ES');
  });
});
