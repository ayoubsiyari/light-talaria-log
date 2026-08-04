/**
 * Remote → IDB path (Step 13).
 * TradingView-style: fetch a small time window for the open/base TF on session
 * start; top up from the server as pan/replay approaches the IDB edge.
 */
import {
  getChunk,
  getSeriesMeta,
  hasSeriesIngested,
  openDb,
  putChunk,
  putSeriesMeta,
} from '@/data/idbStore';
import { timeframeSeconds } from '@/data/timeframeAgg';
import { getDataset, registerRemoteDataset } from '@/datasets/datasetStore';
import { scheduleRemoteChunkGc } from '@/datasets/idbChunkGc';
import { fetchChunkBinary, fetchRemoteChunks, getRemoteDataset } from '@/datasets/remoteApi';
import type { RemoteChunkRef, RemoteDatasetMeta } from '@/types/remoteApi';
import type { SeriesCatalog, SeriesMeta } from '@/types/series';
import type { Timeframe } from '@/types/ui';
import { CHUNK_SIZE } from '@/utils/constants';

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

export interface EnsureSessionFromServerOpts {
  /** Chart ticker TF (fetched in addition to base when different). */
  openTf?: Timeframe;
  onProgress?: (p: SessionFetchProgress) => void;
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

/** Parse `datasetId/tf/12` → 12 for stable merge ordering. */
function chunkIndexFromId(chunkId: string): number {
  const m = chunkId.match(/\/(\d+)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

interface ChunkSlice {
  chunkId: string;
  /** Server absolute logical start — sort secondary only; never stored as IDB index. */
  serverLogicalStart: number;
  timeStart: number;
  timeEnd: number;
  bytes: number;
}

/**
 * Build SeriesMeta with contiguous 0-based chunkStarts matching local rowCount.
 * Absolute server logical indices must not be used — viewport/replay index into 0..rowCount.
 */
function metaFromChunkSlices(
  datasetId: string,
  timeframe: Timeframe,
  slices: ChunkSlice[],
): SeriesMeta {
  const ordered = [...slices].sort((a, b) => {
    const ia = chunkIndexFromId(a.chunkId);
    const ib = chunkIndexFromId(b.chunkId);
    if (ia !== ib) return ia - ib;
    if (a.timeStart !== b.timeStart) return a.timeStart - b.timeStart;
    return a.serverLogicalStart - b.serverLogicalStart;
  });

  const chunkIds: string[] = [];
  const chunkStarts: number[] = [];
  const chunkTimeStarts: number[] = [];
  const chunkTimeEnds: number[] = [];
  let cursor = 0;

  for (const s of ordered) {
    const n = barsFromBytes(s.bytes);
    if (n <= 0) continue;
    chunkIds.push(s.chunkId);
    chunkStarts.push(cursor);
    chunkTimeStarts.push(s.timeStart);
    chunkTimeEnds.push(s.timeEnd);
    cursor += n;
  }

  if (chunkIds.length === 0) {
    throw new Error('No server chunks with bar data for this range.');
  }

  return {
    datasetId,
    timeframe,
    rowCount: cursor,
    timeStart: chunkTimeStarts[0]!,
    timeEnd: chunkTimeEnds[chunkTimeEnds.length - 1]!,
    chunkIds,
    chunkStarts,
    chunkTimeStarts,
    chunkTimeEnds,
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
        serverLogicalStart: chunkIndexFromId(chunkId) * CHUNK_SIZE,
        timeStart: existing.chunkTimeStarts[i] ?? 0,
        timeEnd: existing.chunkTimeEnds[i] ?? 0,
        bytes: buf?.byteLength ?? 0,
      });
    }
  }
  for (const ref of fetched) {
    byId.set(ref.chunkId, {
      chunkId: ref.chunkId,
      serverLogicalStart: ref.logicalStart,
      timeStart: ref.timeStart,
      timeEnd: ref.timeEnd,
      bytes: ref.bytes > 0 ? ref.bytes : byId.get(ref.chunkId)?.bytes ?? 0,
    });
  }
  const slices = [...byId.values()];
  if (slices.length === 0) {
    throw new Error('No server chunks for this date range.');
  }
  return metaFromChunkSlices(datasetId, timeframe, slices);
}

async function refreshMetaBytesFromIdb(
  db: IDBDatabase,
  meta: SeriesMeta,
): Promise<SeriesMeta> {
  const slices: ChunkSlice[] = [];
  for (let i = 0; i < meta.chunkIds.length; i++) {
    const chunkId = meta.chunkIds[i]!;
    const buf = await getChunk(db, chunkId);
    slices.push({
      chunkId,
      serverLogicalStart: chunkIndexFromId(chunkId) * CHUNK_SIZE,
      timeStart: meta.chunkTimeStarts[i] ?? 0,
      timeEnd: meta.chunkTimeEnds[i] ?? 0,
      bytes: buf?.byteLength ?? 0,
    });
  }
  return metaFromChunkSlices(meta.datasetId, meta.timeframe, slices);
}

function catalogForSession(
  datasetId: string,
  remote: RemoteDatasetMeta,
  idbTfs: readonly Timeframe[],
  sessionTimeStart: number,
  sessionTimeEnd: number,
  rowCounts: Partial<Record<Timeframe, number>>,
): SeriesCatalog {
  const baseTf = (remote.baseTimeframe as Timeframe) || '1m';
  const serverTfs = remoteTimeframes(remote);
  // Advertise server TFs (lazy fetch on switch); ensure loaded ones are listed.
  const timeframes = [
    ...new Set<Timeframe>([...serverTfs, ...idbTfs, baseTf]),
  ];
  return {
    datasetId,
    baseTf,
    timeframes,
    rowCounts,
    // Session clock uses the user's date window (clamped), not only the first IDB slice.
    timeStart: sessionTimeStart,
    timeEnd: sessionTimeEnd,
  };
}

/**
 * Pull remote chunks for one TF into IndexedDB and store SeriesMeta.
 * When fromTime/toTime are set, meta is rematerialized to contiguous 0-based
 * indices so viewport/replay math works.
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
  if (ranged && sm.chunks.length === 0) {
    throw new Error(
      `No server data for ${remote.symbol} ${timeframe} in the requested time window.`,
    );
  }

  const db = await openDb();

  let meta: SeriesMeta = ranged
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

  // Download missing binaries first, then refresh meta from actual buffer sizes.
  for (const ref of sm.chunks) {
    if (skipExisting) {
      const existing = await getChunk(db, ref.chunkId);
      if (existing != null && existing.byteLength > 0) continue;
    }
    const buf = await fetchChunkBinary(ref.url);
    await putChunk(db, ref.chunkId, buf);
  }

  if (ranged) {
    meta = await refreshMetaBytesFromIdb(db, meta);
  }
  await putSeriesMeta(db, meta);

  const baseTf = (remote.baseTimeframe as Timeframe) || timeframe;
  const timeframes = (remote.timeframes ?? [timeframe]) as Timeframe[];
  const rowCounts: Partial<Record<Timeframe, number>> = {};
  for (const [tf, n] of Object.entries(remote.rowCounts ?? {})) {
    rowCounts[tf as Timeframe] = n;
  }
  rowCounts[timeframe] = meta.rowCount;

  return {
    datasetId,
    baseTf,
    timeframes: timeframes.includes(timeframe) ? timeframes : [...timeframes, timeframe],
    rowCounts,
    timeStart: meta.timeStart,
    timeEnd: meta.timeEnd,
  };
}

export interface RemoteCoverageOpts {
  /**
   * Cap how many bars of runway to pull in one request (default = 1 chunk).
   * Keeps replay/multi-pane from stalling on multi-hour downloads.
   */
  maxBars?: number;
}

/** One in-flight top-up per dataset×TF — multi-pane play shares the same fetch. */
const remoteCoverageInflight = new Map<string, Promise<boolean>>();

/**
 * If this dataset is remote and IDB does not cover [fromTime, toTime], fetch
 * a small gap from the server (≤ maxBars) and merge into IndexedDB.
 */
export async function ensureRemoteTimeCoverage(
  datasetId: string,
  timeframe: Timeframe,
  fromTime: number,
  toTime: number,
  opts: RemoteCoverageOpts = {},
): Promise<boolean> {
  if (!(Number.isFinite(fromTime) && Number.isFinite(toTime)) || fromTime > toTime) {
    return false;
  }

  const entry = getDataset(datasetId);
  // Unknown catalog: still try server (session may have cleared localStorage).
  if (entry && entry.source !== 'remote') return false;

  const inflightKey = `${datasetId}|${timeframe}`;
  const existing = remoteCoverageInflight.get(inflightKey);
  if (existing) return existing;

  const work = (async (): Promise<boolean> => {
    const db = await openDb();
    const meta = await getSeriesMeta(db, datasetId, timeframe);
    const tfSec = timeframeSeconds(timeframe);
    const pad = tfSec * 2;
    const maxBars = Math.max(500, Math.min(CHUNK_SIZE, opts.maxBars ?? CHUNK_SIZE));
    const maxSpan = tfSec * maxBars;

    if (
      meta &&
      meta.rowCount > 0 &&
      meta.timeStart <= fromTime + pad &&
      meta.timeEnd >= toTime - pad
    ) {
      return false;
    }

    let fetchFrom = fromTime;
    let fetchTo = toTime;
    if (meta && meta.rowCount > 0) {
      if (toTime > meta.timeEnd) {
        // Only pull the next runway ahead of what we already have.
        fetchFrom = meta.timeEnd - pad;
        fetchTo = Math.min(toTime, meta.timeEnd + maxSpan);
      } else if (fromTime < meta.timeStart) {
        fetchTo = meta.timeStart + pad;
        fetchFrom = Math.max(fromTime, meta.timeStart - maxSpan);
      } else {
        fetchFrom = fromTime;
        fetchTo = Math.min(toTime, fromTime + maxSpan);
      }
    } else {
      fetchTo = Math.min(toTime, fromTime + maxSpan);
    }

    if (fetchTo <= fetchFrom) return false;

    await ingestRemoteChunksToIdb(datasetId, timeframe, {
      fromTime: fetchFrom,
      toTime: fetchTo,
    });
    // Keep IDB bounded after each top-up (anchor = end of requested window).
    scheduleRemoteChunkGc(datasetId, timeframe, fetchTo);
    return true;
  })().finally(() => {
    remoteCoverageInflight.delete(inflightKey);
  });

  remoteCoverageInflight.set(inflightKey, work);
  return work;
}

/**
 * TradingView-style session open: fetch ~2 chunks of runway for base TF (+ open TF)
 * starting at the session start — not the full date span / all TFs.
 */
export async function ensureSessionDataFromServer(
  datasetId: string,
  startDate: string,
  endDate: string,
  opts: EnsureSessionFromServerOpts = {},
): Promise<SeriesCatalog> {
  const onProgress = opts.onProgress;
  const sessionFrom = dateToUnix(startDate, false);
  const sessionTo = dateToUnix(endDate, true);
  if (!Number.isFinite(sessionFrom) || !Number.isFinite(sessionTo) || sessionFrom > sessionTo) {
    throw new Error('Invalid session date range for server fetch.');
  }

  const remote = await getRemoteDataset(datasetId);
  if (remote.status === 'failed') {
    throw new Error(`Server dataset ${remote.name} is marked failed.`);
  }

  const baseTf = (remote.baseTimeframe as Timeframe) || '1m';
  const openTf = opts.openTf && opts.openTf !== baseTf ? opts.openTf : baseTf;
  const tfsToFetch: Timeframe[] = openTf === baseTf ? [baseTf] : [baseTf, openTf];

  const remoteStart = remote.timeStart || sessionFrom;
  const remoteEnd = remote.timeEnd || sessionTo;
  const boundStart = Math.max(sessionFrom, remoteStart);
  const boundEnd = Math.min(sessionTo, remoteEnd);
  if (boundStart > boundEnd) {
    throw new Error(
      `Session dates ${startDate} → ${endDate} are outside server coverage for ${remote.symbol}.`,
    );
  }

  // ~2 chunks of base TF (~10k 1m bars) — enough to paint + start replay.
  const padSec = Math.max(
    timeframeSeconds(baseTf) * CHUNK_SIZE * 2,
    24 * 60 * 60,
  );
  const fetchFrom = boundStart;
  let fetchTo = Math.min(boundEnd, boundStart + padSec);

  for (let i = 0; i < tfsToFetch.length; i++) {
    const tf = tfsToFetch[i]!;
    onProgress?.({
      datasetId,
      timeframe: tf,
      index: i,
      total: tfsToFetch.length,
      percent: Math.round((i / tfsToFetch.length) * 100),
      detail: `Fetching ${remote.symbol} ${tf} viewport…`,
    });
    // Expand forward if the first window is a weekend / empty gap.
    let loaded = false;
    let attemptTo = fetchTo;
    for (let attempt = 0; attempt < 6 && !loaded; attempt++) {
      try {
        await ingestRemoteChunksToIdb(datasetId, tf, {
          fromTime: fetchFrom,
          toTime: attemptTo,
        });
        loaded = true;
        fetchTo = attemptTo;
      } catch (err) {
        const nextTo = Math.min(boundEnd, attemptTo + padSec);
        if (nextTo <= attemptTo) throw err;
        attemptTo = nextTo;
      }
    }
    if (!loaded) {
      throw new Error(
        `No server bars for ${remote.symbol} ${tf} in ${startDate} → ${endDate}.`,
      );
    }
  }

  onProgress?.({
    datasetId,
    timeframe: tfsToFetch[tfsToFetch.length - 1]!,
    index: tfsToFetch.length - 1,
    total: tfsToFetch.length,
    percent: 100,
    detail: `Ready · more bars load as you pan / play`,
  });

  registerRemoteDataset(remote);

  const db = await openDb();
  const rowCounts: Partial<Record<Timeframe, number>> = {
    ...(remote.rowCounts as Partial<Record<Timeframe, number>>),
  };
  const idbTfs: Timeframe[] = [];
  for (const tf of tfsToFetch) {
    const meta = await getSeriesMeta(db, datasetId, tf);
    if (meta) {
      idbTfs.push(tf);
      rowCounts[tf] = meta.rowCount;
    }
  }

  return catalogForSession(
    datasetId,
    remote,
    idbTfs,
    boundStart,
    boundEnd,
    rowCounts,
  );
}

/**
 * Ingest every TF listed on the remote dataset (skips TFs already healthy in
 * IDB). Optional warm-cache from Datasets UI.
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

  const rowCounts: Partial<Record<Timeframe, number>> = {
    ...(remote.rowCounts as Partial<Record<Timeframe, number>>),
  };
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
