/**
 * One-shot: register existing disk stub datasets (data/chunks/datasets/*) into Postgres.
 * Does NOT rewrite .bin files — object_key stays datasets/{id}/{tf}/{n}.bin.
 * Uses series.json + file size (no full binary read) so large packs stay fast.
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

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function ensureAdmin(): Promise<string> {
  const email = config.seed.adminEmail.toLowerCase();
  const existing = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  throw new Error('Admin user missing — run seed first');
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
    .map((d) => d.name);

  let imported = 0;
  for (const id of dirs) {
    const meta = readJson<DiskDatasetMeta>(path.join(root, id, 'dataset.json'));
    if (!meta?.symbol) {
      console.warn(`[import] skip ${id} — invalid dataset.json`);
      continue;
    }
    meta.id = id;
    await importDataset(ownerId, meta);
    imported += 1;
  }
  console.log(`[import] done · ${imported} datasets from ${root}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[import] failed', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
