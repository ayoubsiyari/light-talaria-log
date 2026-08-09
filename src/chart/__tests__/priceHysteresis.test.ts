/**
 * Play price-scale hysteresis. Run:
 * npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPlayPriceHysteresis } from '@/chart/scales';

describe('applyPlayPriceHysteresis', () => {
  it('seeds from target when sticky is null', () => {
    const out = applyPlayPriceHysteresis(null, { min: 1, max: 2 });
    assert.deepEqual(out, { min: 1, max: 2 });
  });

  it('expands when tip makes a new high/low', () => {
    const sticky = { min: 1.1, max: 1.2 };
    const out = applyPlayPriceHysteresis(sticky, { min: 1.09, max: 1.22 });
    assert.equal(out.min, 1.09);
    assert.equal(out.max, 1.22);
  });

  it('does not shrink when the tip range tightens', () => {
    const sticky = { min: 1.0, max: 1.3 };
    const out = applyPlayPriceHysteresis(sticky, { min: 1.1, max: 1.2 });
    assert.equal(out.min, 1.0);
    assert.equal(out.max, 1.3);
  });
});
