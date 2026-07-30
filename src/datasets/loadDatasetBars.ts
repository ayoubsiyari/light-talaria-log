import { unpackBuffer, type BinaryBarStore } from '@/data/binaryBar';
import { getDatasetCsv, openDb } from '@/data/idbStore';
import { toChartBars } from '@/data/binaryBar';
import type { ChartBar, CsvWorkerResponse } from '@/types/bar';
import { MAX_BARS_IN_MEMORY } from '@/utils/constants';

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

/**
 * Load dataset CSV from IndexedDB and parse the full series off-thread
 * into a BinaryBarStore (base for 1m → higher TF aggregation).
 */
export function loadDatasetSeries(datasetId: string): Promise<LoadDatasetSeriesResult> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const db = await openDb();
        const csv = await getDatasetCsv(db, datasetId);
        if (!csv) {
          reject(new Error('Dataset CSV not found in storage. Re-download from Datasets.'));
          return;
        }

        const worker = new Worker(new URL('@/data/csvWorker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (e: MessageEvent<CsvWorkerResponse>) => {
          const msg = e.data;
          if (msg.type === 'progress') return;
          if (msg.type === 'error') {
            worker.terminate();
            reject(new Error(msg.message));
            return;
          }
          if (msg.type === 'allBars') {
            const store = unpackBuffer(msg.buffer);
            worker.terminate();
            resolve({ store, barCount: msg.barCount });
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          reject(new Error(err.message || 'CSV worker failed'));
        };

        worker.postMessage({ type: 'parseAll', csvText: csv });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to load dataset'));
      }
    })();
  });
}

/**
 * Load dataset CSV and return last ≤ MAX_BARS_IN_MEMORY chart bars (legacy helper).
 */
export function loadDatasetBars(datasetId: string): Promise<LoadDatasetBarsResult> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const db = await openDb();
        const csv = await getDatasetCsv(db, datasetId);
        if (!csv) {
          reject(new Error('Dataset CSV not found in storage. Re-download from Datasets.'));
          return;
        }

        const worker = new Worker(new URL('@/data/csvWorker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (e: MessageEvent<CsvWorkerResponse>) => {
          const msg = e.data;
          if (msg.type === 'progress') return;
          if (msg.type === 'error') {
            worker.terminate();
            reject(new Error(msg.message));
            return;
          }
          if (msg.type === 'chartBars') {
            const store = unpackBuffer(msg.buffer);
            const bars = toChartBars(store, 0, store.length);
            worker.terminate();
            resolve({
              bars,
              barCount: msg.barCount,
              totalRows: msg.totalRows,
            });
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          reject(new Error(err.message || 'CSV worker failed'));
        };

        worker.postMessage({
          type: 'parseForChart',
          csvText: csv,
          maxBars: MAX_BARS_IN_MEMORY,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to load dataset'));
      }
    })();
  });
}
