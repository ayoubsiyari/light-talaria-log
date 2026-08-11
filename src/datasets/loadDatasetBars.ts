import type { BinaryBarStore } from '@/data/binaryBar';
import type { ChartBar } from '@/types/bar';

export interface LoadDatasetBarsResult {
  bars: ChartBar[];
  barCount: number;
  totalRows: number;
}

export interface LoadDatasetSeriesResult {
  /** Full base series (TypedArrays) for TF aggregation */
  store: BinaryBarStore;
  barCount: number;
}

const QUARANTINE_MSG =
  'Quarantined (pipeline I1): do not load full CSV into memory for the chart. ' +
  'Use ensureDatasetIngested + seriesViewport / WarmCache (≤ MAX_BARS_IN_MEMORY).';

/**
 * @deprecated Full-series CSV parse — fail-closed. Use ensureDatasetIngested.
 */
export function loadDatasetSeries(_datasetId: string): Promise<LoadDatasetSeriesResult> {
  return Promise.reject(new Error(QUARANTINE_MSG));
}

/**
 * @deprecated Re-parses whole CSV for last N bars — fail-closed.
 * Use ensureDatasetIngested + loadViewportAroundTime / WarmCache.
 */
export function loadDatasetBars(_datasetId: string): Promise<LoadDatasetBarsResult> {
  return Promise.reject(new Error(QUARANTINE_MSG));
}
