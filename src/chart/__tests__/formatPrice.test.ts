/**
 * Instrument price format. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createPriceFormatter,
  formatPrice,
  snapPriceToTick,
} from '@/chart/format';
import { nicePriceTicks } from '@/chart/ticks';

describe('formatPrice', () => {
  it('uses instrument digits when provided', () => {
    assert.equal(formatPrice(1.23456, 5), '1.23456');
    assert.equal(formatPrice(151.234, 3), '151.234');
    assert.equal(formatPrice(28356.25, 2), '28356.25');
  });

  it('falls back adaptively without digits', () => {
    assert.equal(formatPrice(1234.56), '1234.6');
    assert.equal(formatPrice(1.23456), '1.2346');
    assert.equal(formatPrice(0.012345), '0.01235');
  });

  it('createPriceFormatter binds digits', () => {
    const fmt = createPriceFormatter({ digits: 2, tickSize: 0.25 });
    assert.equal(fmt(100.125), '100.13');
  });
});

describe('snapPriceToTick', () => {
  it('snaps NQ-style quarter points', () => {
    assert.equal(snapPriceToTick(28356.13, 0.25), 28356.25);
    assert.equal(snapPriceToTick(28356.1, 0.25), 28356);
  });

  it('snaps FX pip ticks', () => {
    assert.equal(snapPriceToTick(1.085014, 0.00001), 1.08501);
  });
});

describe('nicePriceTicks + tickSize', () => {
  it('aligns axis steps to instrument tick', () => {
    const ticks = nicePriceTicks(28350, 28360, 6, { tickSize: 0.25 });
    assert.ok(ticks.length > 1);
    for (const t of ticks) {
      const rem = Math.abs((t / 0.25) % 1);
      assert.ok(rem < 1e-9 || rem > 1 - 1e-9, `tick ${t} not on 0.25`);
    }
  });

  it('aligns FX ticks to pip size', () => {
    const ticks = nicePriceTicks(1.08, 1.09, 6, { tickSize: 0.00001 });
    assert.ok(ticks.length > 1);
    for (const t of ticks) {
      const rem = Math.abs(Math.round(t / 0.00001) - t / 0.00001);
      assert.ok(rem < 1e-6, `tick ${t} not on pip`);
    }
  });
});
