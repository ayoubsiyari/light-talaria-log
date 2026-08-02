import type { PairSymbol } from '@/types/session';
import type { Timeframe } from '@/types/ui';

/** How the dataset was obtained for the local catalog. */
export type DatasetSource = 'dukascopy' | 'remote' | 'csv';

/** Catalog entry for a Dukascopy / remote / CSV dataset stored in the browser. */
export interface DownloadedDataset {
  id: string;
  pair: PairSymbol;
  timeframe: Timeframe;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  /** ISO date YYYY-MM-DD */
  endDate: string;
  rowCount: number;
  source: DatasetSource;
  createdAt: number;
}

export interface DownloadDatasetInput {
  pair: PairSymbol;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  /**
   * When true (default), merge into an existing Dukascopy catalog entry with the
   * same pair + timeframe instead of creating a second dataset.
   */
  mergeIntoSamePairTf?: boolean;
  /** Progress while downloading year chunks. */
  onProgress?: (p: {
    chunkIndex: number;
    chunkTotal: number;
    from: string;
    to: string;
    label: string;
    rowsInChunk: number;
    rowsSoFar: number;
  }) => void;
}

/** Response from POST /api/dukascopy */
export interface DukascopyDownloadResponse {
  csv: string;
  rowCount: number;
  pair: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  source: 'dukascopy';
}
