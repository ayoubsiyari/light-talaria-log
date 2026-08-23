/**
 * Session-day daily buckets. Run: node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/data/__tests__/sessionDay.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateChartBars } from '@/data/timeframeAgg';
import {
  inferDailySessionKind,
  sessionDayBucketStart,
  wallClockToUnixSec,
} from '@/data/sessionDay';
import type { ChartBar } from '@/types/bar';

describe('inferDailySessionKind', () => {
  it('maps FX and metals to fx_ny', () => {
    assert.equal(inferDailySessionKind('EUR/USD'), 'fx_ny');
    assert.equal(inferDailySessionKind('XAUUSD'), 'fx_ny');
  });

  it('maps crypto to utc', () => {
    assert.equal(inferDailySessionKind('BTC/USD'), 'utc');
    assert.equal(inferDailySessionKind('ETHUSDT'), 'utc');
  });

  it('maps futures roots to futures_cme', () => {
    assert.equal(inferDailySessionKind('ES'), 'futures_cme');
    assert.equal(inferDailySessionKind('NQ1!'), 'futures_cme');
  });

  it('defaults unknown empty to utc', () => {
    assert.equal(inferDailySessionKind(''), 'utc');
    assert.equal(inferDailySessionKind(null), 'utc');
  });
});

describe('sessionDayBucketStart FX NY', () => {
  it('folds Sunday evening into Monday session open (Sun 17:00 NY)', () => {
    // 2026-01-11 is Sunday. 18:00 NY = 23:00 UTC (EST).
    const sunEve = wallClockToUnixSec(2026, 1, 11, 18, 0, 0, 'America/New_York');
    const open = sessionDayBucketStart(sunEve, 'fx_ny');
    const expected = wallClockToUnixSec(2026, 1, 11, 17, 0, 0, 'America/New_York');
    assert.equal(open, expected);
    // That open is still Sunday calendar in NY — Monday's TV candle.
    assert.equal(new Date(open * 1000).getUTCDay(), 0);
  });

  it('keeps Monday morning on Sunday 17:00 open', () => {
    const monMorning = wallClockToUnixSec(
      2026,
      1,
      12,
      10,
      0,
      0,
      'America/New_York',
    );
    const open = sessionDayBucketStart(monMorning, 'fx_ny');
    assert.equal(
      open,
      wallClockToUnixSec(2026, 1, 11, 17, 0, 0, 'America/New_York'),
    );
  });

  it('starts a new day exactly at 17:00 NY', () => {
    const monClose = wallClockToUnixSec(2026, 1, 12, 17, 0, 0, 'America/New_York');
    const open = sessionDayBucketStart(monClose, 'fx_ny');
    assert.equal(open, monClose);
  });

  it('respects EDT in summer (UTC-4)', () => {
    // 2026-07-06 Monday 10:00 NY (EDT) → open Sun 2026-07-05 17:00 NY = 21:00 UTC
    const mon = wallClockToUnixSec(2026, 7, 6, 10, 0, 0, 'America/New_York');
    const open = sessionDayBucketStart(mon, 'fx_ny');
    assert.equal(
      open,
      wallClockToUnixSec(2026, 7, 5, 17, 0, 0, 'America/New_York'),
    );
  });
});

describe('sessionDayBucketStart crypto utc', () => {
  it('uses UTC midnight', () => {
    const t = Date.UTC(2026, 0, 11, 15, 30, 0) / 1000; // Sunday afternoon UTC
    const open = sessionDayBucketStart(t, 'utc');
    assert.equal(open, Date.UTC(2026, 0, 11, 0, 0, 0) / 1000);
  });
});

describe('sessionDayBucketStart futures CME', () => {
  it('uses Chicago 17:00', () => {
    const mon = wallClockToUnixSec(2026, 1, 12, 10, 0, 0, 'America/Chicago');
    const open = sessionDayBucketStart(mon, 'futures_cme');
    assert.equal(
      open,
      wallClockToUnixSec(2026, 1, 11, 17, 0, 0, 'America/Chicago'),
    );
  });
});

describe('aggregateChartBars 1D by market', () => {
  function hourBars(
    fromUnix: number,
    hours: number,
    px0: number,
  ): ChartBar[] {
    const out: ChartBar[] = [];
    for (let i = 0; i < hours; i++) {
      const t = fromUnix + i * 3600;
      const px = px0 + i * 0.01;
      out.push({
        time: t,
        open: px,
        high: px + 0.02,
        low: px - 0.02,
        close: px + 0.01,
        volume: 1,
      });
    }
    return out;
  }

  it('FX 1D has no standalone Sunday calendar day from Sun eve prints', () => {
    // Fri 17:00 NY → Mon 17:00 NY with hourly prints (weekend gap empty).
    const friOpen = wallClockToUnixSec(2026, 1, 9, 17, 0, 0, 'America/New_York');
    const sunOpen = wallClockToUnixSec(2026, 1, 11, 17, 0, 0, 'America/New_York');
    const monClose = wallClockToUnixSec(2026, 1, 12, 17, 0, 0, 'America/New_York');
    const friHours = hourBars(friOpen, 24, 1.1); // through Sat 17 NY (dead in real FX but ok)
    const sunHours = hourBars(sunOpen, 24, 1.2); // Sun 17 → Mon 17
    const bars = [...friHours, ...sunHours].filter(
      (b) => b.time < monClose + 1,
    );
    const daily = aggregateChartBars(bars, '1D', { symbol: 'EUR/USD' });
    const opens = daily.map((d) => d.time);
    // Must include Fri session open and Sun(Mon) session open — not UTC midnight Sunday.
    assert.ok(opens.includes(friOpen));
    assert.ok(opens.includes(sunOpen));
    const utcSunday = Date.UTC(2026, 0, 11, 0, 0, 0) / 1000;
    assert.equal(opens.includes(utcSunday), false);
  });

  it('crypto 1D keeps UTC midnight Sundays', () => {
    const t0 = Date.UTC(2026, 0, 11, 0, 0, 0) / 1000;
    const bars = hourBars(t0, 30, 40000);
    const daily = aggregateChartBars(bars, '1D', { symbol: 'BTCUSD' });
    assert.ok(daily.some((d) => d.time === t0));
  });
});
