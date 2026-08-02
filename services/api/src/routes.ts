import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  attachUser,
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  requireUser,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
} from './auth.js';
import { canReadDataset } from './access.js';
import { config } from './config.js';
import { query, readyCheck } from './db.js';
import { enqueueDbJob, redisReady } from './jobs.js';
import { assertBacktestQuota, assertDatasetQuota } from './quotas.js';
import { getObject, publicFileUrl } from './storage.js';

function datasetDto(row: {
  id: string;
  symbol: string;
  base_timeframe: string;
  name: string;
  visibility: string;
  status: string;
  time_start: string | number;
  time_end: string | number;
  row_counts: Record<string, number>;
  timeframes: string[];
  owner_user_id?: string;
}) {
  return {
    id: row.id,
    symbol: row.symbol,
    baseTimeframe: row.base_timeframe,
    name: row.name,
    visibility: row.visibility,
    status: row.status,
    timeStart: Number(row.time_start),
    timeEnd: Number(row.time_end),
    rowCounts: row.row_counts ?? {},
    timeframes: row.timeframes ?? [],
    ownerUserId: row.owner_user_id,
  };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    await attachUser(req);
  });

  app.get('/api/v1/health', async () => ({
    ok: true,
    service: 'talaria-api',
    mode: 'saas-level-2',
    storage: config.storageDriver,
  }));

  app.get('/api/v1/ready', async (_req, reply) => {
    const pg = await readyCheck();
    const redis = await redisReady();
    const ok = pg.postgres;
    reply.code(ok ? 200 : 503);
    return {
      ok,
      postgres: pg.postgres,
      redis,
      storage: config.storageDriver,
      error: pg.error,
    };
  });

  app.post('/api/v1/auth/register', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(128),
        displayName: z.string().min(1).max(80).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid registration payload' });
    }
    const email = body.data.email.toLowerCase();
    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
    if ((existing.rowCount ?? 0) > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }
    const passwordHash = await hashPassword(body.data.password);
    const { rows } = await query<{
      id: string;
      email: string;
      display_name: string;
      role: 'user' | 'admin';
    }>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, role`,
      [email, passwordHash, body.data.displayName ?? email.split('@')[0]],
    );
    const user = rows[0]!;
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return {
      user: toPublicUser({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      }),
    };
  });

  app.post('/api/v1/auth/login', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid login payload' });
    }
    const { rows } = await query<{
      id: string;
      email: string;
      display_name: string;
      role: 'user' | 'admin';
      password_hash: string;
    }>(`SELECT * FROM users WHERE email = $1`, [body.data.email.toLowerCase()]);
    const row = rows[0];
    if (!row || !(await verifyPassword(body.data.password, row.password_hash))) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const token = await createSession(row.id);
    setSessionCookie(reply, token);
    return {
      user: toPublicUser({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
      }),
    };
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const token = req.cookies[config.cookieName];
    await destroySession(token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/v1/auth/me', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    return { user: toPublicUser(user) };
  });

  app.get('/api/v1/datasets', async (req, reply) => {
    const user = req.user;
    const { rows } = await query(
      `SELECT d.*
       FROM datasets d
       WHERE d.visibility = 'public_read'
          OR ($1::uuid IS NOT NULL AND (
            d.owner_user_id = $1
            OR EXISTS (
              SELECT 1 FROM dataset_acl a
              WHERE a.dataset_id = d.id AND a.user_id = $1
            )
          ))
       ORDER BY d.updated_at DESC
       LIMIT 200`,
      [user?.id ?? null],
    );
    return { datasets: rows.map((r) => datasetDto(r as never)) };
  });

  app.get('/api/v1/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canReadDataset(req.user, id))) {
      return reply.code(404).send({ error: 'Dataset not found' });
    }
    const { rows } = await query(`SELECT * FROM datasets WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'Dataset not found' });
    return { dataset: datasetDto(row as never) };
  });

  app.get('/api/v1/datasets/:id/chunks', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canReadDataset(req.user, id))) {
      return reply.code(404).send({ error: 'Dataset not found' });
    }
    const q = req.query as { tf?: string; fromTime?: string; toTime?: string };
    const tf = q.tf ?? '1m';
    const fromTime = q.fromTime != null ? Number(q.fromTime) : null;
    const toTime = q.toTime != null ? Number(q.toTime) : null;

    const { rows } = await query<{
      chunk_index: number;
      chunk_id: string;
      object_key: string;
      logical_start: number;
      bar_count: number;
      time_start: string;
      time_end: string;
      byte_size: number;
    }>(
      `SELECT * FROM dataset_chunks
       WHERE dataset_id = $1 AND timeframe = $2
       ORDER BY chunk_index ASC`,
      [id, tf],
    );

    const filtered = rows.filter((c) => {
      const ts = Number(c.time_start);
      const te = Number(c.time_end);
      if (fromTime != null && te < fromTime) return false;
      if (toTime != null && ts > toTime) return false;
      return true;
    });

    if (filtered.length === 0) {
      return reply.code(404).send({ error: `No chunks for tf=${tf}` });
    }

    const chunkIds = filtered.map((c) => c.chunk_id);
    const chunkStarts = filtered.map((c) => c.logical_start);
    const chunkTimeStarts = filtered.map((c) => Number(c.time_start));
    const chunkTimeEnds = filtered.map((c) => Number(c.time_end));
    const rowCount = filtered.reduce((n, c) => n + c.bar_count, 0);

    return {
      datasetId: id,
      timeframe: tf,
      seriesMeta: {
        rowCount,
        timeStart: chunkTimeStarts[0] ?? 0,
        timeEnd: chunkTimeEnds[chunkTimeEnds.length - 1] ?? 0,
        chunkIds,
        chunkStarts,
        chunkTimeStarts,
        chunkTimeEnds,
        chunks: filtered.map((c) => ({
          chunkIndex: c.chunk_index,
          chunkId: c.chunk_id,
          url: publicFileUrl(id, tf, c.chunk_index),
          logicalStart: c.logical_start,
          timeStart: Number(c.time_start),
          timeEnd: Number(c.time_end),
          bytes: c.byte_size,
        })),
      },
    };
  });

  app.get('/api/v1/files/datasets/:id/:tf/:file', async (req, reply) => {
    const { id, tf, file } = req.params as { id: string; tf: string; file: string };
    if (!(await canReadDataset(req.user, id))) {
      return reply.code(404).send({ error: 'Not found' });
    }
    const m = /^(\d+)\.bin$/.exec(file);
    if (!m) return reply.code(400).send({ error: 'Invalid chunk file' });
    const chunkIndex = Number(m[1]);
    const { rows } = await query<{ object_key: string }>(
      `SELECT object_key FROM dataset_chunks
       WHERE dataset_id = $1 AND timeframe = $2 AND chunk_index = $3`,
      [id, tf, chunkIndex],
    );
    const key = rows[0]?.object_key;
    if (!key) return reply.code(404).send({ error: 'Chunk not found' });
    const buf = await getObject(key);
    if (!buf) return reply.code(404).send({ error: 'Chunk missing in storage' });
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Cache-Control', 'private, max-age=300')
      .send(buf);
  });

  app.post('/api/v1/jobs/ingest', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    try {
      await assertDatasetQuota(user.id);
    } catch (err) {
      return reply.code(429).send({ error: err instanceof Error ? err.message : 'Quota' });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const jobId = await enqueueDbJob('ingest', user.id, body);
    const { rows } = await query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
    return { job: mapJob(rows[0] as never) };
  });

  app.post('/api/v1/jobs/backtest', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    try {
      await assertBacktestQuota(user.id);
    } catch (err) {
      return reply.code(429).send({ error: err instanceof Error ? err.message : 'Quota' });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const jobId = await enqueueDbJob('backtest', user.id, body);
    const { rows } = await query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
    return { job: mapJob(rows[0] as never) };
  });

  app.get('/api/v1/jobs/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { rows } = await query(`SELECT * FROM jobs WHERE id = $1`, [id]);
    const job = rows[0] as { user_id: string } | undefined;
    if (!job || (job.user_id !== user.id && user.role !== 'admin')) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return { job: mapJob(job as never) };
  });

  app.post('/api/v1/datasets/:id/ingest', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    if (!(await canReadDataset(user, id))) {
      return reply.code(404).send({ error: 'Dataset not found' });
    }
    const jobId = await enqueueDbJob('ingest', user.id, { datasetId: id });
    const { rows } = await query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
    return { job: mapJob(rows[0] as never) };
  });
}

function mapJob(row: {
  id: string;
  type: string;
  status: string;
  user_id: string;
  payload: Record<string, unknown>;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
}) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    userId: row.user_id,
    payload: row.payload ?? {},
    error: row.error,
    result: row.result,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
