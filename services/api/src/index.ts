import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { config } from './config.js';
import { pool } from './db.js';
import { startJobWorker } from './jobs.js';
import { registerRoutes } from './routes.js';
import { ensureStorage } from './storage.js';

async function main(): Promise<void> {
  await ensureStorage();

  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });
  await app.register(cookie, {
    secret: config.sessionSecret,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  await registerRoutes(app);
  startJobWorker();

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `Talaria API Level-2 on ${config.host}:${config.port} (storage=${config.storageDriver})`,
  );
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
