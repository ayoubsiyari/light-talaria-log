/**
 * Upload a local IDB dataset (meta + series + packed chunks) to `/api/v1`
 * so other browsers can Import without re-hitting Dukascopy.
 *
 * Order: chunk binaries → series meta → dataset meta (ready).
 * Does not change the canvas viewport path (still ≤2500 from IDB).
 */
import { getChunk, getSeriesMeta, openDb } from '@/data/idbStore';
import { ensureDatasetIngested } from '@/datasets/ingestDataset';
import {
  getDataset,
  markDatasetServerSynced,
} from '@/datasets/datasetStore';
import {
  putRemoteChunkBinary,
  putRemoteDatasetMeta,
  putRemoteSeriesMeta,
} from '@/datasets/remoteApi';
import type { SeriesCatalog } from '@/types/series';
import type { Timeframe } from '@/types/ui';

export interface PublishProgress {
  phase: 'ingest' | 'upload';
  percent: number;
  detail: string;
}

export interface PublishResult {
  datasetId: string;
  timeframes: Timeframe[];
  chunkCount: number;
}

/**
 * Ensure bar chunks exist in IDB, then publish every available TF to the
 * shared server disk store under the same dataset id.
 */
export async function publishDatasetToServer(
  datasetId: string,
  onProgress?: (p: PublishProgress) => void,
): Promise<PublishResult> {
  const entry = getDataset(datasetId);
  if (!entry) {
    throw new Error('Dataset not in local catalog. Download or import first.');
  }

  onProgress?.({
    phase: 'ingest',
    percent: 0,
    detail: 'Preparing bar chunks…',
  });

  const catalog = await ensureDatasetIngested(
    datasetId,
    entry.timeframe,
    (p) => {
      onProgress?.({
        phase: 'ingest',
        percent: Math.min(40, Math.round(p.percent * 0.4)),
        detail: `Building chunks… ${p.percent}%`,
      });
    },
  );

  return uploadCatalogToServer(catalog, entry.pair, onProgress);
}

async function uploadCatalogToServer(
  catalog: SeriesCatalog,
  symbol: string,
  onProgress?: (p: PublishProgress) => void,
): Promise<PublishResult> {
  const db = await openDb();
  const tfs = catalog.timeframes;
  let chunkCount = 0;

  // Count total chunks for progress
  const metas = [];
  for (const tf of tfs) {
    const meta = await getSeriesMeta(db, catalog.datasetId, tf);
    if (meta && meta.chunkIds.length > 0) metas.push(meta);
  }
  if (metas.length === 0) {
    throw new Error('No series chunks to publish. Re-download and try again.');
  }
  const totalChunks = metas.reduce((n, m) => n + m.chunkIds.length, 0);
  let doneChunks = 0;

  for (const meta of metas) {
    for (let i = 0; i < meta.chunkIds.length; i++) {
      const chunkId = meta.chunkIds[i]!;
      const buf = await getChunk(db, chunkId);
      if (!buf || buf.byteLength === 0) {
        throw new Error(`Missing chunk ${chunkId} in IndexedDB`);
      }
      await putRemoteChunkBinary(
        catalog.datasetId,
        meta.timeframe,
        i,
        buf,
      );
      chunkCount += 1;
      doneChunks += 1;
      const uploadPct =
        totalChunks > 0 ? Math.round((doneChunks / totalChunks) * 55) : 55;
      onProgress?.({
        phase: 'upload',
        percent: 40 + uploadPct,
        detail: `Uploading ${meta.timeframe} chunk ${i + 1}/${meta.chunkIds.length}…`,
      });
    }

    await putRemoteSeriesMeta(catalog.datasetId, meta.timeframe, {
      rowCount: meta.rowCount,
      timeStart: meta.timeStart,
      timeEnd: meta.timeEnd,
      chunkIds: meta.chunkIds,
      chunkStarts: meta.chunkStarts,
      chunkTimeStarts: meta.chunkTimeStarts,
      chunkTimeEnds: meta.chunkTimeEnds,
    });
  }

  const rowCounts: Record<string, number> = {};
  for (const [tf, n] of Object.entries(catalog.rowCounts)) {
    if (typeof n === 'number') rowCounts[tf] = n;
  }

  await putRemoteDatasetMeta(catalog.datasetId, {
    id: catalog.datasetId,
    symbol,
    baseTimeframe: catalog.baseTf,
    name: `${symbol} ${catalog.baseTf} (${catalog.datasetId.slice(0, 8)})`,
    visibility: 'public_read',
    status: 'ready',
    timeStart: catalog.timeStart,
    timeEnd: catalog.timeEnd,
    rowCounts,
    timeframes: tfs,
  });

  markDatasetServerSynced(catalog.datasetId);
  onProgress?.({
    phase: 'upload',
    percent: 100,
    detail: 'Saved on server',
  });

  return {
    datasetId: catalog.datasetId,
    timeframes: tfs,
    chunkCount,
  };
}
