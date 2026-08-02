import type { Timeframe } from '@/types/ui';

export interface DateChunk {
  from: string;
  to: string;
  /** Calendar year label for UI (may span partial year). */
  label: string;
}

/** Split [startDate, endDate] into calendar-year chunks (inclusive UTC dates). */
export function splitRangeByYear(startDate: string, endDate: string): DateChunk[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const startY = Number(startDate.slice(0, 4));
  const endY = Number(endDate.slice(0, 4));
  if (!Number.isFinite(startY) || !Number.isFinite(endY)) return [];

  const chunks: DateChunk[] = [];
  for (let y = startY; y <= endY; y++) {
    const from = y === startY ? startDate : `${y}-01-01`;
    const to = y === endY ? endDate : `${y}-12-31`;
    if (from <= to) {
      chunks.push({ from, to, label: String(y) });
    }
  }
  return chunks;
}

export function isCsvHeader(line: string): boolean {
  const lower = line.trim().toLowerCase();
  return (
    lower.startsWith('timestamp') ||
    lower.startsWith('time') ||
    (lower.includes('open') && lower.includes('close'))
  );
}

/**
 * Merge year CSVs into one (header once).
 * Dedupes by timestamp (later chunks win) and sorts ascending — safe when
 * re-downloading overlapping years into the same dataset.
 */
export function mergeCsvParts(parts: readonly string[]): {
  csv: string;
  rowCount: number;
} {
  const byTime = new Map<string, string>();
  for (const part of parts) {
    if (!part || !part.trim()) continue;
    for (const line of part.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || isCsvHeader(trimmed)) continue;
      const ts = trimmed.split(',')[0]?.trim();
      if (!ts) continue;
      byTime.set(ts, trimmed);
    }
  }
  const sorted = [...byTime.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const lines = ['timestamp,open,high,low,close,volume', ...sorted.map(([, row]) => row)];
  const rowCount = sorted.length;
  return { csv: lines.join('\n') + (rowCount > 0 ? '\n' : ''), rowCount };
}

export interface ChunkDownloadProgress {
  chunkIndex: number;
  chunkTotal: number;
  from: string;
  to: string;
  label: string;
  rowsInChunk: number;
  rowsSoFar: number;
  timeframe: Timeframe;
}
