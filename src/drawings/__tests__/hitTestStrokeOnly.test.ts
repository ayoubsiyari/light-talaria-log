/**
 * Filled shapes: select/drag from stroke only (TradingView parity).
 * Run: node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/drawings/__tests__/hitTestStrokeOnly.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hitTestDrawings } from '@/drawings/hitTest';
import { createDrawing } from '@/drawings/drawingStore';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { PlotRect, PriceScale } from '@/chart/scales';

function bars(): ChartBar[] {
  const out: ChartBar[] = [];
  const t0 = 1_700_000_000;
  for (let i = 0; i < 40; i++) {
    out.push({
      time: t0 + i * 60,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
    });
  }
  return out;
}

const plot: PlotRect = { left: 0, top: 0, width: 400, height: 300 };
const range: VisibleRange = { fromIndex: 0, toIndex: 40 };
const priceScale: PriceScale = { min: 80, max: 120 };

describe('hitTestDrawings stroke-only fills', () => {
  const series = bars();

  it('rectangle: center miss, border hit', () => {
    const d = createDrawing('rectangle', [
      { time: series[5]!.time, price: 115 },
      { time: series[30]!.time, price: 85 },
    ]);
    // Center of plot ≈ center of rect
    const center = hitTestDrawings(200, 150, [d], series, range, plot, priceScale);
    assert.equal(center, null, 'fill must not claim');

    // Top edge of rect (price 115 → near top of plot)
    const edge = hitTestDrawings(200, 37.5, [d], series, range, plot, priceScale);
    assert.equal(edge?.drawingId, d.id);
    assert.equal(edge?.handleIndex, null);
  });

  it('triangle: interior miss, edge hit', () => {
    const d = createDrawing('triangle', [
      { time: series[5]!.time, price: 115 },
      { time: series[30]!.time, price: 115 },
      { time: series[17]!.time, price: 85 },
    ]);
    const interior = hitTestDrawings(200, 120, [d], series, range, plot, priceScale);
    assert.equal(interior, null, 'triangle fill must not claim');

    const edge = hitTestDrawings(200, 37.5, [d], series, range, plot, priceScale);
    assert.equal(edge?.drawingId, d.id);
  });

  it('ellipse: interior miss, perimeter hit', () => {
    const d = createDrawing('ellipse', [
      { time: series[5]!.time, price: 115 },
      { time: series[30]!.time, price: 85 },
    ]);
    const interior = hitTestDrawings(200, 150, [d], series, range, plot, priceScale);
    assert.equal(interior, null, 'ellipse fill must not claim');

    // Mid of top half of bounding box ≈ near ellipse top
    const rim = hitTestDrawings(200, 37.5, [d], series, range, plot, priceScale);
    assert.equal(rim?.drawingId, d.id);
  });
});
