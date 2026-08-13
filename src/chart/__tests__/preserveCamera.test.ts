import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChartBar } from '@/types/bar';
import {
  cameraSpanForTf,
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

describe('cameraSpanForTf', () => {
  it('5m→1m keeps the same candle count (no wall-clock zoom-out)', () => {
    const span = cameraSpanForTf(
      { span: 120, fromTime: 1_000_000, toTime: 1_000_000 + 120 * 300 },
      '5m',
      '1m',
    );
    assert.equal(span, 120);
  });

  it('1m→5m keeps bar density (no fat candles)', () => {
    const span = cameraSpanForTf(
      { span: 120, fromTime: 1_000_000, toTime: 1_000_000 + 120 * 60 },
      '1m',
      '5m',
    );
    // wallBars ≈ 32; max(32, 120) = 120
    assert.equal(span, 120);
  });
});

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

  it('keeps preserved span on short HTF buffer (1m→4h must not fatten)', () => {
    // Few 4h bars loaded; span asks for 120 — keep width, don't fit-zoom.
    const data = bars(16, 1_704_067_200, 14_400);
    const tip = data[data.length - 1]!.time;
    const range = preservedVisibleRange(
      data,
      { anchorTime: tip },
      120,
      0.9,
    );
    const span = range.toIndex - range.fromIndex;
    assert.ok(
      Math.abs(span - 120) < 1e-6,
      `expected span 120 after short HTF buffer, got ${span}`,
    );
  });

  it('fits only when almost no bars exist', () => {
    const data = bars(4);
    const tip = data[data.length - 1]!.time;
    const range = preservedVisibleRange(
      data,
      { anchorTime: tip },
      120,
      0.9,
    );
    const visible = visibleBarsInRange(data.length, range);
    assert.ok(visible >= 4);
  });

  it('tip-anchor without from/to uses converted span (explicit TF pick)', () => {
    // Dense 1m buffer after leaving a months-wide 4h camera.
    const data = bars(2000, 1_704_067_200, 60);
    const tip = data[data.length - 1]!.time;
    const range = preservedVisibleRange(
      data,
      { anchorTime: tip }, // no fromTime/toTime
      180,
      0.9,
    );
    const span = range.toIndex - range.fromIndex;
    assert.ok(Math.abs(span - 180) < 1e-6, `span ${span} should follow converted`);
    assert.ok(visibleBarsInRange(data.length, range) >= 8);
  });
});
