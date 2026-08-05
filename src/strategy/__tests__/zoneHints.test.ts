/**
 * Structure pieces emit true zoneHints (not only post-hoc pads).
 * Run: npm run test:strategy
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateCondition } from '@/strategy/pieces/evalConditions';
import type { BarSeries } from '@/strategy/pieces/evalHelpers';

function synth(n: number): BarSeries {
  const times = new Float64Array(n);
  const opens = new Float32Array(n);
  const highs = new Float32Array(n);
  const lows = new Float32Array(n);
  const closes = new Float32Array(n);
  const t0 = 1_700_000_000;
  for (let i = 0; i < n; i++) {
    times[i] = t0 + i * 60;
    // Build a clear bullish FVG: bar i-2 high < bar i low
    const base = 100 + i * 0.01;
    opens[i] = base;
    closes[i] = base + 0.05;
    highs[i] = base + 0.1;
    lows[i] = base - 0.05;
  }
  // Force gap at bar 10: lows[10] well above highs[8]
  highs[8] = 100.2;
  lows[8] = 100.0;
  highs[9] = 100.5;
  lows[9] = 100.3;
  highs[10] = 101.0;
  lows[10] = 100.6; // gap 100.2 → 100.6
  closes[10] = 100.75; // inside gap
  opens[10] = 100.7;
  return { times, opens, highs, lows, closes };
}

describe('zoneHints from evaluators', () => {
  it('FVG emits a zoneHint with gap price extents', () => {
    const series = synth(40);
    const ev = evaluateCondition('fvg', series, {
      lookback: 20,
      side: 'buy',
    });
    assert.ok(ev.flags.some((f) => f === 1), 'expected FVG flag');
    assert.ok(ev.zoneHints && ev.zoneHints.length > 0, 'expected zoneHints');
    const z = ev.zoneHints![0]!;
    assert.equal(z.kind, 'fvg');
    assert.ok(z.priceHigh > z.priceLow);
    // Gap we planted: highs[8]=100.2, lows[10]=100.6 — hint should cover that band.
    assert.ok(z.priceLow <= 100.6 + 1e-3);
    assert.ok(z.priceHigh >= 100.2 - 1e-3);
  });
});
