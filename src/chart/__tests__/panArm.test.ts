/**
 * Pan must arm from cumulative press→move distance (trackpad micro-events).
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PAN_ARM_PX, shouldArmPan } from '@/chart/interaction';

describe('shouldArmPan', () => {
  it('does not arm on a single 1px step (old per-event trap)', () => {
    assert.equal(shouldArmPan(0, 0, 1, 0), false);
  });

  it('arms once cumulative distance reaches threshold', () => {
    // Many 1px trackpad events → distance from origin crosses threshold
    assert.equal(shouldArmPan(100, 100, 100 + PAN_ARM_PX, 100), true);
    assert.equal(shouldArmPan(100, 100, 100 + PAN_ARM_PX - 0.5, 100), false);
  });

  it('arms on diagonal cumulative move', () => {
    // √(2²+2²)≈2.83 < 3; need a bit more
    assert.equal(shouldArmPan(0, 0, 2, 2), false);
    assert.equal(shouldArmPan(0, 0, 3, 3), true);
  });
});
