import type { DownloadedDataset } from '@/types/dataset';
import type { PairSymbol } from '@/types/session';
import type { Timeframe } from '@/types/ui';

export interface DateCoverage {
  startDate: string;
  endDate: string;
}

/** Timeframes present for every selected pair. */
export function commonTimeframes(
  datasets: readonly DownloadedDataset[],
  pairs: readonly PairSymbol[],
): Timeframe[] {
  if (pairs.length === 0) return [];
  const perPair = pairs.map(
    (pair) => new Set(datasets.filter((d) => d.pair === pair).map((d) => d.timeframe)),
  );
  const first = [...(perPair[0] ?? [])];
  return first
    .filter((tf) => perPair.every((set) => set.has(tf)))
    .sort((a, b) => tfRank(a) - tfRank(b));
}

function tfRank(tf: Timeframe): number {
  const order: Timeframe[] = [
    '1s',
    '5s',
    '10s',
    '15s',
    '30s',
    '45s',
    '1m',
    '5m',
    '15m',
    '1h',
    '4h',
    '1D',
  ];
  const i = order.indexOf(tf);
  return i === -1 ? 99 : i;
}

/** Union coverage for one pair + timeframe (min start … max end of downloads). */
export function coverageForPair(
  datasets: readonly DownloadedDataset[],
  pair: PairSymbol,
  timeframe: Timeframe,
): DateCoverage | null {
  const rows = datasets.filter((d) => d.pair === pair && d.timeframe === timeframe);
  if (rows.length === 0) return null;
  let startDate = rows[0]!.startDate;
  let endDate = rows[0]!.endDate;
  for (const d of rows) {
    if (d.startDate < startDate) startDate = d.startDate;
    if (d.endDate > endDate) endDate = d.endDate;
  }
  return { startDate, endDate };
}

/** Intersection of coverages — dates available on every selected pair. */
export function overlapCoverage(
  coverages: readonly (DateCoverage | null)[],
): DateCoverage | null {
  const ok = coverages.filter((c): c is DateCoverage => c != null);
  if (ok.length === 0) return null;
  let startDate = ok[0]!.startDate;
  let endDate = ok[0]!.endDate;
  for (const c of ok) {
    if (c.startDate > startDate) startDate = c.startDate;
    if (c.endDate < endDate) endDate = c.endDate;
  }
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

/**
 * Pick the best downloaded dataset for a pair/TF that covers [start, end].
 * Prefers exact/full containment, then maximum overlap, then 1m-friendly rows.
 */
export function pickDatasetForRange(
  datasets: readonly DownloadedDataset[],
  pair: PairSymbol,
  timeframe: Timeframe,
  startDate: string,
  endDate: string,
): DownloadedDataset | null {
  const rows = datasets.filter((d) => d.pair === pair && d.timeframe === timeframe);
  if (rows.length === 0) return null;

  const scored = rows.map((d) => {
    const contains = d.startDate <= startDate && d.endDate >= endDate;
    const ovStart = d.startDate > startDate ? d.startDate : startDate;
    const ovEnd = d.endDate < endDate ? d.endDate : endDate;
    const overlapDays =
      ovStart <= ovEnd ? daySpan(ovStart, ovEnd) : -1;
    return { d, contains, overlapDays };
  });

  scored.sort((a, b) => {
    if (a.contains !== b.contains) return a.contains ? -1 : 1;
    if (b.overlapDays !== a.overlapDays) return b.overlapDays - a.overlapDays;
    return b.d.rowCount - a.d.rowCount;
  });

  return scored[0]?.overlapDays >= 0 ? scored[0].d : scored[0]?.d ?? null;
}

function daySpan(startDate: string, endDate: string): number {
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Clamp a YYYY-MM-DD into [min, max]. */
export function clampDate(date: string, min: string, max: string): string {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

/**
 * Default session window: last `months` ending at coverage end,
 * clamped so it never starts before coverage start.
 */
export function defaultLastMonthsCoverage(
  coverage: DateCoverage,
  months = 3,
): DateCoverage {
  const end = coverage.endDate;
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(endMs)) return { ...coverage };
  const startDt = new Date(endMs);
  startDt.setUTCMonth(startDt.getUTCMonth() - months);
  let start = startDt.toISOString().slice(0, 10);
  if (start < coverage.startDate) start = coverage.startDate;
  if (start > end) start = end;
  return { startDate: start, endDate: end };
}
