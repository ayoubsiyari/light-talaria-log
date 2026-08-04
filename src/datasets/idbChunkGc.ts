/**
 * Sliding-window GC for remote bar chunks in IndexedDB.
 *
 * - Only trims `source: 'remote'` series (local CSV/Dukascopy full history stays intact).
 * - Keeps chunks around the replay/pan anchor; rematerializes contiguous meta.
 * - Does not touch React paint path or warm-cache (caller may refresh).
 */
import {
  clearAllChunks,
  clearAllSeriesMeta,
  deleteChunk,
  getChunk,
  getSeriesMeta,
  openDb,
  putSeriesMeta,
} from '@/data/idbStore';
import { getDataset } from '@/datasets/datasetStore';
import type { SeriesMeta } from '@/types/series';
import type { Timeframe } from '@/types/ui';
import {
  IDB_CHUNK_GC_THROTTLE_MS,
  MAX_IDB_CHUNKS_PER_SERIES,
} from '@/utils/constants';

const BYTES_PER_BAR = 28;

const lastGcAt = new Map<string, number>();
const gcInflight = new Set<string>();

function barsFromBytes(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.floor(bytes / BYTES_PER_BAR);
}

function chunkIndexFromId(chunkId: string): number {
  const m = chunkId.match(/\/(\d+)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function rematerializeMeta(
  datasetId: string,
  timeframe: Timeframe,
  kept: Array<{
    chunkId: string;
    timeStart: number;
    timeEnd: number;
    bytes: number;
  }>,
): SeriesMeta {
  const ordered = [...kept].sort((a, b) => {
    const ia = chunkIndexFromId(a.chunkId);
    const ib = chunkIndexFromId(b.chunkId);
    if (ia !== ib) return ia - ib;
    return a.timeStart - b.timeStart;
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
    throw new Error('GC would leave series empty — skipped');
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

/**
 * Trim a remote series to chunks around `anchorTime`.
 * Returns true when chunks were deleted.
 */
export async function trimRemoteSeriesWindow(
  datasetId: string,
  timeframe: Timeframe,
  anchorTime: number,
  maxChunks = MAX_IDB_CHUNKS_PER_SERIES,
): Promise<boolean> {
  const entry = getDataset(datasetId);
  // Local full history must stay — re-ingest from CSV is expensive.
  if (entry && entry.source !== 'remote') return false;
  if (!Number.isFinite(anchorTime)) return false;

  const db = await openDb();
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.chunkIds.length <= maxChunks) return false;

  // Chunk nearest to / covering the anchor.
  let center = 0;
  for (let i = 0; i < meta.chunkIds.length; i++) {
    const t0 = meta.chunkTimeStarts[i] ?? 0;
    const t1 = meta.chunkTimeEnds[i] ?? t0;
    center = i;
    if (anchorTime <= t1) {
      if (anchorTime < t0 && i > 0) center = i - 1;
      break;
    }
  }

  // Prefer a bit more history behind the cursor (replay looks back) than ahead.
  const keepBehind = Math.max(2, Math.ceil(maxChunks * 0.6));
  const keepAhead = Math.max(1, maxChunks - keepBehind - 1);
  let from = Math.max(0, center - keepBehind);
  let to = Math.min(meta.chunkIds.length - 1, center + keepAhead);
  // Expand if window still under max (edge of series).
  while (to - from + 1 < maxChunks && (from > 0 || to < meta.chunkIds.length - 1)) {
    if (from > 0) from -= 1;
    else if (to < meta.chunkIds.length - 1) to += 1;
    else break;
  }

  const keep = new Set<string>();
  for (let i = from; i <= to; i++) keep.add(meta.chunkIds[i]!);

  const kept: Array<{
    chunkId: string;
    timeStart: number;
    timeEnd: number;
    bytes: number;
  }> = [];

  for (let i = 0; i < meta.chunkIds.length; i++) {
    const chunkId = meta.chunkIds[i]!;
    if (!keep.has(chunkId)) {
      await deleteChunk(db, chunkId);
      continue;
    }
    const buf = await getChunk(db, chunkId);
    if (!buf || buf.byteLength === 0) {
      await deleteChunk(db, chunkId);
      continue;
    }
    kept.push({
      chunkId,
      timeStart: meta.chunkTimeStarts[i] ?? 0,
      timeEnd: meta.chunkTimeEnds[i] ?? 0,
      bytes: buf.byteLength,
    });
  }

  if (kept.length === 0 || kept.length >= meta.chunkIds.length) return false;

  try {
    const next = rematerializeMeta(datasetId, timeframe, kept);
    await putSeriesMeta(db, next);
    return true;
  } catch {
    return false;
  }
}

/**
 * Throttled GC for play/pan — safe to call often; no-ops when under budget.
 */
export function scheduleRemoteChunkGc(
  datasetId: string,
  timeframe: Timeframe,
  anchorTime: number,
): void {
  const key = `${datasetId}|${timeframe}`;
  const now = Date.now();
  const last = lastGcAt.get(key) ?? 0;
  if (now - last < IDB_CHUNK_GC_THROTTLE_MS) return;
  if (gcInflight.has(key)) return;
  lastGcAt.set(key, now);
  gcInflight.add(key);
  void trimRemoteSeriesWindow(datasetId, timeframe, anchorTime)
    .catch(() => {
      /* ignore — never break play */
    })
    .finally(() => {
      gcInflight.delete(key);
    });
}

/**
 * Wipe packed bar chunks + series meta in IndexedDB.
 * Keeps dataset CSV blobs and localStorage catalog (server still has OHLC).
 */
export async function clearChartBarCache(): Promise<void> {
  const db = await openDb();
  await clearAllChunks(db);
  await clearAllSeriesMeta(db);
  lastGcAt.clear();
  gcInflight.clear();
}
