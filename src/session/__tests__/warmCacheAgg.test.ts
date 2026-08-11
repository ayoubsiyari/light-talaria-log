/**
 * On-demand HTF aggregation. Run: npm run test:session
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { aggregateChartBars, timeframeSeconds } from '@/data/timeframeAgg';
import { barsMatchTimeframe } from '@/session/barTfGuard';
import { warmCache } from '@/session/warmCache';
import type { ChartBar } from '@/types/bar';

const DS = 'agg-test-ds';

function make1m(t0: number, count: number): ChartBar[] {
  const period = timeframeSeconds('1m');
  const bars: ChartBar[] = [];
  for (let i = 0; i < count; i++) {
    const t = t0 + i * period;
    const px = 18000 + (i % 20) * 0.25;
    bars.push({
      time: t,
      open: px,
      high: px + 0.5,
      low: px - 0.5,
      close: px + 0.25,
      volume: 1,
    });
  }
  return bars;
}

describe('aggregateChartBars', () => {
  it('rolls 1m into 5m buckets', () => {
    const t0 = 1_700_000_000;
    const m1 = make1m(t0, 50);
    const m5 = aggregateChartBars(m1, '5m');
    assert.ok(m5.length >= 9);
    assert.equal(barsMatchTimeframe(m5, '5m'), true);
    assert.equal(m5[0]!.time % timeframeSeconds('5m'), 0);
  });
});

describe('warmCache HTF fallback', () => {
  beforeEach(() => {
    warmCache.clear();
  });

  it('fills 5m from cached 1m when packed 5m IDB is empty', async () => {
    const t0 = 1_700_000_000;
    const cursor = t0 + 40 * 60;
    const m1 = make1m(t0, 200);
    warmCache.put(DS, '1m', m1, cursor);

    // Unknown dataset → loadViewportAroundTime returns []; fill must aggregate.
    const filled = await warmCache.fill(DS, '5m', cursor, 120, {
      awaitRemote: false,
      windowBars: 200,
    });

    assert.ok(filled.length > 0, 'expected aggregated 5m bars');
    assert.equal(barsMatchTimeframe(filled, '5m'), true);
    assert.ok(filled.length < m1.length / 3, '5m count should be ~1/5 of 1m');

    const peek = warmCache.peek(DS, '5m');
    assert.ok(peek && peek.length === filled.length);
  });
});
