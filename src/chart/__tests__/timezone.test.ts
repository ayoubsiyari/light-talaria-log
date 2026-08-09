/**
 * Chart timezone helpers. Run:
 * npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  convertToTimezoneDate,
  formatZonedTime,
  wallClockToUtcMillis,
  zonedParts,
} from '@/chart/timezone';

describe('chart timezone', () => {
  it('formats UTC like the legacy axis (MM-DD HH:mm)', () => {
    // 2026-03-26 15:23:00 UTC
    const t = Date.UTC(2026, 2, 26, 15, 23, 0) / 1000;
    assert.equal(formatZonedTime(t, 'utc'), '03-26 15:23');
  });

  it('shifts New York behind UTC in winter/summer appropriately', () => {
    // 2026-01-15 17:00 UTC → 12:00 EST (UTC-5)
    const winter = Date.UTC(2026, 0, 15, 17, 0, 0) / 1000;
    const p = zonedParts(winter, 'America/New_York');
    assert.equal(p.hour, 12);
    assert.equal(formatZonedTime(winter, 'America/New_York'), '01-15 12:00');
  });

  it('convertToTimezoneDate exposes wall clock via UTC getters (V9 HUD)', () => {
    const ms = Date.UTC(2026, 0, 15, 17, 0, 0);
    const d = convertToTimezoneDate(ms, 'America/New_York');
    assert.equal(d.getUTCHours(), 12);
    assert.equal(d.getUTCDate(), 15);
  });

  it('wallClockToUtcMillis round-trips NY wall time', () => {
    const ms = wallClockToUtcMillis(2026, 1, 15, 12, 0, 0, 'America/New_York');
    const p = zonedParts(ms / 1000, 'America/New_York');
    assert.equal(p.year, 2026);
    assert.equal(p.month, 1);
    assert.equal(p.day, 15);
    assert.equal(p.hour, 12);
    assert.equal(p.minute, 0);
  });
});
