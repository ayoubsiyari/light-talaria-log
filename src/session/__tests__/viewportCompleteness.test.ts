/**
 * Viewport completeness + full bar scan. Run:
 * node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/session/__tests__/viewportCompleteness.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bucketStart } from '@/data/timeframeAgg';
import {
  checkCrossTfCandles,
  checkViewportCompleteness,
  fullViewportMinBars,
  minBarsForSpan,
  needsViewportHeal,
  scanBarIntegrity,
} from '@/session/viewportCompleteness';
import type { ChartBar } from '@/types/bar';

/** Aligned to 5m (also 1m). */
const T0 = bucketStart(1_700_000_000, 300);

function bars(n: number, t0 = T0, step = 60): ChartBar[] {
  const out: ChartBar[] = [];
  for (let i = 0; i < n; i++) {
    const px = 1 + i * 0.0001;
    out.push({
      time: t0 + i * step,
      open: px,
      high: px + 0.0002,
      low: px - 0.0002,
      close: px + 0.0001,
      volume: 1,
    });
  }
  return out;
}

/** Aggregate closed buckets from 1m into a coarser TF. */
function aggregate1m(base: readonly ChartBar[], period: number): ChartBar[] {
  const out: ChartBar[] = [];
  let bucket = Number.NaN;
  let open = 0;
  let high = 0;
  let low = 0;
  let close = 0;
  let volume = 0;
  let has = false;
  const flush = () => {
    if (!has) return;
    out.push({ time: bucket, open, high, low, close, volume });
    has = false;
  };
  for (const b of base) {
    const bs = bucketStart(b.time, period);
    if (!has || bs !== bucket) {
      flush();
      bucket = bs;
      open = b.open;
      high = b.high;
      low = b.low;
      close = b.close;
      volume = b.volume ?? 0;
      has = true;
    } else {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      close = b.close;
      volume += b.volume ?? 0;
    }
  }
  flush();
  return out;
}

describe('minBarsForSpan', () => {
  it('clamps tip-only threshold', () => {
    assert.equal(minBarsForSpan(10), 8);
    assert.equal(minBarsForSpan(100), 20);
    assert.equal(minBarsForSpan(500), 24);
  });
});

describe('fullViewportMinBars', () => {
  it('targets ~85% of span for full history', () => {
    assert.ok(fullViewportMinBars(120) >= 100);
    assert.ok(fullViewportMinBars(10) >= minBarsForSpan(10));
  });
});

describe('scanBarIntegrity', () => {
  it('passes a healthy 5m series', () => {
    const data = bars(40, T0, 300);
    const r = scanBarIntegrity(data, '5m');
    assert.equal(r.ok, true, r.reason);
  });

  it('fails bad OHLC', () => {
    const data = bars(10, T0, 300);
    data[3] = { ...data[3]!, high: 0.5, low: 2, open: 1, close: 1 };
    const r = scanBarIntegrity(data, '5m');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'bad_ohlc');
  });

  it('fails misaligned bucket (1m times on 5m tf)', () => {
    // Off 5m boundary by 60s
    const data = bars(20, T0 + 60, 60);
    const r = scanBarIntegrity(data, '5m');
    assert.equal(r.ok, false);
    assert.ok(
      r.reason === 'misaligned_bucket' || r.reason === 'tf_mismatch',
    );
  });

  it('fails unsorted / duplicate', () => {
    const data = bars(5, T0, 300);
    data[2] = { ...data[2]!, time: data[1]!.time };
    const r = scanBarIntegrity(data, '5m');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'duplicate_time');
  });
});

describe('checkCrossTfCandles', () => {
  it('passes when 5m matches 1m aggregates', () => {
    const m1 = bars(500, T0, 60);
    const m5 = aggregate1m(m1, 300);
    const cursor = m1[m1.length - 1]!.time;
    const r = checkCrossTfCandles(m5, m1, '5m', '1m', cursor);
    assert.equal(r.ok, true);
  });

  it('fails when a closed 5m candle disagrees with 1m', () => {
    const m1 = bars(500, T0, 60);
    const m5 = aggregate1m(m1, 300);
    const cursor = m1[m1.length - 1]!.time;
    const openBucket = bucketStart(cursor, 300);
    // Corrupt the last closed candle (inside the 24-bar sample window).
    let idx = -1;
    for (let i = m5.length - 1; i >= 0; i--) {
      if (m5[i]!.time < openBucket) {
        idx = i;
        break;
      }
    }
    assert.ok(idx >= 0);
    m5[idx] = { ...m5[idx]!, close: m5[idx]!.close + 1 };
    const r = checkCrossTfCandles(m5, m1, '5m', '1m', cursor);
    assert.equal(r.ok, false);
  });
});

describe('checkViewportCompleteness', () => {
  it('fails on empty bars', () => {
    const r = checkViewportCompleteness({
      bars: [],
      span: 120,
      cursorTime: T0,
      tf: '1m',
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'empty');
  });

  it('fails tip-only (single forming candle)', () => {
    const r = checkViewportCompleteness({
      bars: bars(1, T0, 300),
      span: 120,
      cursorTime: T0,
      tf: '5m',
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'tip_only');
    assert.equal(
      needsViewportHeal({
        bars: bars(1, T0, 300),
        span: 120,
        cursorTime: T0,
        tf: '5m',
      }),
      true,
    );
  });

  it('fails empty-left when tip cannot fill the zoom', () => {
    const r = checkViewportCompleteness({
      bars: bars(40, T0, 60),
      span: 120,
      cursorTime: T0 + 39 * 60,
      tf: '1m',
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'empty_left');
  });

  it('passes a healthy right-anchored buffer', () => {
    const data = bars(200, T0, 60);
    const r = checkViewportCompleteness({
      bars: data,
      span: 120,
      cursorTime: data[data.length - 1]!.time,
      tf: '1m',
      range: { fromIndex: 80, toIndex: 200 },
    });
    assert.equal(r.ok, true, r.reason);
  });

  it('fails short lookback when history starts near cursor', () => {
    const tip = T0 + 100_000;
    const short = bars(35, tip - 10 * 60, 60);
    short[short.length - 1] = { ...short[short.length - 1]!, time: tip };
    // tip may not be 1m-aligned — align it
    short[short.length - 1] = {
      ...short[short.length - 1]!,
      time: bucketStart(tip, 60),
    };
    const cursor = bucketStart(tip, 60);
    const r = checkViewportCompleteness({
      bars: short,
      span: 100,
      cursorTime: cursor,
      tf: '1m',
    });
    assert.equal(r.ok, false);
    assert.ok(
      r.reason === 'empty_left' ||
        r.reason === 'short_lookback' ||
        r.reason === 'misaligned_bucket',
    );
  });

  it('flags cross-TF mismatch in full scan', () => {
    const m1 = bars(500, T0, 60);
    const m5 = aggregate1m(m1, 300);
    const cursor = m1[m1.length - 1]!.time;
    const openBucket = bucketStart(cursor, 300);
    let idx = -1;
    for (let i = m5.length - 1; i >= 0; i--) {
      if (m5[i]!.time < openBucket) {
        idx = i;
        break;
      }
    }
    assert.ok(idx >= 0);
    m5[idx] = { ...m5[idx]!, high: m5[idx]!.high + 5 };
    const painted = m5.slice(-150);
    const r = checkViewportCompleteness({
      bars: painted,
      span: 120,
      cursorTime: cursor,
      tf: '5m',
      baseBars: m1,
      baseTf: '1m',
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'tf_mismatch');
  });
});
