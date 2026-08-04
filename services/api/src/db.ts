import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Apply all `sql/*.sql` files in sorted order (idempotent migrations). */
export async function migrate(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const sqlDir = path.resolve(__dirname, '..', 'sql');
  const files = fs
    .readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
    await pool.query(sql);
  }
}

export async function readyCheck(): Promise<{ postgres: boolean; error?: string }> {
  try {
    await pool.query('SELECT 1');
    return { postgres: true };
  } catch (err) {
    return {
      postgres: false,
      error: err instanceof Error ? err.message : 'postgres unavailable',
    };
  }
}
