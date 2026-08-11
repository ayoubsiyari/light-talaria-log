/**
 * OHLC guard — zeros must not crush ES/NQ auto-Y. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPositiveOhlc,
  isValidOhlcBar,
  sanitizeChartBars,
  sanitizeOhlc,
} from '@/data/ohlcGuard';
import { computePriceScale } from '@/chart/scales';
import type { ChartBar } from '@/types/bar';

describe('isPositiveOhlc', () => {
  it('rejects zero / empty prints', () => {
    assert.equal(isPositiveOhlc(0, 6000, 0, 6000), false);
    assert.equal(isPositiveOhlc(6010, 6020, 0, 6015), false);
    assert.equal(isPositiveOhlc(6010, 6020, 6005, 6015), true);
  });

  it('rejects inverted OHLC', () => {
    assert.equal(isPositiveOhlc(10, 9, 8, 9.5), false);
  });
});

describe('sanitizeOhlc repairs packed low=0 (ES 4h comb)', () => {
  it('fixes low=0 while keeping real close', () => {
    const fixed = sanitizeOhlc({ open: 6010, high: 6030, low: 0, close: 6025 });
    assert.ok(fixed);
    assert.equal(fixed!.low, Math.min(6010, 6025));
    assert.equal(fixed!.close, 6025);
    assert.ok(isPositiveOhlc(fixed!.open, fixed!.high, fixed!.low, fixed!.close));
  });

  it('repairs a full comb buffer so auto-Y stays near ES', () => {
    const raw: ChartBar[] = [];
    for (let i = 0; i < 40; i++) {
      const c = 6000 + i;
      raw.push({
        time: 1_700_000_000 + i * 14_400,
        open: c - 5,
        high: c + 10,
        low: 0, // packed corruption
        close: c,
        volume: 1,
      });
    }
    const clean = sanitizeChartBars(raw);
    assert.equal(clean.length, raw.length);
    const scale = computePriceScale(clean, {
      fromIndex: 0,
      toIndex: clean.length,
    });
    assert.ok(scale.min > 1000, `min ${scale.min}`);
    assert.ok(scale.max < 7000, `max ${scale.max}`);
  });
});

describe('computePriceScale ignores zero-low bars', () => {
  it('does not crush ES-like scale to 0', () => {
    const bars: ChartBar[] = [
      { time: 1, open: 0, high: 6030, low: 0, close: 6025, volume: 1 },
      { time: 2, open: 6020, high: 6035, low: 6010, close: 6030, volume: 1 },
      { time: 3, open: 6030, high: 6040, low: 6025, close: 6035, volume: 1 },
    ];
    const scale = computePriceScale(bars, { fromIndex: 0, toIndex: 3 });
    assert.ok(scale.min > 1000, `min should stay near ES prices, got ${scale.min}`);
    assert.ok(scale.max < 7000);
    assert.ok(isValidOhlcBar(bars[1]!));
  });
});
