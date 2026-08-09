import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formBucketFromClock } from '@/replay/formingBars';
import type { ChartBar } from '@/types/bar';

function clockBars(open: number, n: number, step = 60): ChartBar[] {
  const out: ChartBar[] = [];
  for (let i = 0; i < n; i++) {
    const t = open + i * step;
    out.push({
      time: t,
      open: 1 + i,
      high: 2 + i,
      low: 0.5,
      close: 1.5 + i,
      volume: 10,
    });
  }
  return out;
}

describe('formBucketFromClock', () => {
  it('at 15m open only includes the first 1m bar', () => {
    const open = 1_700_000_000;
    const bars = clockBars(open, 20);
    const formed = formBucketFromClock(bars, open, 900, open);
    assert.ok(formed);
    assert.equal(formed!.open, 1);
    assert.equal(formed!.close, 1.5);
    assert.equal(formed!.high, 2);
  });

  it('at 15m close includes all 15 ones of the bucket (full candle)', () => {
    const open = 1_700_000_000;
    const bars = clockBars(open, 20);
    const close = open + 14 * 60;
    const formed = formBucketFromClock(bars, open, 900, close);
    assert.ok(formed);
    assert.equal(formed!.open, 1);
    assert.equal(formed!.close, 1.5 + 14);
    assert.equal(formed!.high, 2 + 14);
  });
});
