import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { csvToDrafts, tradesToCsv } from '../logbookCsv';
import { fixtureTenTrades } from './fixture';

describe('logbookCsv', () => {
  it('roundtrips tickets', () => {
    const trades = fixtureTenTrades().slice(0, 3);
    const csv = tradesToCsv(trades);
    const { drafts, errors } = csvToDrafts(csv);
    assert.equal(errors.length, 0);
    assert.equal(drafts.length, 3);
    assert.equal(drafts[0]?.symbol, trades[0]?.symbol);
    assert.equal(drafts[0]?.side, trades[0]?.side);
    assert.equal(drafts[0]?.entryPrice, trades[0]?.entryPrice);
  });

  it('rejects a row without a side', () => {
    const csv = 'id,symbol,side,openTime,entryPrice,size\n1,ES,,1700000000,5000,1\n';
    const { drafts, errors } = csvToDrafts(csv);
    assert.equal(drafts.length, 0);
    assert.ok(errors.length > 0);
  });
});
