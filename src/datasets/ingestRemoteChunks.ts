/**
 * Remote → IDB path (Step 13).
 * Fetches chunk binaries by range and writes them with the same `putChunk` /
 * `putSeriesMeta` used by local CSV ingest. Does not replace viewport loader.
 *
 * Datasets UI imports via `ingestRemoteDatasetAllTfs`. Local Dukascopy/CSV
 * Create Session path is unchanged.
 */
import { getChunk, openDb, putChunk, putSeriesMeta } from '@/data/idbStore';
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
 * Ingest every TF listed on the remote dataset, then register a local catalog
 * entry (`source: 'remote'`) so Create Session can see it.
 */
export async function ingestRemoteDatasetAllTfs(
  datasetId: string,
  onProgress?: (p: IngestRemoteAllProgress) => void,
): Promise<SeriesCatalog> {
  const remote = await getRemoteDataset(datasetId);
  const tfs = (
    remote.timeframes?.length
      ? remote.timeframes
      : [remote.baseTimeframe || '1m']
  ) as Timeframe[];

  let last: SeriesCatalog | null = null;
  for (let i = 0; i < tfs.length; i++) {
    const tf = tfs[i]!;
    onProgress?.({ timeframe: tf, index: i, total: tfs.length });
    last = await ingestRemoteChunksToIdb(datasetId, tf);
  }

  registerRemoteDataset(remote);

  if (!last) {
    throw new Error('Remote dataset has no timeframes to ingest.');
  }

  // Prefer catalog spanning all ingested TFs from remote meta
  return {
    ...last,
    timeframes: tfs,
    baseTf: (remote.baseTimeframe as Timeframe) || last.baseTf,
    timeStart: remote.timeStart || last.timeStart,
    timeEnd: remote.timeEnd || last.timeEnd,
  };
}
