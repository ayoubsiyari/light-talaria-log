/**
 * TF spacing guard. Run: npm run test:session
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { timeframeSeconds } from '@/data/timeframeAgg';
import { barsMatchTimeframe } from '@/session/barTfGuard';
import type { ChartBar } from '@/types/bar';

function series(
  t0: number,
  count: number,
  period: number,
  extraGaps?: ReadonlyArray<{ at: number; gapSec: number }>,
): ChartBar[] {
  const bars: ChartBar[] = [];
  let t = t0;
  let i = 0;
  while (bars.length < count) {
    const gap = extraGaps?.find((g) => g.at === i);
    if (gap) t += gap.gapSec;
    else if (i > 0) t += period;
    bars.push({
      time: t,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1,
    });
    i += 1;
  }
  return bars;
}

describe('barsMatchTimeframe', () => {
  it('accepts regular 5m spacing', () => {
    const period = timeframeSeconds('5m');
    assert.equal(barsMatchTimeframe(series(1_700_000_000, 40, period), '5m'), true);
  });

  it('rejects 1m spacing under a 5m label', () => {
    const period = timeframeSeconds('1m');
    assert.equal(barsMatchTimeframe(series(1_700_000_000, 40, period), '5m'), false);
  });

  it('accepts futures 5m with a large session-break gap in the sample', () => {
    const period = timeframeSeconds('5m');
    // Overnight / weekend hole in the first window — median in-session gap stays 5m.
    const bars = series(1_700_000_000, 40, period, [
      { at: 10, gapSec: 17 * 3600 },
    ]);
    assert.equal(barsMatchTimeframe(bars, '5m'), true);
  });

  it('rejects coarser 1h series used as 5m', () => {
    const period = timeframeSeconds('1h');
    assert.equal(barsMatchTimeframe(series(1_700_000_000, 40, period), '5m'), false);
  });
});
