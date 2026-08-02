import type { SeriesMeta } from '@/types/series';

export interface BarIndex {
  meta: SeriesMeta;
  totalBars: number;
}

export function buildBarIndex(meta: SeriesMeta): BarIndex {
  return { meta, totalBars: meta.rowCount };
}

/** Find chunk array index that contains logical bar index. */
export function chunkIndexForLogical(meta: SeriesMeta, logicalIndex: number): number {
  const starts = meta.chunkStarts;
  if (starts.length === 0) return 0;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = starts[mid]!;
    const next = mid + 1 < starts.length ? starts[mid + 1]! : meta.rowCount;
    if (logicalIndex < start) hi = mid - 1;
    else if (logicalIndex >= next) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(starts.length - 1, lo));
}

/** Map unix time → logical index (at-or-before) using chunk time bounds + caller unpack. */
export function chunkIndexForTime(meta: SeriesMeta, timeSec: number): number {
  const starts = meta.chunkTimeStarts;
  if (starts.length === 0) return 0;
  if (timeSec <= starts[0]!) return 0;
  const ends = meta.chunkTimeEnds;
  if (timeSec >= ends[ends.length - 1]!) return starts.length - 1;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeSec < starts[mid]!) hi = mid - 1;
    else if (timeSec > ends[mid]!) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(starts.length - 1, hi));
}

export function logicalToPaddedRange(
  from: number,
  to: number,
  buffer: number,
  total: number,
): { from: number; to: number } {
  return {
    from: Math.max(0, Math.floor(from) - buffer),
    to: Math.min(total, Math.ceil(to) + buffer),
  };
}
