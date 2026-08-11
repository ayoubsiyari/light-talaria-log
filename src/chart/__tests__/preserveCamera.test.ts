import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChartBar } from '@/types/bar';
import {
  preservedVisibleRange,
  visibleBarsInRange,
} from '@/chart/preserveCamera';

function bars(n: number, start = 1_704_067_200, step = 900): ChartBar[] {
  // Default: 15m bars from 2024-01-01
  const out: ChartBar[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      time: start + i * step,
      open: 1,
      high: 1.1,
      low: 0.9,
      close: 1,
      volume: 1,
    });
  }
  return out;
}

describe('preservedVisibleRange', () => {
  it('wall-clock remap keeps candles filling the plot on 1m→15m', () => {
    // ~1200×1m minutes ≈ 80×15m bars
    const fromTime = 1_704_067_200;
    const toTime = fromTime + 1200 * 60;
    const data = bars(120, fromTime, 900);
    const range = preservedVisibleRange(
      data,
      { fromTime, toTime, anchorTime: toTime },
      1200,
      0.9,
    );
    const visible = visibleBarsInRange(data.length, range);
    assert.ok(
      visible >= 60,
      `expected dense candles after wall-clock remap, got ${visible}`,
    );
    assert.ok(range.fromIndex < data.length - 1);
  });

  it('rejects bar-count tipRatio=0 that would show only empty pad', () => {
    const data = bars(80);
    const tip = data[data.length - 1]!.time;
    const range = preservedVisibleRange(
      data,
      { anchorTime: tip, toTime: tip },
      1200,
      0, // would place fromIndex = tip → blank
    );
    assert.ok(visibleBarsInRange(data.length, range) >= 8);
    assert.ok(range.fromIndex < data.length - 1);
  });

  it('falls back when preserved window is entirely past the tip', () => {
    const data = bars(40);
    const tip = data[data.length - 1]!.time;
    const range = preservedVisibleRange(
      data,
      {
        fromTime: tip + 900 * 200,
        toTime: tip + 900 * 1400,
        anchorTime: tip + 900 * 1400,
      },
      1200,
      0.9,
    );
    assert.ok(visibleBarsInRange(data.length, range) >= 8);
  });

  it('clamps span to pan MAX_VISIBLE so first drag cannot snap', () => {
    const data = bars(2000, 1_704_067_200, 60); // dense 1m-like buffer
    const tip = data[data.length - 1]!.time;
    const fromTime = tip - 2400 * 60; // would map to ~2400 bars
    const range = preservedVisibleRange(
      data,
      { fromTime, toTime: tip, anchorTime: tip },
      2400,
      0.9,
    );
    const span = range.toIndex - range.fromIndex;
    assert.ok(span <= 1500, `span ${span} must be ≤ pan MAX_VISIBLE`);
  });

  it('fits zoom when tip-only 15m buffer would crush candles', () => {
    const data = bars(6); // short post-switch buffer
    const tip = data[data.length - 1]!.time;
    const fromTime = tip - 1200 * 60; // ~1m-sized wall window
    const range = preservedVisibleRange(
      data,
      { fromTime, toTime: tip, anchorTime: tip },
      80,
      0.9,
    );
    const visible = visibleBarsInRange(data.length, range);
    const span = range.toIndex - range.fromIndex;
    assert.ok(visible >= 6);
    assert.ok(visible / span >= 0.2, `candles crushed: ${visible}/${span}`);
  });
});
