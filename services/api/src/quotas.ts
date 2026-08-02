import { config } from './config.js';
import { query } from './db.js';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function countUserDatasets(userId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM datasets WHERE owner_user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function assertDatasetQuota(userId: string): Promise<void> {
  const n = await countUserDatasets(userId);
  if (n >= config.quotas.datasetsPerUser) {
    throw new Error(`Dataset quota exceeded (${config.quotas.datasetsPerUser})`);
  }
}

export async function addImportBytes(userId: string, bytes: number): Promise<void> {
  const day = todayUtc();
  await query(
    `INSERT INTO usage_counters (user_id, day, import_bytes, backtest_count)
     VALUES ($1, $2::date, $3, 0)
     ON CONFLICT (user_id, day) DO UPDATE
     SET import_bytes = usage_counters.import_bytes + EXCLUDED.import_bytes`,
    [userId, day, bytes],
  );
  const { rows } = await query<{ import_bytes: string }>(
    `SELECT import_bytes::text FROM usage_counters WHERE user_id = $1 AND day = $2::date`,
    [userId, day],
  );
  const used = Number(rows[0]?.import_bytes ?? 0);
  if (used > config.quotas.importBytesDay) {
    throw new Error('Daily import byte quota exceeded');
  }
}

export async function assertBacktestQuota(userId: string): Promise<void> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM jobs
     WHERE user_id = $1 AND type = 'backtest'
       AND created_at > now() - interval '1 hour'`,
    [userId],
  );
  if (Number(rows[0]?.n ?? 0) >= config.quotas.backtestHour) {
    throw new Error(`Backtest quota exceeded (${config.quotas.backtestHour}/hour)`);
  }
}
