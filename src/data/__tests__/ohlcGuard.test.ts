/**
 * OHLC guard — zeros / absurd lows must not crush ES auto-Y. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasAbsurdWick,
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

describe('hasAbsurdWick', () => {
  it('flags ES L=61 with body ~4800 (HUD comb case)', () => {
    assert.equal(hasAbsurdWick(4778.75, 4782.75, 61.6, 4778.25), true);
    assert.equal(isValidOhlcBar({
      open: 4778.75,
      high: 4782.75,
      low: 61.6,
      close: 4778.25,
    }), false);
  });

  it('keeps normal FX and futures ranges', () => {
    assert.equal(hasAbsurdWick(1.1, 1.101, 1.099, 1.1005), false);
    assert.equal(hasAbsurdWick(4800, 4820, 4780, 4810), false);
  });
});

describe('sanitizeOhlc repairs packed corruption', () => {
  it('fixes low=0 while keeping real close', () => {
    const fixed = sanitizeOhlc({ open: 6010, high: 6030, low: 0, close: 6025 });
    assert.ok(fixed);
    assert.equal(fixed!.low, Math.min(6010, 6025));
    assert.equal(fixed!.close, 6025);
    assert.ok(isValidOhlcBar(fixed!));
  });

  it('fixes ES L=61.60 comb wick', () => {
    const fixed = sanitizeOhlc({
      open: 4778.75,
      high: 4782.75,
      low: 61.6,
      close: 4778.25,
    });
    assert.ok(fixed);
    assert.equal(fixed!.low, Math.min(4778.75, 4778.25));
    assert.ok(fixed!.low > 4000);
  });

  it('repairs a full comb buffer so auto-Y stays near ES', () => {
    const raw: ChartBar[] = [];
    for (let i = 0; i < 40; i++) {
      const c = 4800 + i;
      raw.push({
        time: 1_700_000_000 + i * 14_400,
        open: c - 5,
        high: c + 10,
        low: 60 + (i % 3), // packed near-zero corruption (not exactly 0)
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

describe('computePriceScale ignores bad lows', () => {
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
