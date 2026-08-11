/**
 * Body-drag must keep logical width across session gaps.
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  logicalSpan,
  translatePointsByLogical,
} from '@/drawings/moveByLogical';
import type { ChartBar } from '@/types/bar';

/** 5m bars with a large overnight gap (futures-style). */
function gappedBars(): ChartBar[] {
  const t0 = 1_700_000_000;
  const step = 300;
  const out: ChartBar[] = [];
  for (let i = 0; i < 10; i++) {
    const time = t0 + i * step;
    out.push({
      time,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1,
    });
  }
  // Overnight jump ~16h, then more bars
  const gapStart = t0 + 10 * step + 16 * 3600;
  for (let i = 0; i < 10; i++) {
    const time = gapStart + i * step;
    out.push({
      time,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1,
    });
  }
  return out;
}

describe('translatePointsByLogical', () => {
  const bars = gappedBars();

  it('keeps logical width when dragged across a session gap', () => {
    // Rect ending just before the overnight gap
    const origin = [
      { time: bars[7]!.time, price: 110 },
      { time: bars[9]!.time, price: 90 },
    ];
    const span0 = logicalSpan(origin[0]!, origin[1]!, bars);
    assert.equal(span0, 2);

    // Move +2 slots → right edge crosses into post-gap bars
    const moved = translatePointsByLogical(origin, bars, 2, 0);
    const span1 = logicalSpan(moved[0]!, moved[1]!, bars);
    assert.ok(
      Math.abs(span1 - span0) < 1e-9,
      `logical span changed ${span0} → ${span1}`,
    );

    // Same logical width, but wall-clock width now includes the overnight gap.
    const wall0 = origin[1]!.time - origin[0]!.time;
    const wall1 = moved[1]!.time - moved[0]!.time;
    assert.ok(wall1 > wall0 * 10, `expected wall span to jump, got ${wall0}→${wall1}`);
  });

  it('wall-clock +dt would squash — we reject that path via span check', () => {
    const origin = [
      { time: bars[7]!.time, price: 110 },
      { time: bars[9]!.time, price: 90 },
    ];
    const span0 = logicalSpan(origin[0]!, origin[1]!, bars);
    // Fake wall-clock drag: add overnight seconds to both times
    const gapDt = bars[10]!.time - bars[9]!.time;
    const wallMoved = origin.map((p) => ({
      time: p.time + gapDt,
      price: p.price,
    }));
    const spanWall = logicalSpan(wallMoved[0]!, wallMoved[1]!, bars);
    assert.notEqual(spanWall, span0, 'wall-clock dt must distort logical width');

    const logicalMoved = translatePointsByLogical(origin, bars, 3, 5);
    assert.ok(
      Math.abs(logicalSpan(logicalMoved[0]!, logicalMoved[1]!, bars) - span0) <
        1e-9,
    );
    assert.equal(logicalMoved[0]!.price, 115);
  });
});
