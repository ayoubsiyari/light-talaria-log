/**
 * Tip-right zoom helpers. Run:
 * npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isViewportRightAnchoredOnTip,
  rangeRightAnchored,
  rangeZoomKeepRight,
} from '@/chart/rangeAnchor';

describe('tip-right zoom helpers', () => {
  it('detects rangeRightAnchored tip as end-locked', () => {
    const tip = 500;
    const range = rangeRightAnchored(tip, 120);
    assert.equal(isViewportRightAnchoredOnTip(range, tip + 1), true);
  });

  it('rejects a history pan (tip off the right edge)', () => {
    const tip = 500;
    const range = { fromIndex: 100, toIndex: 220 };
    assert.equal(isViewportRightAnchoredOnTip(range, tip + 1), false);
  });

  it('rangeZoomKeepRight pins toIndex', () => {
    const range = { fromIndex: 100, toIndex: 220 };
    const next = rangeZoomKeepRight(range, 60);
    assert.equal(next.toIndex, 220);
    assert.equal(next.fromIndex, 160);
  });
});
