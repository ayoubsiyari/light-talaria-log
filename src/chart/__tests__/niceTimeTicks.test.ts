/**
 * Time-grid ticks must scroll with candles and continue into empty pad.
 * Run: npm run test:chart
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
  it('does not repeat the same timestamp across empty left pad', () => {
    const data = bars(80);
    const ticks = niceTimeTicks({ fromIndex: -200, toIndex: 100 }, data, 8);
    assert.ok(ticks.length >= 1);
    const times = ticks.map((t) => t.time);
    assert.equal(new Set(times).size, times.length, 'duplicate times');
  });

  it('places ticks over real bars in a normal window', () => {
    const data = bars(400);
    const ticks = niceTimeTicks({ fromIndex: 100, toIndex: 220 }, data, 6);
    assert.ok(ticks.length >= 2);
    for (const t of ticks) {
      assert.ok(t.index >= 100 && t.index < 220);
    }
  });

  it('continues ticks into empty right pad (future)', () => {
    const data = bars(80);
    // Tip near left; large empty future on the right
    const range = { fromIndex: 40, toIndex: 200 };
    const ticks = niceTimeTicks(range, data, 8);
    assert.ok(ticks.length >= 3);
    const beyondTip = ticks.filter((t) => t.index >= data.length);
    assert.ok(
      beyondTip.length >= 1,
      `expected pad ticks past tip, got indices=${ticks.map((t) => t.index).join(',')}`,
    );
    // Future labels must be after last bar time
    const lastTime = data[data.length - 1]!.time;
    for (const t of beyondTip) {
      assert.ok(t.time > lastTime, 'pad tick time should be in the future');
    }
  });

  it('continues ticks into empty left pad (past)', () => {
    const data = bars(80);
    const range = { fromIndex: -120, toIndex: 40 };
    const ticks = niceTimeTicks(range, data, 8);
    const beforeFirst = ticks.filter((t) => t.index < 0);
    assert.ok(beforeFirst.length >= 1, 'expected ticks in left pad');
    const firstTime = data[0]!.time;
    for (const t of beforeFirst) {
      assert.ok(t.time < firstTime, 'left-pad tick time should be in the past');
    }
  });

  it('moves grid X left when right-anchored tip advances by one bar', () => {
    const data = bars(300);
    const span = 120;
    const r0 = { fromIndex: 100, toIndex: 100 + span };
    const r1 = { fromIndex: 101, toIndex: 101 + span };
    const t0 = niceTimeTicks(r0, data, 6);
    const t1 = niceTimeTicks(r1, data, 6);
    assert.ok(t0.length >= 2 && t1.length >= 2);

    const shared = t0.find((a) => t1.some((b) => b.time === a.time));
    assert.ok(shared, 'expected overlapping tick time after +1 bar');
    const next = t1.find((b) => b.time === shared!.time)!;
    const x0 = indexToX(shared!.index, r0, plot);
    const x1 = indexToX(next.index, r1, plot);
    assert.ok(
      x1 < x0 - 1,
      `grid X should move left (x0=${x0}, x1=${x1})`,
    );
  });

  it('moves grid X left when buffer slides under a fixed index window', () => {
    const w0 = bars(120, 1_700_000_000);
    const w1 = bars(120, 1_700_000_000 + 60);
    const range = { fromIndex: 0, toIndex: 120 };
    const t0 = niceTimeTicks(range, w0, 6);
    const t1 = niceTimeTicks(range, w1, 6);
    assert.ok(t0.length >= 2 && t1.length >= 2);

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
