import { CHUNK_SIZE } from '@/utils/constants';
import {
  openDb,
  putChunk,
  putSeriesMeta,
  getDatasetCsv,
  getSeriesMeta,
} from '@/data/idbStore';
import { getDataset } from '@/datasets/datasetStore';
import { ingestRemoteDatasetAllTfs } from '@/datasets/ingestRemoteChunks';
import { recordIngestMetrics } from '@/datasets/pipelineMetrics';
import { seriesChunksHealthy } from '@/datasets/seriesHealth';
import { aggregatableTimeframes } from '@/data/timeframeAgg';
import type { CsvWorkerResponse } from '@/types/bar';
import type { SeriesCatalog, SeriesMeta } from '@/types/series';
import type { Timeframe } from '@/types/ui';

export interface IngestProgress {
  percent: number;
  rowsParsed: number;
}

/**
 * Ensure dataset is ingested into IDB chunks (base TF + aggregated TFs).
 * Local CSV: no-op if base series meta + chunks already exist.
 * Remote: always sync any missing TFs from the API (so 5m…1D appear after a
 * 1m-only import), then return the full IDB catalog.
 */
export async function ensureDatasetIngested(
  datasetId: string,
  baseTf: Timeframe,
  onProgress?: (p: IngestProgress) => void,
): Promise<SeriesCatalog> {
  const t0 = performance.now();
  const db = await openDb();
  const catalogEntry = getDataset(datasetId);

  if (catalogEntry?.source === 'remote') {
    const catalog = await ingestRemoteDatasetAllTfs(datasetId, (p) => {
      const percent =
        p.total > 0 ? Math.round(((p.index + 1) / p.total) * 100) : 0;
      onProgress?.({ percent, rowsParsed: 0 });
    });
    if (!(await seriesChunksHealthy(db, datasetId, baseTf))) {
      throw new Error(
        'Remote ingest finished but bar chunks are missing from IndexedDB.',
      );
    }
    recordIngestMetrics({
      datasetId,
      source: 'remote',
      skipped: false,
      durationMs: performance.now() - t0,
      rowCount: catalog.rowCounts[baseTf] ?? 0,
    });
    return catalog;
  }

  if (await seriesChunksHealthy(db, datasetId, baseTf)) {
    const catalog = await buildCatalog(db, datasetId, baseTf);
    recordIngestMetrics({
      datasetId,
      source: 'local',
      skipped: true,
      durationMs: performance.now() - t0,
      rowCount: catalog.rowCounts[baseTf] ?? 0,
    });
    return catalog;
  }

  const csv = await getDatasetCsv(db, datasetId);
  if (!csv) {
    throw new Error('Dataset CSV not found. Re-download from Datasets.');
  }

  const metas = await runIngestWorker(csv, datasetId, baseTf, onProgress);
  for (const meta of metas) {
    await putSeriesMeta(db, meta);
  }
  const catalog = await buildCatalog(db, datasetId, baseTf);
  if (!(await seriesChunksHealthy(db, datasetId, baseTf))) {
    throw new Error('Ingest finished but bar chunks are missing from IndexedDB.');
  }
  recordIngestMetrics({
    datasetId,
    source: 'local',
    skipped: false,
    durationMs: performance.now() - t0,
    rowCount: catalog.rowCounts[baseTf] ?? 0,
  });
  return catalog;
}

async function buildCatalog(
  db: IDBDatabase,
  datasetId: string,
  baseTf: Timeframe,
): Promise<SeriesCatalog> {
  const tfs = aggregatableTimeframes(baseTf);
  const rowCounts: Partial<Record<Timeframe, number>> = {};
  let timeStart = 0;
  let timeEnd = 0;
  const available: Timeframe[] = [];

  for (const tf of tfs) {
    const meta = await getSeriesMeta(db, datasetId, tf);
    if (!meta) continue;
    available.push(tf);
    rowCounts[tf] = meta.rowCount;
    if (tf === baseTf) {
      timeStart = meta.timeStart;
      timeEnd = meta.timeEnd;
    }
  }

  if (available.length === 0) {
    throw new Error('Ingest produced no series metadata.');
  }

  return {
    datasetId,
    baseTf,
    timeframes: available,
    rowCounts,
    timeStart,
    timeEnd,
  };
}

function runIngestWorker(
  csvText: string,
  datasetId: string,
  baseTf: Timeframe,
  onProgress?: (p: IngestProgress) => void,
): Promise<SeriesMeta[]> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const db = await openDb();
      const worker = new Worker(new URL('@/data/csvWorker.ts', import.meta.url), {
        type: 'module',
      });

      /** Serialize chunk writes so ingestDone waits for all puts */
      let writeChain: Promise<void> = Promise.resolve();

      worker.onmessage = (e: MessageEvent<CsvWorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          onProgress?.({ percent: msg.percent, rowsParsed: msg.rowsParsed });
          return;
        }
        if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.message));
          return;
        }
        if (msg.type === 'ingestChunk') {
          const buf = msg.buffer;
          const id = msg.chunkId;
          writeChain = writeChain.then(() => putChunk(db, id, buf));
          return;
        }
        if (msg.type === 'ingestDone') {
          const metas = msg.metas;
          void writeChain
            .then(() => {
              worker.terminate();
              resolve(metas);
            })
            .catch((err: unknown) => {
              worker.terminate();
              reject(err instanceof Error ? err : new Error('Chunk write failed'));
            });
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(new Error(err.message || 'Ingest worker failed'));
      };

      worker.postMessage({
        type: 'ingest',
        csvText,
        datasetId,
        baseTf,
        chunkSize: CHUNK_SIZE,
      });
    })();
  });
}

export async function loadSeriesMeta(
  datasetId: string,
  timeframe: Timeframe,
): Promise<SeriesMeta | null> {
  const db = await openDb();
  return getSeriesMeta(db, datasetId, timeframe);
}
