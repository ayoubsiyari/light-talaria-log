import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { assertProductionConfig, config } from './config.js';
import { pool } from './db.js';
import { registerSecurityHeaders } from './httpSecurity.js';
import { startJobWorker } from './jobs.js';
import { registerRoutes } from './routes.js';
import { ensureStorage } from './storage.js';

async function main(): Promise<void> {
  assertProductionConfig();
  await ensureStorage();

  const app = Fastify({
    logger: true,
    trustProxy: true,
    /** Packed OHLCV chunks (~140 KB / 5k bars); headroom for publish. */
    bodyLimit: Math.min(5 * 1024 * 1024, Math.max(config.limits.maxChunkBytes * 2, 1024 * 1024)),
  });

  await registerSecurityHeaders(app);

  const corsAllow = new Set(config.corsOrigins);
  await app.register(cors, {
    origin(origin, cb) {
      // Same-origin / non-browser tools (no Origin header)
      if (!origin) {
        cb(null, true);
        return;
      }
      cb(null, corsAllow.has(origin));
    },
    credentials: true,
  });
  await app.register(cookie, {
    secret: config.sessionSecret,
  });

  // Prefer Redis for multi-replica rate limits; fall back to memory if down.
  let redis: Redis | undefined;
  try {
    const probe = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1500,
    });
    await probe.connect();
    await probe.ping();
    redis = probe;
    app.log.info('Rate limit store: Redis');
  } catch {
    app.log.warn('Rate limit store: memory (Redis unavailable)');
  }

  await app.register(rateLimit, {
    global: true,
    max: config.limits.globalRpm,
    timeWindow: '1 minute',
    redis,
    nameSpace: 'talaria-rl-',
    allowList: (req) => {
      const url = req.url.split('?')[0] ?? '';
      return url === '/api/v1/health' || url === '/api/v1/ready';
    },
  });

  // Client publish sends raw ArrayBuffer with this content type.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  await registerRoutes(app);
  startJobWorker();

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `Talaria API Level-2 on ${config.host}:${config.port} (storage=${config.storageDriver}` +
      `${config.cdnPublicBase ? `, cdn=${config.cdnPublicBase}` : ''})`,
  );
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
