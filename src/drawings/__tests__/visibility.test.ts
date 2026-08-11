/**
 * Drawing visibility. Run via node --test this file.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Drawing } from '@/drawings/drawingStore';
import {
  isDrawingVisibleAtCursor,
  isDrawingVisibleOnChart,
  isDrawingVisibleOnTf,
} from '@/drawings/visibility';

function drawing(
  partial: Pick<Drawing, 'points'> & Partial<Drawing>,
): Drawing {
  return {
    id: 'd1',
    type: 'trendLine',
    style: {} as Drawing['style'],
    visible: true,
    ...partial,
  };
}

describe('isDrawingVisibleOnTf', () => {
  it('respects visibleOnTfs against selectedTf', () => {
    const d = drawing({
      points: [{ time: 1, price: 1 }],
      visibleOnTfs: ['1m', '5m'],
    });
    assert.equal(isDrawingVisibleOnTf(d, '1m'), true);
    assert.equal(isDrawingVisibleOnTf(d, '15m'), false);
  });
});

describe('isDrawingVisibleAtCursor', () => {
  it('hides drawings entirely after the replay tip', () => {
    const d = drawing({
      points: [
        { time: 200, price: 1 },
        { time: 300, price: 2 },
      ],
    });
    assert.equal(isDrawingVisibleAtCursor(d, 100), false);
    assert.equal(isDrawingVisibleAtCursor(d, 250), true);
    assert.equal(isDrawingVisibleAtCursor(d, null), true);
  });
});

describe('isDrawingVisibleOnChart', () => {
  it('requires both TF and cursor gates', () => {
    const d = drawing({
      points: [{ time: 50, price: 1 }],
      visibleOnTfs: ['5m'],
    });
    assert.equal(isDrawingVisibleOnChart(d, '5m', 100), true);
    assert.equal(isDrawingVisibleOnChart(d, '1m', 100), false);
    assert.equal(isDrawingVisibleOnChart(d, '5m', 10), false);
  });
});
