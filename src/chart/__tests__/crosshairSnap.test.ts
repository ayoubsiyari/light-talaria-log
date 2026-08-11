/**
 * Crosshair snaps candle-to-candle. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCrosshair } from '@/chart/crosshair';
import type { ChartBar } from '@/types/bar';

/** Fri → Mon daily (no Sat/Sun bars) — common FX/futures pack. */
function friMonDaily(): ChartBar[] {
  // 2024-01-05 Fri 00:00 UTC, 2024-01-08 Mon 00:00 UTC
  const fri = 1_704_412_800;
  const mon = 1_704_672_000;
  return [
    {
      time: fri,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1,
    },
    {
      time: mon,
      open: 100.5,
      high: 102,
      low: 100,
      close: 101,
      volume: 1,
    },
  ];
}

describe('resolveCrosshair normal snaps to candles', () => {
  const bars = friMonDaily();
  const range = { fromIndex: -0.5, toIndex: 1.5 };
  const plot = { left: 0, top: 0, width: 200, height: 100 };
  const scale = { min: 90, max: 110 };

  it('locks X to candle center and uses bar.time (not weekend interpolate)', () => {
    // Pointer halfway between Fri (idx0) and Mon (idx1) → nearer Mon after round,
    // or Fri — either way must be a real bar time, never Sat/Sun.
    const mid = resolveCrosshair(
      100,
      50,
      'normal',
      bars,
      range,
      plot,
      scale,
    );
    assert.ok(mid);
    assert.ok(mid.bar != null);
    assert.ok(
      mid.time === bars[0]!.time || mid.time === bars[1]!.time,
      `unexpected time ${mid.time}`,
    );
    // Vertical line on candle center, not free canvas X.
    assert.notEqual(mid.x, 100);
    // Free Y (price follows cursor).
    assert.equal(mid.y, 50);
  });

  it('never reports Saturday/Sunday unix for Fri→Mon daily', () => {
    for (let px = 10; px < 190; px += 10) {
      const p = resolveCrosshair(px, 40, 'normal', bars, range, plot, scale);
      if (!p) continue;
      const day = new Date(p.time * 1000).getUTCDay(); // 0=Sun … 6=Sat
      assert.ok(day !== 0 && day !== 6, `got weekend weekday=${day} time=${p.time}`);
    }
  });

  it('stays visible in empty pad (left/right of candles)', () => {
    // Range shows pad before idx0 and after idx1.
    const wide = { fromIndex: -2, toIndex: 3 };
    const left = resolveCrosshair(5, 50, 'normal', bars, wide, plot, scale);
    assert.ok(left, 'left pad should show hair');
    assert.equal(left.time, bars[0]!.time);
    assert.equal(left.x, 5);
    const right = resolveCrosshair(195, 50, 'normal', bars, wide, plot, scale);
    assert.ok(right, 'right pad should show hair');
    assert.equal(right.time, bars[1]!.time);
    assert.equal(right.x, 195);
  });
});
