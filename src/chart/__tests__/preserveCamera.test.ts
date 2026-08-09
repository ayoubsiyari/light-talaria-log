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
});
