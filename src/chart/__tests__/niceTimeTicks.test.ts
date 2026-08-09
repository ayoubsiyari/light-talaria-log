/**
 * Candle-aligned nested time grid. Run: npm run test:chart
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

  it('keeps equal logical spacing on integer candle indices', () => {
    const data = bars(400);
    const ticks = niceTimeTicks({ fromIndex: 100, toIndex: 220 }, data, 8);
    assert.ok(ticks.length >= 3);
    for (const t of ticks) {
      assert.equal(t.index, Math.round(t.index), 'must sit on candle index');
    }
    const gaps: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
      gaps.push(ticks[i]!.index - ticks[i - 1]!.index);
    }
    const step = gaps[0]!;
    for (const g of gaps) {
      assert.ok(Math.abs(g - step) < 1e-9, `uneven gap ${g} vs step ${step}`);
    }
  });

  it('scrolls smoothly: tick indices stay put while camera pans', () => {
    const data = bars(300);
    const sticky: TimeLatticeSticky = { step: 0, span: 0 };
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
    const sticky: TimeLatticeSticky = { step: 0, span: 0 };
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
    const sticky: TimeLatticeSticky = { step: 0, span: 0 };
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
    assert.ok(a.length >= 2 && b.length >= 2);
    assert.ok(
      Math.abs(a[0]!.index - b[0]!.index) < 1e-9,
      `phase jump: ${a[0]!.index} vs ${b[0]!.index}`,
    );
  });

  it('prefers declared TF period when series agrees', () => {
    const data = bars(40);
    assert.equal(resolveBarPeriod(data, 60), 60);
    assert.equal(resolveBarPeriod(data, 86_400), 60);
  });

  it('holds density across small zooms (octave hysteresis)', () => {
    const data = bars(400);
    const sticky: TimeLatticeSticky = { step: 0, span: 0 };
    const r0 = { fromIndex: 100, toIndex: 200 };
    niceTimeTicks(r0, data, 8, { sticky });
    assert.equal(sticky.step, 16);
    const r1 = { fromIndex: 100, toIndex: 220 };
    niceTimeTicks(r1, data, 8, { sticky });
    assert.equal(sticky.step, 16);
  });

  it('zoom-out keeps candle-aligned nested subset (no teleport)', () => {
    const data = bars(800);
    const sticky: TimeLatticeSticky = { step: 0, span: 0 };
    const spans = [80, 160, 320, 640];
    let prevRange: { fromIndex: number; toIndex: number } | null = null;
    let prev: ReturnType<typeof niceTimeTicks> | null = null;
    let prevStep = 0;
    for (const span of spans) {
      const range = { fromIndex: 50, toIndex: 50 + span };
      const ticks = niceTimeTicks(range, data, 8, { sticky });
      assert.ok(ticks.length >= 2);
      for (const t of ticks) {
        assert.equal(t.index, Math.round(t.index));
      }
      assert.equal(sticky.step & (sticky.step - 1), 0);
      assert.ok(sticky.step >= prevStep);
      assert.equal(sticky.step, nestedIndexStep(span / 8));
      if (prevStep > 0) {
        assert.equal(sticky.step % prevStep, 0);
      }
      if (prev && prevRange) {
        for (const t of ticks) {
          if (t.index < prevRange.fromIndex || t.index >= prevRange.toIndex) {
            continue;
          }
          const was = prev.some((p) => p.index === t.index);
          assert.ok(was, `teleport at index ${t.index}`);
        }
      }
      prev = ticks;
      prevRange = range;
      prevStep = sticky.step;
    }
  });
});
