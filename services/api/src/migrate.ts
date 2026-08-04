import { migrate, pool } from './db.js';

async function main(): Promise<void> {
  console.log('[migrate] applying sql/*.sql…');
  await migrate();
  console.log('[migrate] done');
  await pool.end();
}

main().catch(async (err) => {
  console.error('[migrate] failed', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
