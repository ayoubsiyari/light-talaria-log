/**
 * Phase 1 — instrument spec + money math.
 * Hand-computed expected values; do not "fix" by changing fixtures silently.
 *
 * Run: npm run test:orders
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SPEC_EURGBP,
  SPEC_EURUSD,
  SPEC_USDJPY,
} from '@/orders/instrumentSpec';
import {
  grossPnL,
  pipValueAccount,
  pipValueQuote,
  quoteToAccountRate,
  rMultiple,
} from '@/orders/pnl';
import { sizeFromRisk } from '@/orders/sizing';

describe('Phase 1 — pip value', () => {
  it('EURUSD: 1 lot pip value = 10 USD (quote=account)', () => {
    // pipSize 0.0001 * contractSize 100000 = 10 quote
    assert.equal(pipValueQuote(1, SPEC_EURUSD), 10);
    const acct = pipValueAccount(1, SPEC_EURUSD, {
      accountCurrency: 'USD',
      instrumentPrice: 1.1,
    });
    assert.equal(acct.amount, 10);
    assert.equal(acct.currency, 'USD');
    assert.equal(acct.approximate, false);
  });

  it('USDJPY: 1 lot pip value = 1000 JPY → ~6.666… USD at 150.00', () => {
    // pipSize 0.01 * 100000 = 1000 JPY
    assert.equal(pipValueQuote(1, SPEC_USDJPY), 1000);
    // base=USD=account → rate = 1/150
    const acct = pipValueAccount(1, SPEC_USDJPY, {
      accountCurrency: 'USD',
      instrumentPrice: 150,
    });
    assert.ok(Math.abs(acct.amount - 1000 / 150) < 1e-9);
    assert.equal(acct.approximate, false);
  });

  it('EURGBP: 1 lot pip value = 10 GBP; needs GBP→USD conversion', () => {
    assert.equal(pipValueQuote(1, SPEC_EURGBP), 10);
    const missing = pipValueAccount(1, SPEC_EURGBP, {
      accountCurrency: 'USD',
      instrumentPrice: 0.85,
    });
    assert.equal(missing.approximate, true);

    const withRate = pipValueAccount(1, SPEC_EURGBP, {
      accountCurrency: 'USD',
      instrumentPrice: 0.85,
      conversionRateToAccount: 1.25, // GBPUSD
      forceApproximate: true,
    });
    assert.equal(withRate.amount, 12.5);
    assert.equal(withRate.approximate, true);
  });
});

describe('Phase 1 — §5.3 currency conversion cases', () => {
  it('case quote=account: EURUSD on USD → rate 1', () => {
    const r = quoteToAccountRate(SPEC_EURUSD, {
      accountCurrency: 'USD',
      instrumentPrice: 1.105,
    });
    assert.equal(r.caseId, 'quote');
    assert.equal(r.rate, 1);
    assert.equal(r.approximate, false);
  });

  it('case base=account: USDJPY on USD → 1/price', () => {
    const r = quoteToAccountRate(SPEC_USDJPY, {
      accountCurrency: 'USD',
      instrumentPrice: 150.5,
    });
    assert.equal(r.caseId, 'base');
    assert.ok(Math.abs(r.rate - 1 / 150.5) < 1e-12);
    assert.equal(r.approximate, false);
  });

  it('case cross: EURGBP on USD without conversion pair → approximate', () => {
    const r = quoteToAccountRate(SPEC_EURGBP, {
      accountCurrency: 'USD',
      instrumentPrice: 0.86,
    });
    assert.equal(r.caseId, 'cross');
    assert.equal(r.approximate, true);
  });

  it('case cross: EURGBP on USD with user rate → flagged approximate', () => {
    const r = quoteToAccountRate(SPEC_EURGBP, {
      accountCurrency: 'USD',
      instrumentPrice: 0.86,
      conversionRateToAccount: 1.27,
    });
    assert.equal(r.caseId, 'cross');
    assert.equal(r.rate, 1.27);
    assert.equal(r.approximate, true);
  });
});

describe('Phase 1 — gross P&L hand-computed', () => {
  it('EURUSD long 1 lot: entry 1.10000 → exit 1.10500 = +500 USD', () => {
    // priceDiff 0.005 * 100000 = 500 quote USD
    const g = grossPnL('BUY', 1.1, 1.105, 1, SPEC_EURUSD, {
      accountCurrency: 'USD',
      instrumentPrice: 1.105,
    });
    assert.ok(Math.abs(g.grossQuote.amount - 500) < 1e-9);
    assert.ok(Math.abs(g.grossAccount.amount - 500) < 1e-9);
    assert.equal(g.grossAccount.approximate, false);
  });

  it('EURUSD short 0.5 lot: entry 1.10000 → exit 1.09500 = +250 USD', () => {
    // (1.10000 - 1.09500) * 0.5 * 100000 = 250
    const g = grossPnL('SELL', 1.1, 1.095, 0.5, SPEC_EURUSD, {
      accountCurrency: 'USD',
      instrumentPrice: 1.095,
    });
    assert.ok(Math.abs(g.grossQuote.amount - 250) < 1e-9);
    assert.ok(Math.abs(g.grossAccount.amount - 250) < 1e-9);
  });

  it('USDJPY long 1 lot: entry 150.000 → exit 150.500 = 50000 JPY ≈ 332.2259 USD', () => {
    // priceDiff 0.5 * 100000 = 50000 JPY
    // rate at exit = 1/150.5
    // 50000 / 150.5 ≈ 332.22591362126244
    const expected = 50000 / 150.5;
    const g = grossPnL('BUY', 150, 150.5, 1, SPEC_USDJPY, {
      accountCurrency: 'USD',
      instrumentPrice: 150.5,
    });
    assert.equal(g.grossQuote.amount, 50000);
    assert.equal(g.grossQuote.currency, 'JPY');
    assert.ok(Math.abs(g.grossAccount.amount - expected) < 1e-9);
    assert.equal(g.grossAccount.approximate, false);
  });

  it('EURGBP long 1 lot: entry 0.85000 → exit 0.86000 = 1000 GBP → 1250 USD approx @ 1.25', () => {
    // priceDiff 0.01 * 100000 = 1000 GBP
    const g = grossPnL('BUY', 0.85, 0.86, 1, SPEC_EURGBP, {
      accountCurrency: 'USD',
      instrumentPrice: 0.86,
      conversionRateToAccount: 1.25,
    });
    assert.ok(Math.abs(g.grossQuote.amount - 1000) < 1e-9);
    assert.equal(g.grossQuote.currency, 'GBP');
    assert.ok(Math.abs(g.grossAccount.amount - 1250) < 1e-9);
    assert.equal(g.grossAccount.approximate, true);
  });
});

describe('Phase 1 — R-multiple', () => {
  it('freezes initial stop:  +1R when net equals original risk', () => {
    // EURUSD long entry 1.10000, stop 1.09000 → risk 0.01 * 100000 = 1000 USD
    // net +1000 → 1R
    const r = rMultiple(1000, 'BUY', 1.1, 1.09, 1, SPEC_EURUSD, {
      accountCurrency: 'USD',
      instrumentPrice: 1.1,
    });
    assert.ok(r != null);
    assert.ok(Math.abs(r! - 1) < 1e-9);
  });

  it('returns null when no initial stop', () => {
    assert.equal(
      rMultiple(100, 'BUY', 1.1, null, 1, SPEC_EURUSD, {
        accountCurrency: 'USD',
        instrumentPrice: 1.1,
      }),
      null,
    );
  });
});

describe('Phase 1 — risk sizing', () => {
  it('EURUSD: 1% of 10k with 20-pip stop → 0.50 lots', () => {
    // risk = 100 USD
    // stopDistance = 0.0020
    // valuePerPricePerLot = 100000
    // lots = 100 / (0.002 * 100000) = 0.5
    const r = sizeFromRisk({
      equity: 10_000,
      riskPercent: 0.01,
      entryPrice: 1.1,
      stopPrice: 1.098,
      spec: SPEC_EURUSD,
      ctx: { accountCurrency: 'USD', instrumentPrice: 1.1 },
    });
    assert.equal(r.lots, 0.5);
    assert.ok(Math.abs(r.actualRiskAccount - 100) < 1e-6);
    assert.equal(r.clamped, false);
  });
});
