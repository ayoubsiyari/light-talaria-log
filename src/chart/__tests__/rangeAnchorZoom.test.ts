import { describe, expect, it } from 'vitest';
import {
  isViewportRightAnchoredOnTip,
  rangeRightAnchored,
  rangeZoomKeepRight,
} from '@/chart/rangeAnchor';

describe('tip-right zoom helpers', () => {
  it('detects rangeRightAnchored tip as end-locked', () => {
    const tip = 500;
    const range = rangeRightAnchored(tip, 120);
    expect(isViewportRightAnchoredOnTip(range, tip + 1)).toBe(true);
  });

  it('rejects a history pan (tip off the right edge)', () => {
    const tip = 500;
    const range = { fromIndex: 100, toIndex: 220 };
    expect(isViewportRightAnchoredOnTip(range, tip + 1)).toBe(false);
  });

  it('rangeZoomKeepRight pins toIndex', () => {
    const range = { fromIndex: 100, toIndex: 220 };
    const next = rangeZoomKeepRight(range, 60);
    expect(next.toIndex).toBe(220);
    expect(next.fromIndex).toBe(160);
  });
});
