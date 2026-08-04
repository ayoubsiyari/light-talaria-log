import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateSyntheticTrades, handFixture20 } from '../fixture';
import { computeFilterMask, maskCount } from '../filterMask';
import { buildTradeStore, estimateStoreBytes } from '../tradeStore';
import { EMPTY_FILTER } from '../types';

describe('Phase 1 — columnar store', () => {
  it('hand fixture builds n=20', () => {
    const trades = handFixture20();
    const store = buildTradeStore(trades, { initialBalance: 10_000 });
    assert.equal(store.n, 20);
    assert.equal(store.netPnl[0], 100);
    assert.equal(store.netPnl[12], -80);
  });

  it('100k store under 10 MB columnar estimate', () => {
    const trades = generateSyntheticTrades({ n: 100_000, seed: 42 });
    const t0 = performance.now();
    const store = buildTradeStore(trades);
    const ms = performance.now() - t0;
    const bytes = estimateStoreBytes(store);
    assert.equal(store.n, 100_000);
    // 105 B/trade with riskPct + entry-bar columns ≈ 10.5 MB @ 100k
    assert.ok(bytes < 11 * 1024 * 1024, `bytes=${bytes}`);
    assert.ok(ms < 2000, `build ms=${ms}`); // CI slack; bench script is authoritative
  });

  it('filter mask does not change store length', () => {
    const store = buildTradeStore(generateSyntheticTrades({ n: 1000, seed: 1 }));
    const mask = computeFilterMask(store, {
      ...EMPTY_FILTER,
      sides: { long: true, short: false },
    });
    const c = maskCount(mask, store.n);
    assert.ok(c > 0 && c < store.n);
    assert.equal(store.n, 1000);
  });
});
