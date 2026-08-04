/**
 * Synthetic second-TF invariants.
 * Run: node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/data/__tests__/synthesizeSeconds.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBarStore } from '@/data/binaryBar';
import {
  expandMinuteTo1s,
  synthesize1sFromMinutes,
  synthesizeFromMinutes,
} from '@/data/synthesizeSeconds';

describe('expandMinuteTo1s', () => {
  it('emits 60 bars that respect OHLC + volume', () => {
    const out = createBarStore(60);
    const t0 = 1_700_000_000;
    expandMinuteTo1s(t0, 1.1, 1.12, 1.09, 1.115, 600, out);
    assert.equal(out.length, 60);
    assert.equal(out.time[0], t0);
    assert.equal(out.time[59], t0 + 59);
    // OHLC stored as f32 in BinaryBarStore consumers; keep epsilon checks.
    assert.ok(Math.abs(out.open[0]! - 1.1) < 1e-6);
    assert.ok(Math.abs(out.close[59]! - 1.115) < 1e-6);

    let maxH = -Infinity;
    let minL = Infinity;
    let vol = 0;
    for (let i = 0; i < out.length; i++) {
      maxH = Math.max(maxH, out.high[i]!);
      minL = Math.min(minL, out.low[i]!);
      vol += out.volume[i]!;
      assert.ok(out.high[i]! >= out.open[i]!);
      assert.ok(out.high[i]! >= out.close[i]!);
      assert.ok(out.low[i]! <= out.open[i]!);
      assert.ok(out.low[i]! <= out.close[i]!);
      assert.ok(out.high[i]! <= 1.12 + 1e-5);
      assert.ok(out.low[i]! >= 1.09 - 1e-5);
    }
    // Float32Array storage — compare with f32 epsilon / fround.
    assert.ok(Math.abs(maxH - Math.fround(1.12)) < 1e-6);
    assert.ok(Math.abs(minL - Math.fround(1.09)) < 1e-6);
    assert.ok(Math.abs(vol - 600) < 1e-3);
  });

  it('is deterministic for the same minute', () => {
    const a = createBarStore(60);
    const b = createBarStore(60);
    expandMinuteTo1s(1_700_000_060, 1.2, 1.25, 1.18, 1.22, 100, a);
    expandMinuteTo1s(1_700_000_060, 1.2, 1.25, 1.18, 1.22, 100, b);
    for (let i = 0; i < 60; i++) {
      assert.equal(a.close[i], b.close[i]);
      assert.equal(a.high[i], b.high[i]);
      assert.equal(a.low[i], b.low[i]);
    }
  });

  it('aggregates 1s → 5s / 15s / 30s cleanly', () => {
    const m1 = createBarStore(2);
    m1.time[0] = 1_700_000_000;
    m1.open[0] = 1.0;
    m1.high[0] = 1.02;
    m1.low[0] = 0.99;
    m1.close[0] = 1.01;
    m1.volume[0] = 60;
    m1.time[1] = 1_700_000_060;
    m1.open[1] = 1.01;
    m1.high[1] = 1.03;
    m1.low[1] = 1.0;
    m1.close[1] = 1.02;
    m1.volume[1] = 60;
    m1.length = 2;

    const s1 = synthesize1sFromMinutes(m1);
    assert.equal(s1.length, 120);

    const s5 = synthesizeFromMinutes(m1, '5s');
    assert.ok(s5.length >= 20 && s5.length <= 26);

    const s15 = synthesizeFromMinutes(m1, '15s');
    assert.ok(s15.length >= 6 && s15.length <= 10);

    const s30 = synthesizeFromMinutes(m1, '30s');
    assert.ok(s30.length >= 3 && s30.length <= 6);
  });
});

