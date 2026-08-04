import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lttbIndices } from '../math/lttb';

describe('Phase 5 — LTTB', () => {
  it('preserves the true minimum (max drawdown trough)', () => {
    const n = 10_000;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    let minI = 0;
    let minY = Infinity;
    for (let i = 0; i < n; i++) {
      x[i] = i;
      // smooth ramp with a sharp trough at i=7777
      y[i] = i < 7777 ? 1000 - i * 0.01 : 1000 - 7777 * 0.01 + (i - 7777) * 0.02;
      if (i === 7777) y[i] = -500;
      if (y[i]! < minY) {
        minY = y[i]!;
        minI = i;
      }
    }
    const idx = lttbIndices(x, y, 500);
    const sampledMins = [...idx].map((i) => y[i]!);
    const keptMin = Math.min(...sampledMins);
    assert.equal(keptMin, minY);
    assert.ok([...idx].includes(minI));
  });
});
