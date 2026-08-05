import { createHash } from 'node:crypto';
import { hashPassword } from './auth.js';
import { config } from './config.js';
import { pool, query } from './db.js';
import { buildDemoBars, CHUNK_SIZE, packBars } from './pack.js';
import { ensureStorage, objectKey, putObject } from './storage.js';

const DEMO_ID = '11111111-1111-4111-8111-111111111111';

async function ensureAdmin(): Promise<string> {
  const email = config.seed.adminEmail.toLowerCase();
  const passwordHash = await hashPassword(config.seed.adminPassword);
  const existing = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) {
    // Always refresh password + role from SEED_ADMIN_* so deploys can recover admin access.
    await query(
      `UPDATE users
       SET password_hash = $1, role = 'admin', display_name = 'Admin', updated_at = now()
       WHERE id = $2`,
      [passwordHash, existing.rows[0].id],
    );
    console.log(`[seed] admin refreshed ${email} (SEED_ADMIN_PASSWORD)`);
    return existing.rows[0].id;
  }

  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, 'Admin', 'admin')
     RETURNING id`,
    [email, passwordHash],
  );
  console.log(`[seed] admin user ${email} / (password from SEED_ADMIN_PASSWORD)`);
  return rows[0]!.id;
}

async function seedDemo(ownerId: string): Promise<void> {
  await ensureStorage();
  const bars = buildDemoBars(1000);
  const tf = '1m';

  await query(
    `INSERT INTO datasets (
       id, owner_user_id, symbol, base_timeframe, name, visibility, status,
       time_start, time_end, row_counts, timeframes
     ) VALUES (
       $1, $2, 'EURUSD', '1m', 'Demo EURUSD 1m (SaaS)', 'public_read', 'ready',
       $3, $4, $5::jsonb, ARRAY['1m']
     )
     ON CONFLICT (id) DO UPDATE SET
       status = 'ready',
       time_start = EXCLUDED.time_start,
       time_end = EXCLUDED.time_end,
       row_counts = EXCLUDED.row_counts,
       updated_at = now()`,
    [
      DEMO_ID,
      ownerId,
      bars.times[0],
      bars.times[bars.times.length - 1],
      JSON.stringify({ '1m': bars.times.length }),
    ],
  );

  await query(`DELETE FROM dataset_chunks WHERE dataset_id = $1`, [DEMO_ID]);

  let logical = 0;
  let chunkIndex = 0;
  for (let i = 0; i < bars.times.length; i += CHUNK_SIZE) {
    const end = Math.min(bars.times.length, i + CHUNK_SIZE);
    const slice = {
      times: bars.times.slice(i, end),
      opens: bars.opens.slice(i, end),
      highs: bars.highs.slice(i, end),
      lows: bars.lows.slice(i, end),
      closes: bars.closes.slice(i, end),
      volumes: bars.volumes.slice(i, end),
    };
    const buf = packBars(
      slice.times,
      slice.opens,
      slice.highs,
      slice.lows,
      slice.closes,
      slice.volumes,
    );
    const key = objectKey(DEMO_ID, tf, chunkIndex);
    await putObject(key, buf);
    const chunkId = `${DEMO_ID}/${tf}/${chunkIndex}`;
    const checksum = createHash('sha256').update(buf).digest('hex');
    await query(
      `INSERT INTO dataset_chunks (
         dataset_id, timeframe, chunk_index, chunk_id, object_key,
         logical_start, bar_count, time_start, time_end, byte_size, checksum
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        DEMO_ID,
        tf,
        chunkIndex,
        chunkId,
        key,
        logical,
        end - i,
        slice.times[0],
        slice.times[slice.times.length - 1],
        buf.byteLength,
        checksum,
      ],
    );
    logical += end - i;
    chunkIndex++;
  }
  console.log(`[seed] demo dataset ${DEMO_ID} · ${bars.times.length} bars · ${chunkIndex} chunks`);
}

async function main(): Promise<void> {
  const adminId = await ensureAdmin();
  if (config.seed.demo) {
    await seedDemo(adminId);
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error('[seed] failed', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
