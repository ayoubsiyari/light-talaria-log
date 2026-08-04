/**
 * Remote → IDB path (Step 13).
 * Fetches chunk binaries by range and writes them with the same `putChunk` /
 * `putSeriesMeta` used by local CSV ingest. Does not replace viewport loader.
 *
 * Create Session fetches by date via `ensureSessionDataFromServer`.
 * Datasets UI may still warm-cache via `ingestRemoteDatasetAllTfs`.
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
import type { RemoteChunkRef } from '@/types/remoteApi';
import type { SeriesCatalog, SeriesMeta } from '@/types/series';
import type { Timeframe } from '@/types/ui';

const BYTES_PER_BAR = 28;

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

export interface SessionFetchProgress {
  datasetId: string;
  timeframe: Timeframe;
  index: number;
  total: number;
  percent: number;
  detail: string;
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

function dateToUnix(date: string, endOfDay: boolean): number {
  const iso = endOfDay ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
  return Math.floor(Date.parse(iso) / 1000);
}

function barsFromBytes(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.floor(bytes / BYTES_PER_BAR);
}

interface ChunkSlice {
  chunkId: string;
  logicalStart: number;
  timeStart: number;
  timeEnd: number;
  bytes: number;
}

function metaFromChunkSlices(
  datasetId: string,
  timeframe: Timeframe,
  slices: ChunkSlice[],
): SeriesMeta {
  const ordered = [...slices].sort((a, b) => a.logicalStart - b.logicalStart);
  const rowCount = ordered.reduce((n, s) => n + barsFromBytes(s.bytes), 0);
  return {
    datasetId,
    timeframe,
    rowCount,
    timeStart: ordered[0]?.timeStart ?? 0,
    timeEnd: ordered[ordered.length - 1]?.timeEnd ?? 0,
    chunkIds: ordered.map((s) => s.chunkId),
    chunkStarts: ordered.map((s) => s.logicalStart),
    chunkTimeStarts: ordered.map((s) => s.timeStart),
    chunkTimeEnds: ordered.map((s) => s.timeEnd),
  };
}

/** Merge existing IDB meta with newly fetched range chunks (by chunkId). */
async function buildRangeSeriesMeta(
  db: IDBDatabase,
  datasetId: string,
  timeframe: Timeframe,
  fetched: RemoteChunkRef[],
): Promise<SeriesMeta> {
  const byId = new Map<string, ChunkSlice>();
  const existing = await getSeriesMeta(db, datasetId, timeframe);
  if (existing) {
    for (let i = 0; i < existing.chunkIds.length; i++) {
      const chunkId = existing.chunkIds[i]!;
      const buf = await getChunk(db, chunkId);
      byId.set(chunkId, {
        chunkId,
        logicalStart: existing.chunkStarts[i] ?? i * 5000,
        timeStart: existing.chunkTimeStarts[i] ?? 0,
        timeEnd: existing.chunkTimeEnds[i] ?? 0,
        bytes: buf?.byteLength ?? 0,
      });
    }
  }
  for (const ref of fetched) {
    byId.set(ref.chunkId, {
      chunkId: ref.chunkId,
      logicalStart: ref.logicalStart,
      timeStart: ref.timeStart,
      timeEnd: ref.timeEnd,
      bytes: ref.bytes,
    });
  }
  const slices = [...byId.values()];
  if (slices.length === 0) {
    throw new Error('No server chunks for this date range.');
  }
  return metaFromChunkSlices(datasetId, timeframe, slices);
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
    // Prefer full server bounds for session clamping; IDB may be a date slice.
    timeStart: remote.timeStart || timeStart,
    timeEnd: remote.timeEnd || timeEnd,
  };
}

/**
 * Pull remote chunks for one TF into IndexedDB and store SeriesMeta.
 * When fromTime/toTime are set, meta lists only present chunks (merged with
 * any already-cached chunk ids) so the viewport never points at missing bins.
 */
export async function ingestRemoteChunksToIdb(
  datasetId: string,
  timeframe: Timeframe,
  opts: IngestRemoteOptions = {},
): Promise<SeriesCatalog> {
  const skipExisting = opts.skipExisting !== false;
  const ranged = opts.fromTime != null || opts.toTime != null;
  const remote = await getRemoteDataset(datasetId);
  const chunksRes = await fetchRemoteChunks({
    datasetId,
    timeframe,
    fromTime: opts.fromTime,
    toTime: opts.toTime,
  });

  const sm = chunksRes.seriesMeta;
  const db = await openDb();

  const meta: SeriesMeta = ranged
    ? await buildRangeSeriesMeta(db, datasetId, timeframe, sm.chunks)
    : {
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
 * Fetch server chunks covering [startDate, endDate] for every TF on the
 * remote dataset, register local catalog, return SeriesCatalog.
 * Used when the user starts/opens a session — no pre-import required.
 */
export async function ensureSessionDataFromServer(
  datasetId: string,
  startDate: string,
  endDate: string,
  onProgress?: (p: SessionFetchProgress) => void,
): Promise<SeriesCatalog> {
  const fromTime = dateToUnix(startDate, false);
  const toTime = dateToUnix(endDate, true);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) {
    throw new Error('Invalid session date range for server fetch.');
  }

  const remote = await getRemoteDataset(datasetId);
  if (remote.status === 'failed') {
    throw new Error(`Server dataset ${remote.name} is marked failed.`);
  }
  const tfs = remoteTimeframes(remote);
  if (tfs.length === 0) {
    throw new Error('Server dataset has no timeframes.');
  }

  for (let i = 0; i < tfs.length; i++) {
    const tf = tfs[i]!;
    onProgress?.({
      datasetId,
      timeframe: tf,
      index: i,
      total: tfs.length,
      percent: Math.round((i / tfs.length) * 100),
      detail: `Fetching ${remote.symbol} ${tf} (${startDate} → ${endDate})…`,
    });
    await ingestRemoteChunksToIdb(datasetId, tf, { fromTime, toTime });
  }

  onProgress?.({
    datasetId,
    timeframe: tfs[tfs.length - 1]!,
    index: tfs.length - 1,
    total: tfs.length,
    percent: 100,
    detail: `Fetched ${remote.symbol} for session dates`,
  });

  registerRemoteDataset(remote);
  return catalogFromIdb(datasetId, remote, tfs);
}

/**
 * Ingest every TF listed on the remote dataset (skips TFs already healthy in
 * IDB), then register a local catalog entry (`source: 'remote'`).
 * Optional warm-cache from Datasets UI — Create Session uses date fetch instead.
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
