/**
 * Order-level Y expand. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandPriceScale,
  isPriceNearScale,
  playScaleNeedsReset,
} from '@/chart/scales';

describe('expandPriceScale', () => {
  it('widens for nearby protective levels', () => {
    const base = { min: 159.5, max: 160.0 };
    const out = expandPriceScale(base, [159.4, 160.2]);
    assert.ok(out.min < 159.4);
    assert.ok(out.max > 160.2);
  });

  it('ignores cross-pair outliers (EUR price on USD/JPY scale)', () => {
    const base = { min: 159.5, max: 160.0 };
    const out = expandPriceScale(base, [1.15314, 159.4]);
    assert.ok(out.min < 159.4 && out.min > 150, `min=${out.min}`);
    assert.ok(out.max < 170, `max=${out.max}`);
    assert.ok(!isPriceNearScale(base, 1.15314));
    assert.ok(isPriceNearScale(base, 159.4));
  });

  it('detects contaminated Play sticky scale', () => {
    const sticky = { min: 1.15, max: 160 };
    const sane = { min: 159.5, max: 160.1 };
    assert.equal(playScaleNeedsReset(sticky, sane), true);
    assert.equal(
      playScaleNeedsReset({ min: 159.4, max: 160.2 }, sane),
      false,
    );
  });
});
