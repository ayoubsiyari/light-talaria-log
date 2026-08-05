/**
 * HTF aggregate helpers (Worker-safe).
 * Run: npm run test:strategy
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateSeriesToHtf,
  mapHtfFlagsToLtf,
} from '@/strategy/pieces/htfAggregate';
import type { BarSeries } from '@/strategy/pieces/evalHelpers';

function synth1m(n: number): BarSeries {
  const times = new Float64Array(n);
  const opens = new Float32Array(n);
  const highs = new Float32Array(n);
  const lows = new Float32Array(n);
  const closes = new Float32Array(n);
  const t0 = 1_700_000_000;
  for (let i = 0; i < n; i++) {
    times[i] = t0 + i * 60;
    const px = 100 + Math.sin(i / 10);
    opens[i] = px;
    highs[i] = px + 0.2;
    lows[i] = px - 0.2;
    closes[i] = px + 0.05;
  }
  return { times, opens, highs, lows, closes };
}

describe('htfAggregate', () => {
  it('aggregates 1m → 5m with fewer bars', () => {
    const s = synth1m(100);
    const agg = aggregateSeriesToHtf(s, '5m');
    assert.ok(agg.closes.length > 10);
    assert.ok(agg.closes.length < s.closes.length);
    assert.equal(agg.times.length, agg.closes.length);
  });

  it('maps HTF flags onto LTF bars', () => {
    const s = synth1m(20);
    const agg = aggregateSeriesToHtf(s, '5m');
    const hFlags = new Uint8Array(agg.closes.length);
    const hSides = new Uint8Array(agg.closes.length);
    if (hFlags.length > 0) {
      hFlags[0] = 1;
      hSides[0] = 1;
    }
    const mapped = mapHtfFlagsToLtf(s.times, agg.times, hFlags, hSides, 300);
    assert.equal(mapped.flags.length, s.closes.length);
    assert.ok(mapped.flags.some((f) => f === 1));
  });
});
