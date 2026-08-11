/**
 * OHLC guard — zeros must not crush ES/NQ auto-Y. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPositiveOhlc, isValidOhlcBar } from '@/data/ohlcGuard';
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
