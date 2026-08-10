/**
 * Register disk stub datasets (data/chunks/datasets/*) into Postgres.
 * Does NOT rewrite .bin files — object_key stays datasets/{id}/{tf}/{n}.bin.
 *
 * Default: skip datasets already in sync (meta + chunk counts) so routine
 * deploys stay seconds, not minutes. FORCE_DISK_IMPORT=1 or --force rewrites all.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { pool, query } from './db.js';

interface DiskDatasetMeta {
  id: string;
  symbol: string;
  baseTimeframe: string;
  name: string;
  visibility?: string;
  status?: string;
  timeStart?: number;
  timeEnd?: number;
  rowCounts?: Record<string, number>;
  timeframes?: string[];
}

interface DiskSeriesMeta {
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

type DbDatasetRow = {
  id: string;
  symbol: string;
  time_start: number;
  time_end: number;
  row_counts: Record<string, number> | null;
  timeframes: string[] | null;
};

type ChunkAgg = { chunks: number };

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function forceRefresh(): boolean {
  if (process.argv.includes('--force')) return true;
  const v = String(process.env.FORCE_DISK_IMPORT || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function ensureAdmin(): Promise<string> {
  const email = config.seed.adminEmail.toLowerCase();
  const existing = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  throw new Error('Admin user missing — run seed first');
}

async function loadDbSnapshot(): Promise<{
  datasets: Map<string, DbDatasetRow>;
  chunks: Map<string, ChunkAgg>;
}> {
  const datasets = new Map<string, DbDatasetRow>();
  const { rows: dsRows } = await query<DbDatasetRow>(
    `SELECT id, symbol, time_start, time_end, row_counts, timeframes FROM datasets`,
  );
  for (const r of dsRows) datasets.set(r.id, r);

  const chunks = new Map<string, ChunkAgg>();
  const { rows: chRows } = await query<{
    dataset_id: string;
    timeframe: string;
    chunks: string;
  }>(
    `SELECT dataset_id, timeframe, COUNT(*)::text AS chunks
       FROM dataset_chunks
      GROUP BY dataset_id, timeframe`,
  );
  for (const r of chRows) {
    chunks.set(`${r.dataset_id}|${r.timeframe}`, {
      chunks: Number(r.chunks) || 0,
    });
  }
  return { datasets, chunks };
}

function asRowCounts(
  v: Record<string, number> | string | null | undefined,
): Record<string, number> {
  if (!v) return {};
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as Record<string, number>;
    } catch {
      return {};
    }
  }
  return v;
}

function rowCountsEqual(
  a: Record<string, number> | string | null | undefined,
  b: Record<string, number> | string | null | undefined,
): boolean {
  const aa = asRowCounts(a);
  const bb = asRowCounts(b);
  const keys = new Set([...Object.keys(aa), ...Object.keys(bb)]);
  for (const k of keys) {
    if ((Number(aa[k]) || 0) !== (Number(bb[k]) || 0)) return false;
  }
  return true;
}

function diskInSync(
  meta: DiskDatasetMeta,
  db: DbDatasetRow | undefined,
  chunkAggs: Map<string, ChunkAgg>,
  diskRoot: string,
): boolean {
  if (!db) return false;
  if (db.symbol !== meta.symbol) return false;
  if ((db.time_start ?? 0) !== (meta.timeStart ?? 0)) return false;
  if ((db.time_end ?? 0) !== (meta.timeEnd ?? 0)) return false;
  if (!rowCountsEqual(db.row_counts, meta.rowCounts)) return false;

  const timeframes =
    Array.isArray(meta.timeframes) && meta.timeframes.length > 0
      ? meta.timeframes
      : [meta.baseTimeframe || '1m'];
  const dbTfs = Array.isArray(db.timeframes) ? db.timeframes : [];
  if (timeframes.length !== dbTfs.length) return false;
  for (const tf of timeframes) {
    if (!dbTfs.includes(tf)) return false;
    const seriesPath = path.join(diskRoot, 'datasets', meta.id, tf, 'series.json');
    const series = readJson<DiskSeriesMeta>(seriesPath);
    if (!series || !Array.isArray(series.chunkIds)) return false;
    const agg = chunkAggs.get(`${meta.id}|${tf}`);
    if (!agg) return false;
    // Chunk count is enough — avoids re-import when bar_count packing differs.
    if (agg.chunks !== series.chunkIds.length) return false;
  }
  return true;
}

async function importDataset(ownerId: string, meta: DiskDatasetMeta): Promise<void> {
  const visibility =
    meta.visibility === 'private' || meta.visibility === 'shared'
      ? meta.visibility
      : 'public_read';
  const timeframes =
    Array.isArray(meta.timeframes) && meta.timeframes.length > 0
      ? meta.timeframes
      : [meta.baseTimeframe || '1m'];

  await query(
    `INSERT INTO datasets (
       id, owner_user_id, symbol, base_timeframe, name, visibility, status,
       time_start, time_end, row_counts, timeframes
     ) VALUES (
       $1, $2, $3, $4, $5, $6, 'ready', $7, $8, $9::jsonb, $10
     )
     ON CONFLICT (id) DO UPDATE SET
       symbol = EXCLUDED.symbol,
       base_timeframe = EXCLUDED.base_timeframe,
       name = EXCLUDED.name,
       visibility = EXCLUDED.visibility,
       status = 'ready',
       time_start = EXCLUDED.time_start,
       time_end = EXCLUDED.time_end,
       row_counts = EXCLUDED.row_counts,
       timeframes = EXCLUDED.timeframes,
       updated_at = now()`,
    [
      meta.id,
      ownerId,
      meta.symbol,
      meta.baseTimeframe || '1m',
      meta.name || meta.id,
      visibility,
      meta.timeStart ?? 0,
      meta.timeEnd ?? 0,
      JSON.stringify(meta.rowCounts ?? {}),
      timeframes,
    ],
  );

  for (const tf of timeframes) {
    const seriesPath = path.join(
      config.diskRoot,
      'datasets',
      meta.id,
      tf,
      'series.json',
    );
    const series = readJson<DiskSeriesMeta>(seriesPath);
    if (!series || !Array.isArray(series.chunkIds)) {
      console.warn(`[import] skip series ${meta.id}/${tf} — no series.json`);
      continue;
    }

    let ok = 0;
    for (let i = 0; i < series.chunkIds.length; i++) {
      const chunkId = series.chunkIds[i]!;
      const m = /\/(\d+)$/.exec(chunkId);
      const chunkIndex = m ? Number(m[1]) : i;
      const key = `datasets/${meta.id}/${tf}/${chunkIndex}.bin`;
      const full = path.join(config.diskRoot, key);
      let byteSize = 0;
      try {
        byteSize = fs.statSync(full).size;
      } catch {
        // missing binary — still register meta so catalog lists; GET will 404
      }
      const barCount = byteSize > 0 ? Math.floor(byteSize / 28) : 0;

      await query(
        `INSERT INTO dataset_chunks (
           dataset_id, timeframe, chunk_index, chunk_id, object_key,
           logical_start, bar_count, time_start, time_end, byte_size
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (dataset_id, timeframe, chunk_index) DO UPDATE SET
           chunk_id = EXCLUDED.chunk_id,
           object_key = EXCLUDED.object_key,
           logical_start = EXCLUDED.logical_start,
           bar_count = EXCLUDED.bar_count,
           time_start = EXCLUDED.time_start,
           time_end = EXCLUDED.time_end,
           byte_size = EXCLUDED.byte_size`,
        [
          meta.id,
          tf,
          chunkIndex,
          chunkId,
          key,
          series.chunkStarts[i] ?? chunkIndex * 5000,
          barCount,
          series.chunkTimeStarts[i] ?? 0,
          series.chunkTimeEnds[i] ?? 0,
          byteSize,
        ],
      );
      ok += 1;
    }
    console.log(`[import] ${meta.id}/${tf} · ${ok} chunks`);
  }
}

async function main(): Promise<void> {
  const force = forceRefresh();
  const ownerId = await ensureAdmin();
  const root = path.join(config.diskRoot, 'datasets');
  if (!fs.existsSync(root)) {
    console.log(`[import] no datasets dir at ${root}`);
    await pool.end();
    return;
  }
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const snap = force
    ? { datasets: new Map<string, DbDatasetRow>(), chunks: new Map<string, ChunkAgg>() }
    : await loadDbSnapshot();

  let imported = 0;
  let skipped = 0;
  for (const id of dirs) {
    const meta = readJson<DiskDatasetMeta>(path.join(root, id, 'dataset.json'));
    if (!meta?.symbol) {
      console.warn(`[import] skip ${id} — invalid dataset.json`);
      continue;
    }
    meta.id = id;
    if (
      !force &&
      diskInSync(meta, snap.datasets.get(id), snap.chunks, config.diskRoot)
    ) {
      skipped += 1;
      continue;
    }
    await importDataset(ownerId, meta);
    imported += 1;
  }

  if (force) {
    console.log(`[import] done · ${imported} datasets (force refresh) from ${root}`);
  } else {
    console.log(
      `[import] done · ${imported} updated, ${skipped} unchanged · ${dirs.length} on disk`,
    );
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error('[import] failed', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
