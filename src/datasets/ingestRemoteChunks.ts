/**
 * Remote → IDB path (Step 13).
 * Fetches chunk binaries by range and writes them with the same `putChunk` /
 * `putSeriesMeta` used by local CSV ingest. Does not replace viewport loader.
 *
 * Datasets UI imports via `ingestRemoteDatasetAllTfs`. Local Dukascopy/CSV
 * Create Session path is unchanged.
 */
import {
  getChunk,
  getSeriesMeta,
  hasSeriesIngested,
  openDb,
  putChunk,
  putSeriesMeta,
} from '@/data/idbStore';
import { registerRemoteDataset } from '@/datasets/datasetStore';
import { fetchChunkBinary, fetchRemoteChunks, getRemoteDataset } from '@/datasets/remoteApi';
import type { SeriesCatalog, SeriesMeta } from '@/types/series';
import type { Timeframe } from '@/types/ui';

export interface IngestRemoteOptions {
  /** Unix seconds; omit for full series on that TF. */
  fromTime?: number;
  toTime?: number;
  /** Skip fetch when chunk already present in IDB (default true). */
  skipExisting?: boolean;
}

export interface IngestRemoteAllProgress {
  timeframe: Timeframe;
  index: number;
  total: number;
}

/** True when series meta + first chunk exist for this TF. */
async function tfSeriesHealthy(
  db: IDBDatabase,
  datasetId: string,
  timeframe: Timeframe,
): Promise<boolean> {
  if (!(await hasSeriesIngested(db, datasetId, timeframe))) return false;
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.chunkIds.length === 0) return false;
  const buf = await getChunk(db, meta.chunkIds[0]!);
  return buf != null && buf.byteLength > 0;
}

function remoteTimeframes(remote: {
  timeframes?: string[];
  baseTimeframe?: string;
}): Timeframe[] {
  const listed = remote.timeframes?.length
    ? remote.timeframes
    : [remote.baseTimeframe || '1m'];
  return listed as Timeframe[];
}

async function catalogFromIdb(
  datasetId: string,
  remote: Awaited<ReturnType<typeof getRemoteDataset>>,
  tfs: readonly Timeframe[],
): Promise<SeriesCatalog> {
  const db = await openDb();
  const rowCounts: Partial<Record<Timeframe, number>> = {};
  const available: Timeframe[] = [];
  let timeStart = remote.timeStart || 0;
  let timeEnd = remote.timeEnd || 0;
  const baseTf = (remote.baseTimeframe as Timeframe) || '1m';

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
    throw new Error('Remote dataset has no timeframes in IndexedDB.');
  }

  return {
    datasetId,
    baseTf,
    timeframes: available,
    rowCounts,
    timeStart: remote.timeStart || timeStart,
    timeEnd: remote.timeEnd || timeEnd,
  };
}

/**
 * Pull remote chunks for one TF into IndexedDB and store SeriesMeta.
 * Returns a lightweight catalog handle (no bars in React state).
 */
export async function ingestRemoteChunksToIdb(
  datasetId: string,
  timeframe: Timeframe,
  opts: IngestRemoteOptions = {},
): Promise<SeriesCatalog> {
  const skipExisting = opts.skipExisting !== false;
  const remote = await getRemoteDataset(datasetId);
  const chunksRes = await fetchRemoteChunks({
    datasetId,
    timeframe,
    fromTime: opts.fromTime,
    toTime: opts.toTime,
  });

  const sm = chunksRes.seriesMeta;
  const meta: SeriesMeta = {
    datasetId,
    timeframe,
    rowCount: sm.rowCount,
    timeStart: sm.timeStart,
    timeEnd: sm.timeEnd,
    chunkIds: sm.chunkIds,
    chunkStarts: sm.chunkStarts,
    chunkTimeStarts: sm.chunkTimeStarts,
    chunkTimeEnds: sm.chunkTimeEnds,
  };

  const db = await openDb();
  await putSeriesMeta(db, meta);

  for (const ref of sm.chunks) {
    if (skipExisting) {
      const existing = await getChunk(db, ref.chunkId);
      if (existing != null && existing.byteLength > 0) continue;
    }
    const buf = await fetchChunkBinary(ref.url);
    await putChunk(db, ref.chunkId, buf);
  }

  const baseTf = (remote.baseTimeframe as Timeframe) || timeframe;
  const timeframes = (remote.timeframes ?? [timeframe]) as Timeframe[];
  const rowCounts: Partial<Record<Timeframe, number>> = {};
  for (const [tf, n] of Object.entries(remote.rowCounts ?? {})) {
    rowCounts[tf as Timeframe] = n;
  }
  if (rowCounts[timeframe] == null) {
    rowCounts[timeframe] = meta.rowCount;
  }

  return {
    datasetId,
    baseTf,
    timeframes: timeframes.includes(timeframe) ? timeframes : [...timeframes, timeframe],
    rowCounts,
    timeStart: remote.timeStart || meta.timeStart,
    timeEnd: remote.timeEnd || meta.timeEnd,
  };
}

/**
 * Ingest every TF listed on the remote dataset (skips TFs already healthy in
 * IDB), then register a local catalog entry (`source: 'remote'`).
 * Safe to call again after the server gains new timeframes (e.g. only 1m was
 * imported earlier).
 */
export async function ingestRemoteDatasetAllTfs(
  datasetId: string,
  onProgress?: (p: IngestRemoteAllProgress) => void,
): Promise<SeriesCatalog> {
  const remote = await getRemoteDataset(datasetId);
  const tfs = remoteTimeframes(remote);
  const db = await openDb();

  const missing: Timeframe[] = [];
  for (const tf of tfs) {
    if (!(await tfSeriesHealthy(db, datasetId, tf))) missing.push(tf);
  }

  for (let i = 0; i < missing.length; i++) {
    const tf = missing[i]!;
    onProgress?.({ timeframe: tf, index: i, total: missing.length });
    await ingestRemoteChunksToIdb(datasetId, tf);
  }

  registerRemoteDataset(remote);
  return catalogFromIdb(datasetId, remote, tfs);
}
