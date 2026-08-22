import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LOGBOOK_TICKERS, specForSymbol, splitFavoriteTickers, tickersForTab } from '../catalog';
import { logbookGrossPnl, logbookRiskAccount } from '../instrumentCalc';
import { sizeFromRisk } from '@/orders/sizing';

describe('logbook catalog', () => {
  it('has unique tickers with pip and tick sizes', () => {
    const ids = LOGBOOK_TICKERS.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('EURUSD'));
    assert.ok(ids.includes('ES'));
    assert.ok(ids.includes('XAUUSD'));
    assert.ok(ids.includes('BTCUSD'));
    for (const t of LOGBOOK_TICKERS) {
      assert.ok(t.spec.tickSize > 0, t.id);
      assert.ok(t.spec.pipSize > 0, t.id);
      assert.ok(t.spec.contractSize > 0, t.id);
    }
  });

  it('pins favorite tickers first and keeps their order', () => {
    const { favorites, rest } = splitFavoriteTickers(LOGBOOK_TICKERS, ['ES', 'EURUSD', 'ES']);
    assert.deepEqual(
      favorites.map((t) => t.id),
      ['ES', 'EURUSD'],
    );
    assert.equal(rest.some((t) => t.id === 'ES' || t.id === 'EURUSD'), false);
    assert.ok(rest.length > 10);
  });

  it('filters the catalog by market tab', () => {
    const fx = tickersForTab('', 'fx', []);
    const fut = tickersForTab('', 'futures', []);
    const crypto = tickersForTab('', 'crypto', ['EURUSD']);
    const favs = tickersForTab('', 'favorites', ['ES', 'BTCUSD']);
    const all = tickersForTab('', 'all', ['ES']);
    assert.ok(fx.every((t) => t.group === 'Forex'));
    assert.ok(fut.every((t) => t.group === 'Futures'));
    assert.ok(crypto.every((t) => t.group === 'Crypto'));
    assert.ok(crypto.some((t) => t.id === 'BTCUSD'));
    assert.deepEqual(
      favs.map((t) => t.id),
      ['ES', 'BTCUSD'],
    );
    assert.equal(all[0]?.id, 'ES');
    assert.equal(fx.length + fut.length + crypto.length, LOGBOOK_TICKERS.length);
  });

  it('EURUSD 1 lot 50 pips is $500', () => {
    const spec = specForSymbol('EURUSD');
    assert.equal(spec.pipSize, 0.0001);
    assert.equal(spec.contractSize, 100_000);
    const pnl = logbookGrossPnl('EURUSD', 'long', 1.1, 1.105, 1, 0);
    assert.ok(pnl != null && Math.abs(pnl - 500) < 1e-6);
    const risk = logbookRiskAccount('EURUSD', 1.1, 1.098, 1);
    assert.ok(risk != null && Math.abs(risk - 200) < 1e-6);
  });

  it('ES 1 contract 10 points is $500', () => {
    const spec = specForSymbol('ES');
    assert.equal(spec.tickSize, 0.25);
    assert.equal(spec.contractSize, 50);
    const pnl = logbookGrossPnl('ES', 'long', 5000, 5010, 1, 0);
    assert.ok(pnl != null && Math.abs(pnl - 500) < 1e-6);
  });

  it('EURUSD 1% of $10k with 20-pip stop is 0.5 lots', () => {
    const spec = specForSymbol('EURUSD');
    const sized = sizeFromRisk({
      equity: 10_000,
      riskPercent: 0.01,
      entryPrice: 1.1,
      stopPrice: 1.098,
      spec,
      ctx: { accountCurrency: 'USD', instrumentPrice: 1.1 },
    });
    assert.ok(Math.abs(sized.lots - 0.5) < 1e-9);
    assert.ok(Math.abs(sized.requestedRiskAccount - 100) < 1e-6);
  });
});
