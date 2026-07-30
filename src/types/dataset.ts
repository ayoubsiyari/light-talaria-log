import type { PairSymbol } from '@/types/session';
import type { Timeframe } from '@/types/ui';

/** Catalog entry for a Dukascopy (or other) download stored in the browser. */
export interface DownloadedDataset {
  id: string;
  pair: PairSymbol;
  timeframe: Timeframe;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  /** ISO date YYYY-MM-DD */
  endDate: string;
  rowCount: number;
  source: 'dukascopy';
  createdAt: number;
}

export interface DownloadDatasetInput {
  pair: PairSymbol;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
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
