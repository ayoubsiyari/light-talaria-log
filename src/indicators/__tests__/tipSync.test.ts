/**
 * Tip-sync helpers for replay. Run:
 * node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/indicators/__tests__/tipSync.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  alignIndicatorOverlays,
  landIndicatorOverlays,
  remapValuesByTime,
  stitchTipSeries,
} from '@/indicators/tipSync';
import type { ChartBar } from '@/types/bar';
import type { IndicatorOverlayResult } from '@/types/indicator';

function bar(time: number): ChartBar {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 1 };
}

describe('stitchTipSeries', () => {
  it('rewrites only the trailing tip', () => {
    const full = new Float32Array([1, 2, 3, 4, 5]);
    const tip = new Float32Array([30, 40, 50]);
    const out = stitchTipSeries(full, tip, 5);
    assert.deepEqual([...out], [1, 2, 30, 40, 50]);
  });

  it('does not overwrite history with tip warmup NaNs', () => {
    const full = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const tip = new Float32Array([Number.NaN, Number.NaN, 60, 70, 80]);
    const out = stitchTipSeries(full, tip, 8);
    assert.equal(out[3], 4);
    assert.equal(out[4], 5);
    assert.equal(out[5], 60);
    assert.equal(out[6], 70);
    assert.equal(out[7], 80);
  });

  it('does not mutate the live buffer in place', () => {
    const full = new Float32Array([1, 2, 3, 4, 5]);
    const tip = new Float32Array([9, 9, 9]);
    const out = stitchTipSeries(full, tip, 5);
    assert.equal(full[4], 5);
    assert.equal(out[4], 9);
  });

  it('stitches at compute length then align grows the tip', () => {
    const full = new Float32Array([1, 2, 3, 4, 5]);
    const tip = new Float32Array([40, 50]);
    const stitched = stitchTipSeries(full, tip, 5);
    const grown = alignIndicatorOverlays(
      [
        {
          instanceKey: 'sma',
          id: 'sma',
          label: 'SMA',
          placement: 'overlay',
          series: [
            {
              key: 'sma',
              style: 'line',
              color: '#fff',
              values: stitched,
            },
          ],
        },
      ],
      7,
    );
    assert.equal(grown[0]!.series[0]!.values.length, 7);
    assert.equal(grown[0]!.series[0]!.values[4], 50);
    // Hold last finite across the mid-flight growth.
    assert.equal(grown[0]!.series[0]!.values[5], 50);
    assert.equal(grown[0]!.series[0]!.values[6], 50);
  });
});

describe('remapValuesByTime', () => {
  it('keeps values glued to matching candle times after a slide', () => {
    const prev = [bar(100), bar(160), bar(220), bar(280)];
    const values = new Float32Array([10, 20, 30, 40]);
    // Slide: drop first, add new tip.
    const next = [bar(160), bar(220), bar(280), bar(340)];
    const out = remapValuesByTime(values, prev, next);
    assert.deepEqual([...out], [20, 30, 40, 40]);
  });

  it('leaves unknown leading history as NaN', () => {
    const prev = [bar(160), bar(220)];
    const values = new Float32Array([20, 30]);
    const next = [bar(40), bar(100), bar(160), bar(220)];
    const out = remapValuesByTime(values, prev, next);
    assert.ok(Number.isNaN(out[0]!));
    assert.ok(Number.isNaN(out[1]!));
    assert.equal(out[2], 20);
    assert.equal(out[3], 30);
  });
});

describe('landIndicatorOverlays', () => {
  function overlay(values: number[]): IndicatorOverlayResult {
    return {
      instanceKey: 'sma',
      id: 'sma',
      label: 'SMA',
      placement: 'overlay',
      series: [
        {
          key: 'sma',
          style: 'line',
          values: new Float32Array(values),
          color: '#fff',
        },
      ],
    };
  }

  it('aligns when the buffer only grew', () => {
    const req = [bar(100), bar(160), bar(220)];
    const live = [bar(100), bar(160), bar(220), bar(280)];
    const out = landIndicatorOverlays([overlay([1, 2, 3])], req, live);
    assert.equal(out[0]!.series[0]!.values.length, 4);
    assert.equal(out[0]!.series[0]!.values[3], 3);
  });

  it('remaps by time when the warm-cache slid (no index clobber)', () => {
    const req = [bar(100), bar(160), bar(220), bar(280)];
    const live = [bar(160), bar(220), bar(280), bar(340)];
    const out = landIndicatorOverlays([overlay([10, 20, 30, 40])], req, live);
    assert.deepEqual([...out[0]!.series[0]!.values], [20, 30, 40, 40]);
  });
});
