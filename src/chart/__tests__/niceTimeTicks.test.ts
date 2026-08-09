/**
 * Continuous candle-aligned grid. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { indexToX } from '@/chart/scales';
import {
  niceTimeTicks,
  resolveBarPeriod,
  stepAlpha,
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
  it('stepAlpha is continuous across octave boundaries (zoom in)', () => {
    // 2-octave fade: at ideal=8, step4 is mid-fade (not a hard pop).
    const a8 = stepAlpha(4, 8.0);
    const a79 = stepAlpha(4, 7.9);
    assert.ok(a8 > 0.2 && a8 < 0.9, `at ideal=8, step4 fading (got ${a8})`);
    assert.ok(a79 >= a8 - 1e-9, 'zoom-in raises denser alpha');
    const a6 = stepAlpha(4, 6);
    const a5 = stepAlpha(4, 5);
    const a4 = stepAlpha(4, 4);
    assert.ok(a6 < a5 && a5 < a4, `fade-in expected: ${a6}, ${a5}, ${a4}`);
    assert.ok(Math.abs(a4 - 1) < 1e-9);
    // Two octaves denser → hidden (no every-bar curtain on 1m).
    assert.ok(stepAlpha(2, 8) <= 0.02);
    assert.ok(stepAlpha(1, 8) <= 0.02);
  });

  it('stepAlpha is continuous across octave boundaries (zoom out)', () => {
    const a8 = stepAlpha(8, 8);
    const a9 = stepAlpha(8, 9);
    const a12 = stepAlpha(8, 12);
    const a32 = stepAlpha(8, 32);
    assert.ok(Math.abs(a8 - 1) < 1e-9);
    assert.ok(a9 < a8 && a12 < a9, `fade-out expected: ${a8}, ${a9}, ${a12}`);
    assert.ok(a32 <= 0.02, `at ideal=32 step8 hidden (got ${a32})`);
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
    const shared = t0.filter((a) => t1.some((b) => b.index === a.index));
    assert.ok(shared.length >= 2);
    for (const tick of shared) {
      const x0 = indexToX(tick.index, r0, plot);
      const x1 = indexToX(tick.index, r1, plot);
      const expected = (0.4 / (r0.toIndex - r0.fromIndex)) * plot.width;
      assert.ok(Math.abs(x0 - x1 - expected) < 0.5);
    }
  });

  it('continues ticks into empty pads', () => {
    const data = bars(80);
    const right = niceTimeTicks({ fromIndex: 40, toIndex: 200 }, data, 8);
    assert.ok(right.some((t) => t.index >= data.length));
    const left = niceTimeTicks({ fromIndex: -120, toIndex: 40 }, data, 8);
    assert.ok(left.some((t) => t.index < 0));
  });

  it('moves grid X left when tip advances / buffer slides', () => {
    const data = bars(300);
    const span = 120;
    const r0 = { fromIndex: 100, toIndex: 100 + span };
    const r1 = { fromIndex: 101, toIndex: 101 + span };
    const t0 = niceTimeTicks(r0, data, 8);
    const t1 = niceTimeTicks(r1, data, 8);
    const shared = t0.find((a) => t1.some((b) => b.index === a.index));
    assert.ok(shared);
    assert.ok(
      indexToX(shared!.index, r1, plot) <
        indexToX(shared!.index, r0, plot) - 1,
    );

    const w0 = bars(120, 1_700_000_000);
    const w1 = bars(120, 1_700_000_000 + 60);
    const range = { fromIndex: 0, toIndex: 120 };
    const a = niceTimeTicks(range, w0, 8);
    const b = niceTimeTicks(range, w1, 8);
    const hit = a.find((x) => b.some((y) => y.time === x.time));
    assert.ok(hit);
    const next = b.find((y) => y.time === hit!.time)!;
    assert.ok(indexToX(next.index, range, plot) < indexToX(hit!.index, range, plot) - 1);
  });

  it('prefers declared TF period when series agrees', () => {
    const data = bars(40);
    assert.equal(resolveBarPeriod(data, 60), 60);
    assert.equal(resolveBarPeriod(data, 86_400), 60);
  });

  it('zoom-in does not pop denser lines at an octave boundary', () => {
    const data = bars(800);
    // ideal = span/8; cross ideal≈8 (span≈64) while zooming in
    const justCoarse = niceTimeTicks({ fromIndex: 40, toIndex: 40 + 65 }, data, 8);
    const justFine = niceTimeTicks({ fromIndex: 40, toIndex: 40 + 63 }, data, 8);
    const a0 = Math.max(...justCoarse.filter((t) => t.alpha < 0.99).map((t) => t.alpha), 0);
    const a1 = Math.max(...justFine.filter((t) => t.alpha < 0.99).map((t) => t.alpha), 0);
    assert.ok(
      Math.abs(a0 - a1) < 0.25,
      `dense alpha jumped across boundary: ${a0} → ${a1}`,
    );
  });

  it('does not emit every-other-bar minors at a normal 1m span', () => {
    const data = bars(400);
    const ticks = niceTimeTicks({ fromIndex: 100, toIndex: 220 }, data, 8);
    let minGap = Infinity;
    for (let i = 1; i < ticks.length; i++) {
      minGap = Math.min(minGap, ticks[i]!.index - ticks[i - 1]!.index);
    }
    assert.ok(minGap >= 4, `min grid gap should be ≥4 bars (got ${minGap})`);
    assert.ok(ticks.length <= 40, `too many strokes: ${ticks.length}`);
  });

  it('labels only on solid major ticks', () => {
    const data = bars(400);
    const ticks = niceTimeTicks({ fromIndex: 50, toIndex: 200 }, data, 8);
    for (const t of ticks) {
      if (t.label) assert.ok(t.alpha >= 0.99, 'label tick must be solid major');
    }
  });
});
