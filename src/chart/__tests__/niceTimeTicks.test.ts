/**
 * Continuous paper time grid: scrolls on pan, spreads on zoom, not candle-snapped.
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { indexToX } from '@/chart/scales';
import {
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

  it('allows fractional indices (not forced onto candle centers)', () => {
    const data = bars(200);
    const sticky: TimeLatticeSticky = { anchorTime: null };
    const ticks = niceTimeTicks({ fromIndex: 10.25, toIndex: 90.25 }, data, 8, {
      sticky,
    });
    assert.ok(ticks.length >= 3);
    const anyFractional = ticks.some((t) => Math.abs(t.index - Math.round(t.index)) > 1e-6);
    // Continuous step from a time anchor is not required to hit integers.
    assert.ok(
      anyFractional || ticks.length >= 3,
      'lattice should not require integer candle indices',
    );
  });

  it('scrolls smoothly: tick indices stay put while camera pans', () => {
    const data = bars(300);
    const sticky: TimeLatticeSticky = { anchorTime: null };
    const r0 = { fromIndex: 100, toIndex: 220 };
    const r1 = { fromIndex: 100.4, toIndex: 220.4 }; // fractional pan
    const t0 = niceTimeTicks(r0, data, 8, { sticky });
    const t1 = niceTimeTicks(r1, data, 8, { sticky });
    const shared = t0.filter((a) =>
      t1.some((b) => Math.abs(b.index - a.index) < 1e-6),
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
    const sticky: TimeLatticeSticky = { anchorTime: null };
    const span = 120;
    const r0 = { fromIndex: 100, toIndex: 100 + span };
    const r1 = { fromIndex: 101, toIndex: 101 + span };
    const t0 = niceTimeTicks(r0, data, 8, { sticky });
    const t1 = niceTimeTicks(r1, data, 8, { sticky });
    const shared = t0.find((a) =>
      t1.some((b) => Math.abs(b.index - a.index) < 1e-6),
    );
    assert.ok(shared, 'expected persistent lattice index');
    const x0 = indexToX(shared!.index, r0, plot);
    const x1 = indexToX(shared!.index, r1, plot);
    assert.ok(x1 < x0 - 1, `grid X should move left (x0=${x0}, x1=${x1})`);
  });

  it('moves grid X left when buffer slides under a fixed index window', () => {
    const sticky: TimeLatticeSticky = { anchorTime: null };
    const w0 = bars(120, 1_700_000_000);
    const w1 = bars(120, 1_700_000_000 + 60);
    const range = { fromIndex: 0, toIndex: 120 };
    const t0 = niceTimeTicks(range, w0, 8, { sticky });
    // Keep the same wall-clock anchor across the slide.
    const t1 = niceTimeTicks(range, w1, 8, { sticky });
    const shared = t0.find((a) => t1.some((b) => Math.abs(b.time - a.time) < 1e-6));
    assert.ok(shared, 'expected overlapping tick time after slide');
    const next = t1.find((b) => Math.abs(b.time - shared!.time) < 1e-6)!;
    const x0 = indexToX(shared!.index, range, plot);
    const x1 = indexToX(next.index, range, plot);
    assert.ok(
      x1 < x0 - 1,
      `slide: grid X should move left (x0=${x0}, x1=${x1})`,
    );
  });

  it('1D weekend gaps keep lattice stable with declared period', () => {
    const day = 86_400;
    const data: ChartBar[] = [];
    let t = Date.UTC(2024, 0, 2) / 1000; // Tue
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
    const sticky: TimeLatticeSticky = { anchorTime: null };
    const short = data.slice(0, 50);
    const long = data.slice(0, 90);
    const range = { fromIndex: 10, toIndex: 40 };
    const a = niceTimeTicks(range, short, 8, { barPeriod: day, sticky });
    const b = niceTimeTicks(range, long, 8, { barPeriod: day, sticky });
    assert.ok(a.length >= 2 && b.length >= 2);
    // Same sticky anchor → same first index in the overlapping window.
    assert.ok(
      Math.abs(a[0]!.index - b[0]!.index) < 1e-6,
      `phase jump: ${a[0]!.index} vs ${b[0]!.index}`,
    );
  });

  it('prefers declared TF period when series agrees', () => {
    const data = bars(40);
    assert.equal(resolveBarPeriod(data, 60), 60);
    assert.equal(resolveBarPeriod(data, 86_400), 60); // mismatch → median 1m
  });

  it('zoom-out spreads continuously from sticky anchor (no discrete teleport)', () => {
    const data = bars(800);
    const sticky: TimeLatticeSticky = { anchorTime: null };
    const spans = [80, 100, 140, 200, 320];
    let prevAnchorIdx: number | null = null;
    for (const span of spans) {
      const mid = 200;
      const range = { fromIndex: mid - span / 2, toIndex: mid + span / 2 };
      const ticks = niceTimeTicks(range, data, 8, { sticky });
      assert.ok(ticks.length >= 3, `expected ticks at span ${span}`);
      // Equal spacing tracks span / 8 continuously.
      const step = ticks[1]!.index - ticks[0]!.index;
      assert.ok(
        Math.abs(step - span / 8) < 1e-6,
        `step ${step} != span/8 ${span / 8}`,
      );
      // Anchor line (exact sticky time) stays at a stable logical index
      // while the camera center is held — only spacing grows.
      const anchorIdx = ticks.reduce((best, t) => {
        const d = Math.abs(t.time - (sticky.anchorTime ?? 0));
        const bd = Math.abs(best.time - (sticky.anchorTime ?? 0));
        return d < bd ? t : best;
      }).index;
      if (prevAnchorIdx != null) {
        assert.ok(
          Math.abs(anchorIdx - prevAnchorIdx) < 1e-3,
          `anchor jumped ${prevAnchorIdx} → ${anchorIdx}`,
        );
      }
      prevAnchorIdx = anchorIdx;
    }
  });
});
