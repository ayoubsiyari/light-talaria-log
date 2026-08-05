/**
 * Time-grid ticks must not duplicate labels on empty replay pad.
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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

describe('niceTimeTicks', () => {
  it('does not repeat the same timestamp across empty left pad', () => {
    const data = bars(80);
    // Right-anchored view with large empty left (fromIndex negative)
    const ticks = niceTimeTicks(
      { fromIndex: -200, toIndex: 100 },
      data,
      8,
    );
    assert.ok(ticks.length >= 1);
    const times = ticks.map((t) => t.time);
    assert.equal(new Set(times).size, times.length, 'duplicate times');
    for (const t of ticks) {
      assert.ok(t.index >= 0 && t.index < data.length);
    }
  });

  it('places ticks only over real bars in a normal window', () => {
    const data = bars(400);
    const ticks = niceTimeTicks(
      { fromIndex: 100, toIndex: 220 },
      data,
      6,
    );
    assert.ok(ticks.length >= 2);
    for (const t of ticks) {
      assert.ok(t.index >= 100 && t.index < 220);
      assert.equal(t.time, data[t.index]!.time);
    }
  });
});
