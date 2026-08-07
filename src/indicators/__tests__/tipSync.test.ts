/**
 * Tip-sync helpers for replay: hold-extend, slide remap, stitch.
 * Run: node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/indicators/__tests__/tipSync.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shiftIndicatorOverlays,
  slideOffset,
  stitchTipSeries,
} from '@/indicators/tipSync';
import type { ChartBar } from '@/types/bar';
import type { IndicatorOverlayResult } from '@/types/indicator';

function bars(n: number, t0 = 1_700_000_000): ChartBar[] {
  const out: ChartBar[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      time: t0 + i * 60,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    });
  }
  return out;
}

describe('slideOffset', () => {
  it('returns 0 when prefixes match', () => {
    const prev = bars(10);
    const next = bars(12);
    assert.equal(slideOffset(prev, next), 0);
  });

  it('returns dropped count on warm-cache slide', () => {
    const prev = bars(10, 1000);
    const next = bars(10, 1000 + 3 * 60); // dropped 3 from front
    assert.equal(slideOffset(prev, next), 3);
  });

  it('returns -1 on unrelated seek window', () => {
    const prev = bars(10, 1000);
    const next = bars(10, 9_000_000);
    assert.equal(slideOffset(prev, next), -1);
  });
});

describe('shiftIndicatorOverlays', () => {
  it('preserves overlapping history after a slide', () => {
    const values = new Float32Array([10, 20, 30, 40, 50]);
    const overlays: IndicatorOverlayResult[] = [
      {
        instanceKey: 'sma',
        id: 'sma',
        label: 'SMA',
        placement: 'overlay',
        series: [{ key: 'sma', style: 'line', color: '#fff', values }],
      },
    ];
    const shifted = shiftIndicatorOverlays(overlays, 2, 5);
    assert.equal(shifted[0]!.series[0]!.values[0], 30);
    assert.equal(shifted[0]!.series[0]!.values[1], 40);
    assert.equal(shifted[0]!.series[0]!.values[2], 50);
    // Hold-fill tip
    assert.equal(shifted[0]!.series[0]!.values[3], 50);
    assert.equal(shifted[0]!.series[0]!.values[4], 50);
  });
});

describe('stitchTipSeries', () => {
  it('rewrites only the trailing tip', () => {
    const full = new Float32Array([1, 2, 3, 4, 5]);
    const tip = new Float32Array([30, 40, 50]);
    const out = stitchTipSeries(full, tip, 5);
    assert.deepEqual([...out], [1, 2, 30, 40, 50]);
  });
});
