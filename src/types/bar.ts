import type { SeriesMeta } from '@/types/series';
import type { Timeframe } from '@/types/ui';

/** OHLCV bar for the viewport window only (≤ MAX_BARS_IN_MEMORY). */
export interface ChartBar {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartBarWithVolume extends ChartBar {
  volume: number;
}

/** Logical index range — primary coordinate for sync/replay (not DOM state). */
export interface VisibleRange {
  fromIndex: number;
  toIndex: number;
}

/** Legacy metadata shape (CSV import UI). */
export interface DatasetMeta {
  symbol: string;
  rowCount: number;
  timeStart: number;
  timeEnd: number;
  chunkIds: string[];
}

/** Worker messages: main → worker */
export type CsvWorkerRequest =
  /** @deprecated Legacy single-TF path — prefer `ingest`. */
  | { type: 'parse'; csvText: string; symbol: string; chunkSize: number }
  /** @deprecated Quarantined — prefer IDB viewport. */
  | { type: 'parseForChart'; csvText: string; maxBars: number }
  /** @deprecated Quarantined — materializes full series. */
  | { type: 'parseAll'; csvText: string }
  | {
      type: 'ingest';
      csvText: string;
      datasetId: string;
      baseTf: Timeframe;
      chunkSize: number;
    }
  | { type: 'cancel' };

/** Worker messages: worker → main */
export type CsvWorkerResponse =
  | { type: 'progress'; percent: number; rowsParsed: number }
  | { type: 'chunkStored'; chunkId: string; rowCount: number; buffer: ArrayBuffer }
  | { type: 'done'; meta: DatasetMeta }
  | {
      type: 'chartBars';
      buffer: ArrayBuffer;
      barCount: number;
      totalRows: number;
    }
  | {
      type: 'allBars';
      buffer: ArrayBuffer;
      barCount: number;
    }
  | {
      type: 'ingestChunk';
      datasetId: string;
      timeframe: Timeframe;
      chunkId: string;
      chunkIndex: number;
      logicalStart: number;
      timeStart: number;
      timeEnd: number;
      barCount: number;
      buffer: ArrayBuffer;
    }
  | {
      type: 'ingestDone';
      metas: SeriesMeta[];
    }
  | { type: 'error'; message: string };
