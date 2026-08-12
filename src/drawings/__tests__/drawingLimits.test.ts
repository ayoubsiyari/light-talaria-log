/**
 * Drawing memory caps.
 * Run: node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/drawings/__tests__/drawingLimits.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capFreehandPoints,
  downsamplePoints,
  enforceDrawingBookLimits,
  estimateBookBytes,
  MAX_DRAWINGS_PER_BOOK,
  MAX_FREEHAND_POINTS,
} from '@/drawings/drawingLimits';
import { createDrawing } from '@/drawings/drawingStore';

describe('drawingLimits', () => {
  it('downsamples freehand keeping endpoints', () => {
    const pts = Array.from({ length: 2000 }, (_, i) => ({
      time: 1_700_000_000 + i,
      price: 100 + Math.sin(i / 10),
    }));
    const out = capFreehandPoints(pts, 100);
    assert.ok(out.length <= 100);
    assert.equal(out[0]!.time, pts[0]!.time);
    assert.equal(out[out.length - 1]!.time, pts[pts.length - 1]!.time);
  });

  it('enforceDrawingBookLimits rejects growth over count', () => {
    const book = Array.from({ length: MAX_DRAWINGS_PER_BOOK + 5 }, (_, i) =>
      createDrawing('hline', [{ time: 1_700_000_000 + i, price: 100 }]),
    );
    const grow = enforceDrawingBookLimits(book);
    assert.equal(grow.ok, false);
    assert.equal(grow.reason, 'count');

    const loaded = enforceDrawingBookLimits(book, { forLoad: true });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.drawings.length, MAX_DRAWINGS_PER_BOOK);
  });

  it('downsample is no-op under cap', () => {
    const pts = [
      { time: 1, price: 1 },
      { time: 2, price: 2 },
    ];
    assert.equal(downsamplePoints(pts, MAX_FREEHAND_POINTS).length, 2);
  });

  it('estimateBookBytes grows with points', () => {
    const thin = [createDrawing('hline', [{ time: 1, price: 1 }])];
    const fat = [
      createDrawing(
        'brush',
        Array.from({ length: 500 }, (_, i) => ({ time: i, price: i })),
      ),
    ];
    assert.ok(estimateBookBytes(fat) > estimateBookBytes(thin) * 5);
  });
});
