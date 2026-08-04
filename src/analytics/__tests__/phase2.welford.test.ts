import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  welfordInit,
  welfordPush,
  welfordVariance,
} from '../math/welford';
import { kahanAdd, kahanInit, kahanValue } from '../math/kahan';

describe('Phase 2 — Welford / Kahan', () => {
  it('Welford variance matches two-pass float64 to 1e-9 on 10k large-mean samples', () => {
    // One-pass Σx²−(Σx)²/n is the unstable formula Welford replaces — do not
    // use it as the reference. Two-pass (mean then centered squares) is the
    // defensible float64 ground truth for this acceptance check.
    const n = 10_000;
    const mean0 = 1e6;
    const xs = new Float64Array(n);
    for (let i = 0; i < n; i++) xs[i] = mean0 + (i % 17) - 8;

    let sum = 0;
    for (let i = 0; i < n; i++) sum += xs[i]!;
    const mean = sum / n;
    let m2 = 0;
    for (let i = 0; i < n; i++) {
      const d = xs[i]! - mean;
      m2 += d * d;
    }
    const twoPassVar = m2 / (n - 1);

    const w = welfordInit();
    for (let i = 0; i < n; i++) welfordPush(w, xs[i]!);
    const wv = welfordVariance(w, true);
    const rel = Math.abs(wv - twoPassVar) / Math.max(twoPassVar, 1e-30);
    assert.ok(
      Math.abs(wv - twoPassVar) < 1e-9 || rel < 1e-9,
      `wv=${wv} twoPass=${twoPassVar} rel=${rel}`,
    );
  });

  it('Kahan sum of many tiny values beats naive for money totals', () => {
    const k = kahanInit();
    let naive = 0;
    for (let i = 0; i < 100_000; i++) {
      kahanAdd(k, 0.01);
      naive += 0.01;
    }
    assert.ok(Math.abs(kahanValue(k) - 1000) < Math.abs(naive - 1000) + 1e-6);
    assert.ok(Math.abs(kahanValue(k) - 1000) < 1e-6);
  });
});
