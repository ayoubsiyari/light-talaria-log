/**
 * Local-disk stub for CDN/object-storage chunk binaries.
 * Layout: data/chunks/datasets/{datasetId}/{tf}/{chunkIndex}.bin
 * Meta:   data/chunks/datasets/{datasetId}/dataset.json
 *         data/chunks/datasets/{datasetId}/{tf}/series.json
 *
 * No Postgres — catalog is JSON on disk. Seeded with a tiny demo series on first use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BYTES_PER_BAR = 28;
export const DEMO_DATASET_ID = 'demo-eurusd-m1';

export interface DiskSeriesMeta {
  datasetId: string;
  timeframe: string;
  rowCount: number;
  timeStart: number;
  timeEnd: number;
  chunkIds: string[];
  chunkStarts: number[];
  chunkTimeStarts: number[];
  chunkTimeEnds: number[];
}

export interface DiskDatasetMeta {
  id: string;
  symbol: string;
  baseTimeframe: string;
  name: string;
  visibility: 'private' | 'shared' | 'public_read';
  status: 'pending' | 'ready' | 'failed';
  timeStart: number;
  timeEnd: number;
  rowCounts: Record<string, number>;
  timeframes: string[];
  ownerUserId: string;
}

export interface ChunkRangeEntry {
  chunkIndex: number;
  chunkId: string;
  url: string;
  logicalStart: number;
  timeStart: number;
  timeEnd: number;
  bytes: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: server/ → parent */
export const DATA_ROOT = path.resolve(__dirname, '..', 'data', 'chunks');

export function datasetsRoot(): string {
  return path.join(DATA_ROOT, 'datasets');
}

export function datasetDir(datasetId: string): string {
  return path.join(datasetsRoot(), datasetId);
}

export function objectKey(datasetId: string, tf: string, chunkIndex: number): string {
  return `datasets/${datasetId}/${tf}/${chunkIndex}.bin`;
}

export function chunkFilePath(datasetId: string, tf: string, chunkIndex: number): string {
  return path.join(datasetsRoot(), datasetId, tf, `${chunkIndex}.bin`);
}

export function seriesMetaPath(datasetId: string, tf: string): string {
  return path.join(datasetsRoot(), datasetId, tf, 'series.json');
}

export function datasetMetaPath(datasetId: string): string {
  return path.join(datasetsRoot(), datasetId, 'dataset.json');
}

function packBars(
  times: number[],
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): Buffer {
  const n = times.length;
  const buf = Buffer.alloc(n * BYTES_PER_BAR);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    buf.writeDoubleLE(times[i]!, offset);
    offset += 8;
    buf.writeFloatLE(opens[i]!, offset);
    offset += 4;
    buf.writeFloatLE(highs[i]!, offset);
    offset += 4;
    buf.writeFloatLE(lows[i]!, offset);
    offset += 4;
    buf.writeFloatLE(closes[i]!, offset);
    offset += 4;
    buf.writeFloatLE(volumes[i]!, offset);
    offset += 4;
  }
  return buf;
}

/** ~240 synthetic 1m bars — enough to verify fetch→IDB without large files. */
function buildDemoBars(): {
  times: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
} {
  const n = 240;
  const start = Date.UTC(2024, 0, 2, 8, 0, 0) / 1000; // 2024-01-02 08:00 UTC
  const times: number[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];
  let price = 1.1;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 17) * 0.0004 + (Math.random() - 0.5) * 0.0002;
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) + Math.random() * 0.00015;
    const low = Math.min(open, close) - Math.random() * 0.00015;
    times.push(start + i * 60);
    opens.push(open);
    highs.push(high);
    lows.push(low);
    closes.push(close);
    volumes.push(50 + Math.random() * 200);
    price = close;
  }
  return { times, opens, highs, lows, closes, volumes };
}

export function ensureChunkStore(): void {
  fs.mkdirSync(datasetsRoot(), { recursive: true });
  const demoDir = datasetDir(DEMO_DATASET_ID);
  const seriesPath = seriesMetaPath(DEMO_DATASET_ID, '1m');
  if (fs.existsSync(seriesPath) && fs.existsSync(datasetMetaPath(DEMO_DATASET_ID))) {
    return;
  }

  const { times, opens, highs, lows, closes, volumes } = buildDemoBars();
  const buf = packBars(times, opens, highs, lows, closes, volumes);
  const tfDir = path.join(demoDir, '1m');
  fs.mkdirSync(tfDir, { recursive: true });
  fs.writeFileSync(chunkFilePath(DEMO_DATASET_ID, '1m', 0), buf);

  const series: DiskSeriesMeta = {
    datasetId: DEMO_DATASET_ID,
    timeframe: '1m',
    rowCount: times.length,
    timeStart: times[0]!,
    timeEnd: times[times.length - 1]!,
    chunkIds: [`${DEMO_DATASET_ID}/1m/0`],
    chunkStarts: [0],
    chunkTimeStarts: [times[0]!],
    chunkTimeEnds: [times[times.length - 1]!],
  };
  fs.writeFileSync(seriesPath, JSON.stringify(series, null, 2));

  const dataset: DiskDatasetMeta = {
    id: DEMO_DATASET_ID,
    symbol: 'EUR/USD',
    baseTimeframe: '1m',
    name: 'Demo EUR/USD 1m (API stub)',
    visibility: 'public_read',
    status: 'ready',
    timeStart: series.timeStart,
    timeEnd: series.timeEnd,
    rowCounts: { '1m': series.rowCount },
    timeframes: ['1m'],
    ownerUserId: '00000000-0000-4000-8000-000000000001',
  };
  fs.writeFileSync(datasetMetaPath(DEMO_DATASET_ID), JSON.stringify(dataset, null, 2));
}

export function listDiskDatasets(): DiskDatasetMeta[] {
  ensureChunkStore();
  const root = datasetsRoot();
  if (!fs.existsSync(root)) return [];
  const out: DiskDatasetMeta[] = [];
  for (const name of fs.readdirSync(root)) {
    const metaPath = datasetMetaPath(name);
    if (!fs.existsSync(metaPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as DiskDatasetMeta;
      out.push(raw);
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function getDiskDataset(datasetId: string): DiskDatasetMeta | null {
  ensureChunkStore();
  const p = datasetMetaPath(datasetId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as DiskDatasetMeta;
  } catch {
    return null;
  }
}

export function getDiskSeriesMeta(datasetId: string, tf: string): DiskSeriesMeta | null {
  ensureChunkStore();
  const p = seriesMetaPath(datasetId, tf);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as DiskSeriesMeta;
  } catch {
    return null;
  }
}

export function readChunkBinary(
  datasetId: string,
  tf: string,
  chunkIndex: number,
): Buffer | null {
  ensureChunkStore();
  const p = chunkFilePath(datasetId, tf, chunkIndex);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

/** Chunks overlapping [fromTime, toTime] (unix seconds). Omitting bounds returns all. */
export function chunksForTimeRange(
  datasetId: string,
  tf: string,
  fromTime?: number,
  toTime?: number,
): { series: DiskSeriesMeta; chunks: ChunkRangeEntry[] } | null {
  const series = getDiskSeriesMeta(datasetId, tf);
  if (!series) return null;

  const from = fromTime ?? Number.NEGATIVE_INFINITY;
  const to = toTime ?? Number.POSITIVE_INFINITY;
  const chunks: ChunkRangeEntry[] = [];

  for (let i = 0; i < series.chunkIds.length; i++) {
    const t0 = series.chunkTimeStarts[i]!;
    const t1 = series.chunkTimeEnds[i]!;
    if (t1 < from || t0 > to) continue;
    const filePath = chunkFilePath(datasetId, tf, i);
    const bytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    chunks.push({
      chunkIndex: i,
      chunkId: series.chunkIds[i]!,
      url: `/api/v1/files/${objectKey(datasetId, tf, i)}`,
      logicalStart: series.chunkStarts[i]!,
      timeStart: t0,
      timeEnd: t1,
      bytes,
    });
  }

  return { series, chunks };
}
