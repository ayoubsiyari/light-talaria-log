import type { LogbookTrade, StatsPeriod } from './types';

export function periodStartUnix(period: StatsPeriod, nowSec: number): number | null {
  if (period === 'all') return null;
  const now = new Date(nowSec * 1000);
  if (period === 'week') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return Math.floor(d.getTime() / 1000);
  }
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Closed trades in the period; opens always included on 'all'. */
export function filterByPeriod(
  trades: readonly LogbookTrade[],
  period: StatsPeriod,
  nowSec: number = Math.floor(Date.now() / 1000),
): LogbookTrade[] {
  const start = periodStartUnix(period, nowSec);
  if (start == null) return [...trades];
  return trades.filter((t) => {
    if (t.status === 'open') return t.openTime >= start;
    const t0 = t.closeTime ?? t.openTime;
    return t0 >= start;
  });
}

export function weekdayName(unixSec: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(unixSec * 1000).getDay()
  ]!;
}

export function utcYmd(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local calendar day — matches the desk clock, not UTC. */
export function localYmd(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthGrid(year: number, monthIndex: number): (number | null)[] {
  return localMonthGrid(year, monthIndex);
}

export function localMonthGrid(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
