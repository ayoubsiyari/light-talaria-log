import type { Timeframe } from '@/types/ui';

/** Per-dataset + timeframe series stored as IDB chunks. */
export interface SeriesMeta {
  datasetId: string;
  timeframe: Timeframe;
  rowCount: number;
  timeStart: number;
  timeEnd: number;
  chunkIds: string[];
  /** Logical index at the start of each chunk */
  chunkStarts: number[];
  chunkTimeStarts: number[];
  chunkTimeEnds: number[];
}

export function seriesMetaKey(datasetId: string, timeframe: Timeframe): string {
  return `${datasetId}:${timeframe}`;
}

export function chunkKey(datasetId: string, timeframe: Timeframe, chunkIndex: number): string {
  return `${datasetId}/${timeframe}/${chunkIndex}`;
}

/** Lightweight handle kept in App (no full series in RAM). */
export interface SeriesCatalog {
  datasetId: string;
  baseTf: Timeframe;
  /** Available TFs that were ingested */
  timeframes: Timeframe[];
  /** rowCount per TF */
  rowCounts: Partial<Record<Timeframe, number>>;
  timeStart: number;
  timeEnd: number;
}
