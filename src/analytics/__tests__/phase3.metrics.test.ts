import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accumulateAll } from '../accumulators';
import { handFixture20 } from '../fixture';
import { deriveMetrics } from '../metrics';
import { buildTradeStore } from '../tradeStore';

describe('Phase 3 — metrics on hand fixture (20 trades)', () => {
  // 12 wins @ +100, 8 losses @ -80
  // net = 1200 - 640 = 560
  // PF = 1200/640 = 1.875
  // WR = 60%
  // avgWin = 100, avgLoss = 80, payoff = 1.25

  const store = buildTradeStore(handFixture20(), { initialBalance: 10_000 });
  const acc = accumulateAll(store);
  const metrics = deriveMetrics(acc, store);
  const byId = (id: number) => metrics.find((m) => m.id === id)!;

  it('core P&L', () => {
    assert.equal(byId(1).value, 560);
    assert.equal(byId(2).value, 1200);
    assert.equal(byId(3).value, -640);
    assert.ok(Math.abs((byId(4).value ?? 0) - 1.875) < 1e-9);
    assert.equal(byId(11).value, 20);
    assert.equal(byId(12).value, 12);
    assert.equal(byId(13).value, 8);
  });

  it('rates and payoff', () => {
    assert.ok(Math.abs((byId(15).value ?? 0) - 60) < 1e-9);
    assert.equal(byId(19).value, 100);
    assert.equal(byId(20).value, 80);
    assert.ok(Math.abs((byId(21).value ?? 0) - 1.25) < 1e-9);
  });

  it('L=0 profit factor is null not Infinity', () => {
    const allWins = handFixture20().map((t, i) =>
      i < 12 ? t : { ...t, netPnl: 50, grossPnl: 55 },
    );
    // force all positive
    for (const t of allWins) {
      if (t.netPnl < 0) {
        t.netPnl = 50;
        t.grossPnl = 55;
      }
    }
    const s = buildTradeStore(allWins);
    const a = accumulateAll(s);
    const ms = deriveMetrics(a, s);
    const pf = ms.find((m) => m.id === 4)!;
    assert.equal(pf.value, null);
    assert.equal(pf.infinite, true);
  });

  it('NaN R skipped in expectancy', () => {
    const trades = handFixture20();
    trades[0]!.rMultiple = null;
    const s = buildTradeStore(trades);
    const a = accumulateAll(s);
    assert.equal(a.sums.rCount, 19);
  });
});
