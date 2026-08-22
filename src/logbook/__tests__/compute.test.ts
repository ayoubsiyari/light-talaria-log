import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeNetPnl,
  computePlannedR,
  computeRMultiple,
  draftToTrade,
  signedPriceMove,
  tradeStatus,
  validateDraft,
} from '../compute';
import type { LogbookDraft } from '../types';

function draft(partial: Partial<LogbookDraft> = {}): LogbookDraft {
  return {
    symbol: 'EURUSD',
    side: 'long',
    openTime: 1_700_000_000,
    closeTime: 1_700_003_600,
    entryPrice: 1.1,
    exitPrice: 1.12,
    size: 10,
    stopPrice: 1.09,
    targetPrice: 1.13,
    commission: 0,
    netPnl: null,
    rMultiple: null,
    pnlOverride: false,
    rOverride: false,
    setup: null,
    tags: [' ORB ', 'orb'],
    grade: 'A',
    emotion: 'calm',
    rulesFollowed: true,
    plan: '  wait  ',
    review: 'ok',
    accountId: null,
    accountName: null,
    accountKind: null,
    platform: null,
    ...partial,
  };
}

describe('logbook compute', () => {
  it('signed move flips with side', () => {
    assert.equal(signedPriceMove('long', 10, 12), 2);
    assert.equal(signedPriceMove('short', 10, 8), 2);
  });

  it('R and pnl from stop / size', () => {
    assert.equal(computeRMultiple('long', 100, 110, 95), 2);
    assert.equal(computePlannedR('long', 100, 95, 110), 2);
    assert.equal(computeNetPnl('long', 100, 110, 2, 4), 16);
  });

  it('draftToTrade computes closed fields and cleans tags', () => {
    const t = draftToTrade(draft(), 50);
    assert.equal(t.status, 'closed');
    assert.equal(t.symbol, 'EURUSD');
    assert.ok(t.netPnl != null && Math.abs(t.netPnl - 20_000) < 1e-6);
    assert.ok(t.rMultiple != null && Math.abs(t.rMultiple - 2) < 1e-9);
    assert.deepEqual(t.tags, ['orb']);
    assert.equal(t.plan, 'wait');
    assert.equal(t.createdAt, 50);
  });

  it('honors pnl/r overrides', () => {
    const t = draftToTrade(
      draft({ netPnl: 9, rMultiple: 3, pnlOverride: true, rOverride: true }),
      1,
    );
    assert.equal(t.netPnl, 9);
    assert.equal(t.rMultiple, 3);
  });

  it('override can leave R blank', () => {
    const t = draftToTrade(
      draft({ rMultiple: null, rOverride: true }),
      1,
    );
    assert.equal(t.rMultiple, null);
  });

  it('open trades drop exit metrics', () => {
    const t = draftToTrade(draft({ exitPrice: null, closeTime: null }), 1);
    assert.equal(t.status, 'open');
    assert.equal(t.netPnl, null);
    assert.equal(tradeStatus(null, null), 'open');
  });

  it('validateDraft catches missing close', () => {
    assert.equal(validateDraft(draft({ symbol: '' })), 'Symbol is required.');
    assert.equal(
      validateDraft(draft({ exitPrice: 1.12, closeTime: null })),
      'Closed trades need a close time.',
    );
  });
});
