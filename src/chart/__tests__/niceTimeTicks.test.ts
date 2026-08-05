/**
 * Paper-stable time grid: scrolls smoothly on pan, continues into pad,
 * and shifts with warm-cache slides. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { indexToX } from '@/chart/scales';
import { niceTimeTicks } from '@/chart/ticks';
import type { ChartBar } from '@/types/bar';

function bars(n: number, t0 = 1_700_000_000): ChartBar[] {
  const out: ChartBar[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      time: t0 + i * 60,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    });
  }
  return out;
}

const plot = { left: 0, width: 1200, top: 0, height: 400 };

describe('niceTimeTicks', () => {
  it('does not repeat timestamps across empty left pad', () => {
    const data = bars(80);
    const ticks = niceTimeTicks({ fromIndex: -200, toIndex: 100 }, data, 8);
    assert.ok(ticks.length >= 1);
    const times = ticks.map((t) => t.time);
    assert.equal(new Set(times).size, times.length, 'duplicate times');
  });

  it('keeps equal logical spacing (paper lattice)', () => {
    const data = bars(400);
    const ticks = niceTimeTicks({ fromIndex: 100, toIndex: 220 }, data, 8);
    assert.ok(ticks.length >= 3);
    const gaps: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
      gaps.push(ticks[i]!.index - ticks[i - 1]!.index);
    }
    const step = gaps[0]!;
    for (const g of gaps) {
      assert.ok(
        Math.abs(g - step) < 1e-6,
        `uneven gap ${g} vs step ${step}`,
      );
    }
  });

  it('scrolls smoothly: tick indices stay put while camera pans', () => {
    const data = bars(300);
    const r0 = { fromIndex: 100, toIndex: 220 };
    const r1 = { fromIndex: 100.4, toIndex: 220.4 }; // fractional pan
    const t0 = niceTimeTicks(r0, data, 8);
    const t1 = niceTimeTicks(r1, data, 8);
    // Same lattice indices for overlapping ticks
    const shared = t0.filter((a) => t1.some((b) => Math.abs(b.index - a.index) < 1e-9));
    assert.ok(shared.length >= 2, 'lattice indices must persist across pan');
    for (const tick of shared) {
      const x0 = indexToX(tick.index, r0, plot);
      const x1 = indexToX(tick.index, r1, plot);
      // Camera moved +0.4 bars → screen X decreases by 0.4/span * width
      const expected = (0.4 / (r0.toIndex - r0.fromIndex)) * plot.width;
      assert.ok(
        Math.abs(x0 - x1 - expected) < 0.5,
        `expected smooth Δx≈${expected}, got ${x0 - x1}`,
      );
    }
  });

  it('continues ticks into empty right pad (future)', () => {
    const data = bars(80);
    const range = { fromIndex: 40, toIndex: 200 };
    const ticks = niceTimeTicks(range, data, 8);
    const beyondTip = ticks.filter((t) => t.index >= data.length);
    assert.ok(beyondTip.length >= 1, 'expected pad ticks past tip');
    const lastTime = data[data.length - 1]!.time;
    for (const t of beyondTip) {
      assert.ok(t.time > lastTime);
    }
  });

  it('continues ticks into empty left pad (past)', () => {
    const data = bars(80);
    const range = { fromIndex: -120, toIndex: 40 };
    const ticks = niceTimeTicks(range, data, 8);
    const beforeFirst = ticks.filter((t) => t.index < 0);
    assert.ok(beforeFirst.length >= 1, 'expected ticks in left pad');
  });

  it('moves grid X left when right-anchored tip advances by one bar', () => {
    const data = bars(300);
    const span = 120;
    const r0 = { fromIndex: 100, toIndex: 100 + span };
    const r1 = { fromIndex: 101, toIndex: 101 + span };
    const t0 = niceTimeTicks(r0, data, 8);
    const t1 = niceTimeTicks(r1, data, 8);
    const shared = t0.find((a) => t1.some((b) => Math.abs(b.index - a.index) < 1e-9));
    assert.ok(shared, 'expected persistent lattice index');
    const x0 = indexToX(shared!.index, r0, plot);
    const x1 = indexToX(shared!.index, r1, plot);
    assert.ok(x1 < x0 - 1, `grid X should move left (x0=${x0}, x1=${x1})`);
  });

  it('moves grid X left when buffer slides under a fixed index window', () => {
    const w0 = bars(120, 1_700_000_000);
    const w1 = bars(120, 1_700_000_000 + 60);
    const range = { fromIndex: 0, toIndex: 120 };
    const t0 = niceTimeTicks(range, w0, 8);
    const t1 = niceTimeTicks(range, w1, 8);
    // Same candle time should sit one index further left after the slide
    const shared = t0.find((a) => t1.some((b) => b.time === a.time));
    assert.ok(shared, 'expected overlapping tick time after slide');
    const next = t1.find((b) => b.time === shared!.time)!;
    const x0 = indexToX(shared!.index, range, plot);
    const x1 = indexToX(next.index, range, plot);
    assert.ok(
      x1 < x0 - 1,
      `slide: grid X should move left (x0=${x0}, x1=${x1})`,
    );
  });
});
