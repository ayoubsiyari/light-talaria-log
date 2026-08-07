/**
 * Tip-sync helpers for replay. Run:
 * node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/indicators/__tests__/tipSync.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stitchTipSeries } from '@/indicators/tipSync';

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
});
