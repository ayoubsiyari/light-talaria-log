/**
 * Candle-aligned dual-lattice grid with continuous zoom fade.
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { indexToX } from '@/chart/scales';
import {
  niceTimeTicks,
  resolveBarPeriod,
} from '@/chart/ticks';
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

  it('keeps ticks on integer candle indices', () => {
    const data = bars(400);
    const ticks = niceTimeTicks({ fromIndex: 100, toIndex: 220 }, data, 8);
    assert.ok(ticks.length >= 3);
    for (const t of ticks) {
      assert.equal(t.index, Math.round(t.index));
    }
  });

  it('scrolls smoothly: tick indices stay put while camera pans', () => {
    const data = bars(300);
    const r0 = { fromIndex: 100, toIndex: 220 };
    const r1 = { fromIndex: 100.4, toIndex: 220.4 };
    const t0 = niceTimeTicks(r0, data, 8);
    const t1 = niceTimeTicks(r1, data, 8);
    const shared = t0.filter((a) =>
      t1.some((b) => Math.abs(b.index - a.index) < 1e-9),
    );
    assert.ok(shared.length >= 2, 'lattice indices must persist across pan');
    for (const tick of shared) {
      const x0 = indexToX(tick.index, r0, plot);
      const x1 = indexToX(tick.index, r1, plot);
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
    const shared = t0.find((a) =>
      t1.some((b) => Math.abs(b.index - a.index) < 1e-9),
    );
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
    const shared = t0.find((a) => t1.some((b) => b.time === a.time));
    assert.ok(shared, 'expected overlapping tick time after slide');
    const next = t1.find((b) => b.time === shared!.time)!;
    const x0 = indexToX(shared!.index, range, plot);
    const x1 = indexToX(next.index, range, plot);
    assert.ok(x1 < x0 - 1, `slide: grid X should move left`);
  });

  it('1D weekend gaps keep lattice phase stable as tip sample changes', () => {
    const day = 86_400;
    const data: ChartBar[] = [];
    let t = Date.UTC(2024, 0, 2) / 1000;
    while (data.length < 90) {
      const dow = new Date(t * 1000).getUTCDay();
      if (dow !== 0 && dow !== 6) {
        data.push({
          time: t,
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
        });
      }
      t += day;
    }
    const short = data.slice(0, 50);
    const long = data.slice(0, 90);
    const range = { fromIndex: 10, toIndex: 40 };
    const a = niceTimeTicks(range, short, 8, { barPeriod: day });
    const b = niceTimeTicks(range, long, 8, { barPeriod: day });
    assert.ok(a.length >= 2 && b.length >= 2);
    assert.ok(Math.abs(a[0]!.index - b[0]!.index) < 1e-9);
  });

  it('prefers declared TF period when series agrees', () => {
    const data = bars(40);
    assert.equal(resolveBarPeriod(data, 60), 60);
    assert.equal(resolveBarPeriod(data, 86_400), 60);
  });

  it('dense alpha fades continuously across an octave (no sticky)', () => {
    const data = bars(800);
    const alphas: number[] = [];
    // span 80→150 keeps the same octave for raw=span/8 in [10, ~18.7]
    // exp=floor(log2)=3 for [8,16), so span in [64, 128)
    for (const span of [72, 88, 104, 120]) {
      const ticks = niceTimeTicks({ fromIndex: 40, toIndex: 40 + span }, data, 8);
      const dense = ticks.filter((t) => t.alpha < 0.999);
      if (dense.length === 0) {
        alphas.push(0);
      } else {
        alphas.push(dense[0]!.alpha);
      }
    }
    // Alphas should be non-increasing as we zoom out within the octave.
    for (let i = 1; i < alphas.length; i++) {
      assert.ok(
        alphas[i]! <= alphas[i - 1]! + 1e-9,
        `alpha rose while zooming out: ${alphas.join(', ')}`,
      );
    }
    assert.ok(alphas[0]! > alphas[alphas.length - 1]!, 'expected fade');
  });

  it('coarse indices persist across fine zoom steps', () => {
    const data = bars(800);
    const r0 = { fromIndex: 40, toIndex: 40 + 90 };
    const r1 = { fromIndex: 40, toIndex: 40 + 110 };
    const a = niceTimeTicks(r0, data, 8).filter((t) => t.alpha >= 0.99);
    const b = niceTimeTicks(r1, data, 8).filter((t) => t.alpha >= 0.99);
    for (const t of a) {
      if (t.index < r0.fromIndex || t.index >= r0.toIndex) continue;
      // Still in r1 viewport
      if (t.index >= r1.toIndex) continue;
      assert.ok(
        b.some((u) => u.index === t.index),
        `coarse ${t.index} vanished on small zoom`,
      );
    }
  });
});
