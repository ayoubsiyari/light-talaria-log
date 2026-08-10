/**
 * Futures detection + contract sizing.
 * Run: npm run test:orders
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchFuturesRoot } from '@/orders/futuresSpec';
import {
  defaultSpecForSymbol,
  distanceUnitLabel,
  quantityUnitLabel,
  SPEC_ES,
} from '@/orders/instrumentSpec';
import { grossPnL, pipValueQuote } from '@/orders/pnl';

describe('Futures instrument specs', () => {
  it('detects ES / ES1 / continuous roots as futures contracts', () => {
    assert.ok(matchFuturesRoot('ES'));
    assert.ok(matchFuturesRoot('ES1'));
    assert.ok(matchFuturesRoot('MES'));
    assert.equal(matchFuturesRoot('EURUSD'), null);
    assert.equal(matchFuturesRoot('EUR/USD'), null);
  });

  it('uses contract quantity unit and CME-style multiplier', () => {
    const es = defaultSpecForSymbol('ES1');
    assert.equal(es.assetClass, 'futures');
    assert.equal(es.quantityUnit, 'contract');
    assert.equal(es.contractSize, 50);
    assert.equal(es.minLot, 1);
    assert.equal(es.lotStep, 1);
    assert.equal(quantityUnitLabel(es), 'Contracts');
    assert.equal(distanceUnitLabel(es), 'pts');

    const fx = defaultSpecForSymbol('EUR/USD');
    assert.equal(fx.assetClass, 'forex');
    assert.equal(fx.quantityUnit, 'lot');
    assert.equal(quantityUnitLabel(fx), 'Lots');
  });

  it('ES: 1 point × 1 contract = $50 quote PnL', () => {
    assert.equal(pipValueQuote(1, SPEC_ES), 50); // pointSize 1 × multiplier 50
    const pnl = grossPnL('BUY', 5000, 5010, 1, SPEC_ES, {
      accountCurrency: 'USD',
      instrumentPrice: 5010,
    });
    // 10 points × $50 = $500
    assert.ok(Math.abs(pnl.grossAccount.amount - 500) < 1e-6);
  });
});
