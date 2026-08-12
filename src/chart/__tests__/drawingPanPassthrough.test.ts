/**
 * Unselected drawing bodies must not claim pan (trackpad/mouse sticky feel).
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { drawingHitPx } from '@/utils/touchTarget';

describe('drawing pan passthrough helpers', () => {
  it('fine pointer hit radius is tighter than the old 16px magnet', () => {
    // Node has no matchMedia → isCoarsePointer false → fine path
    const px = drawingHitPx(1);
    assert.ok(px <= 10, `expected tight fine hit, got ${px}`);
    assert.ok(px >= 6, `expected usable grab radius, got ${px}`);
  });
});
