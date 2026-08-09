/**
 * Candle-aligned nested time grid with zoom crossfade. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { indexToX } from '@/chart/scales';
import {
  nestedIndexStep,
  niceTimeTicks,
  resolveBarPeriod,
  type TimeLatticeSticky,
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

  it('keeps majors on integer candle indices with equal spacing', () => {
    const data = bars(400);
    const ticks = niceTimeTicks({ fromIndex: 100, toIndex: 220 }, data, 8);
    const majors = ticks.filter((t) => t.alpha >= 0.95);
    assert.ok(majors.length >= 3);
    for (const t of majors) {
      assert.equal(t.index, Math.round(t.index), 'must sit on candle index');
    }
    const gaps: number[] = [];
    for (let i = 1; i < majors.length; i++) {
      gaps.push(majors[i]!.index - majors[i - 1]!.index);
    }
    const step = gaps[0]!;
    for (const g of gaps) {
      assert.ok(Math.abs(g - step) < 1e-9, `uneven gap ${g} vs step ${step}`);
    }
  });

  it('scrolls smoothly: tick indices stay put while camera pans', () => {
    const data = bars(300);
    const sticky: TimeLatticeSticky = { exp: -1 };
    const r0 = { fromIndex: 100, toIndex: 220 };
    const r1 = { fromIndex: 100.4, toIndex: 220.4 };
    const t0 = niceTimeTicks(r0, data, 8, { sticky });
    const t1 = niceTimeTicks(r1, data, 8, { sticky });
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
    const sticky: TimeLatticeSticky = { exp: -1 };
    const span = 120;
    const r0 = { fromIndex: 100, toIndex: 100 + span };
    const r1 = { fromIndex: 101, toIndex: 101 + span };
    const t0 = niceTimeTicks(r0, data, 8, { sticky });
    const t1 = niceTimeTicks(r1, data, 8, { sticky });
    const shared = t0.find((a) =>
      t1.some((b) => Math.abs(b.index - a.index) < 1e-9),
    );
    assert.ok(shared, 'expected persistent lattice index');
    const x0 = indexToX(shared!.index, r0, plot);
    const x1 = indexToX(shared!.index, r1, plot);
    assert.ok(x1 < x0 - 1, `grid X should move left (x0=${x0}, x1=${x1})`);
  });

  it('moves grid X left when buffer slides under a fixed index window', () => {
    const sticky: TimeLatticeSticky = { exp: -1 };
    const w0 = bars(120, 1_700_000_000);
    const w1 = bars(120, 1_700_000_000 + 60);
    const range = { fromIndex: 0, toIndex: 120 };
    const t0 = niceTimeTicks(range, w0, 8, { sticky });
    const t1 = niceTimeTicks(range, w1, 8, { sticky });
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
    const a0 = a.find((t) => t.alpha >= 0.95)!;
    const b0 = b.find((t) => t.alpha >= 0.95)!;
    assert.ok(a0 && b0);
    assert.ok(
      Math.abs(a0.index - b0.index) < 1e-9,
      `phase jump: ${a0.index} vs ${b0.index}`,
    );
  });

  it('prefers declared TF period when series agrees', () => {
    const data = bars(40);
    assert.equal(resolveBarPeriod(data, 60), 60);
    assert.equal(resolveBarPeriod(data, 86_400), 60);
  });

  it('fades minors across a zoom-out octave (no hard pop)', () => {
    const data = bars(800);
    const sticky: TimeLatticeSticky = { exp: -1 };
    // span 80 → raw 10 → exp floor(log2(10))=3 → major 8
    const dense = niceTimeTicks({ fromIndex: 50, toIndex: 130 }, data, 8, {
      sticky,
    });
    assert.equal(sticky.exp, 3);
    assert.equal(nestedIndexStep(10), 8);
    const minorsDense = dense.filter((t) => t.alpha > 0.02 && t.alpha < 0.95);
    assert.ok(minorsDense.length >= 1, 'expected visible minors when zoomed in');

    // Zoom out within same octave — minors should fade, majors stay put.
    const mid = niceTimeTicks({ fromIndex: 50, toIndex: 50 + 120 }, data, 8, {
      sticky,
    });
    assert.equal(sticky.exp, 3);
    const majorsMid = mid.filter((t) => t.alpha >= 0.95).map((t) => t.index);
    const majorsDense = dense
      .filter((t) => t.alpha >= 0.95)
      .map((t) => t.index)
      .filter((i) => i >= 50 && i < 130);
    for (const i of majorsDense) {
      assert.ok(majorsMid.includes(i), `major ${i} vanished mid-zoom`);
    }
    const minAlpha = Math.min(
      ...mid.filter((t) => t.alpha < 0.95 && t.alpha > 0).map((t) => t.alpha),
      1,
    );
    // raw=15 → frac≈0.9 → minors nearly gone
    assert.ok(minAlpha < 0.5 || mid.every((t) => t.alpha >= 0.95 || t.alpha < 0.02));
  });

  it('zoom-out major lattice stays nested on candles', () => {
    const data = bars(800);
    const sticky: TimeLatticeSticky = { exp: -1 };
    const spans = [64, 128, 256, 512];
    let prevMajors: number[] | null = null;
    let prevRange: { fromIndex: number; toIndex: number } | null = null;
    for (const span of spans) {
      const range = { fromIndex: 40, toIndex: 40 + span };
      const ticks = niceTimeTicks(range, data, 8, { sticky });
      const majors = ticks.filter((t) => t.alpha >= 0.95);
      assert.ok(majors.length >= 2);
      for (const t of majors) {
        assert.equal(t.index, Math.round(t.index));
      }
      if (prevMajors && prevRange) {
        for (const t of majors) {
          if (t.index < prevRange.fromIndex || t.index >= prevRange.toIndex) {
            continue;
          }
          assert.ok(
            prevMajors.includes(t.index),
            `major teleport at ${t.index}`,
          );
        }
      }
      prevMajors = majors.map((t) => t.index);
      prevRange = range;
    }
  });
});
