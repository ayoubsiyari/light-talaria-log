import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
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
import { createHash } from 'node:crypto';
import { canReadDataset, canWriteDataset, getDatasetVisibility } from './access.js';
import { applyChunkBinaryHeaders, applyMetaCacheHeaders } from './cacheHeaders.js';
import { config } from './config.js';
import { authEmailSchema } from './emailSchema.js';
import { query, readyCheck } from './db.js';
import { enqueueDbJob, redisReady } from './jobs.js';
import {
  addDownloadBytes,
  addImportBytes,
  assertBacktestQuota,
  assertDatasetQuota,
} from './quotas.js';
import { getObject, objectKey, publicFileUrl, putObject } from './storage.js';
import { registerUserSyncRoutes } from './userSyncRoutes.js';

const BYTES_PER_BAR = 28;
/** UUID or disk-stub slug (e.g. firstrate-eurusd-m1). */
const DATASET_ID_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[a-zA-Z0-9][a-zA-Z0-9._-]{0,127})$/i;
const TF_RE = /^[a-zA-Z0-9]{1,8}$/;

function isDatasetId(id: string): boolean {
  return DATASET_ID_RE.test(id);
}

function isTimeframe(tf: string): boolean {
  return TF_RE.test(tf);
}

function rpmLimit(max: number): RouteShorthandOptions {
  return {
    config: {
      rateLimit: { max, timeWindow: '1 minute' },
    },
  };
}

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

  await registerUserSyncRoutes(app);

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

  app.post('/api/v1/auth/register', rpmLimit(config.limits.authRpm), async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && !config.corsOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'Forbidden origin' });
    }
    const body = z
      .object({
        email: authEmailSchema,
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

  app.post('/api/v1/auth/login', rpmLimit(config.limits.authRpm), async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && !config.corsOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'Forbidden origin' });
    }
    const body = z
      .object({
        email: authEmailSchema,
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

  /**
   * PUT /api/v1/datasets/:id — publish / overwrite dataset meta.
   * Same contract as the Vite disk stub (`server/apiPlugin.ts`).
   */
  app.put('/api/v1/datasets/:id', rpmLimit(config.limits.publishRpm), async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    if (!isDatasetId(id)) {
      return reply.code(400).send({
        error: 'Invalid dataset id',
      });
    }
    const body = z
      .object({
        symbol: z.string().min(1),
        baseTimeframe: z.string().min(1),
        name: z.string().min(1),
        visibility: z.enum(['private', 'shared', 'public_read']).optional(),
        timeStart: z.number().optional(),
        timeEnd: z.number().optional(),
        rowCounts: z.record(z.string(), z.number()).optional(),
        timeframes: z.array(z.string()).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'symbol, baseTimeframe, and name are required',
      });
    }

    const existing = await query<{ id: string }>(
      `SELECT id FROM datasets WHERE id = $1`,
      [id],
    );
    const isNew = (existing.rowCount ?? 0) === 0;
    if (isNew) {
      try {
        await assertDatasetQuota(user.id);
      } catch (err) {
        return reply
          .code(429)
          .send({ error: err instanceof Error ? err.message : 'Quota' });
      }
    } else if (!(await canWriteDataset(user, id))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const visibility = body.data.visibility ?? 'public_read';
    const timeframes =
      body.data.timeframes && body.data.timeframes.length > 0
        ? body.data.timeframes
        : [body.data.baseTimeframe];
    const rowCounts = body.data.rowCounts ?? {};

    const { rows } = await query(
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
         updated_at = now()
       RETURNING *`,
      [
        id,
        user.id,
        body.data.symbol,
        body.data.baseTimeframe,
        body.data.name,
        visibility,
        body.data.timeStart ?? 0,
        body.data.timeEnd ?? 0,
        JSON.stringify(rowCounts),
        timeframes,
      ],
    );
    return { dataset: datasetDto(rows[0] as never) };
  });

  /**
   * PUT /api/v1/datasets/:id/series/:tf — upsert chunk meta for one timeframe.
   * Binaries should already be PUT; this attaches logical/time indexes.
   */
  app.put(
    '/api/v1/datasets/:id/series/:tf',
    rpmLimit(config.limits.publishRpm),
    async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id, tf } = req.params as { id: string; tf: string };
    if (!isDatasetId(id)) {
      return reply.code(400).send({ error: 'Invalid dataset id' });
    }
    if (!isTimeframe(tf)) {
      return reply.code(400).send({ error: 'Invalid timeframe' });
    }
    const exists = await query(`SELECT id FROM datasets WHERE id = $1`, [id]);
    if ((exists.rowCount ?? 0) === 0) {
      return reply.code(404).send({
        error: 'Dataset meta missing — PUT /datasets/:id first',
      });
    }
    if (!(await canWriteDataset(user, id))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = z
      .object({
        rowCount: z.number().optional(),
        timeStart: z.number().optional(),
        timeEnd: z.number().optional(),
        chunkIds: z.array(z.string()).min(1),
        chunkStarts: z.array(z.number()).optional(),
        chunkTimeStarts: z.array(z.number()).optional(),
        chunkTimeEnds: z.array(z.number()).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'series meta with chunkIds is required' });
    }

    const chunkIds = body.data.chunkIds;
    const chunkStarts = body.data.chunkStarts ?? [];
    const chunkTimeStarts = body.data.chunkTimeStarts ?? [];
    const chunkTimeEnds = body.data.chunkTimeEnds ?? [];

    for (let i = 0; i < chunkIds.length; i++) {
      const chunkId = chunkIds[i]!;
      const chunkIndex = (() => {
        const m = /\/(\d+)$/.exec(chunkId);
        return m ? Number(m[1]) : i;
      })();
      const key = objectKey(id, tf, chunkIndex);
      const logicalStart = chunkStarts[i] ?? i * 5000;
      const timeStart = chunkTimeStarts[i] ?? 0;
      const timeEnd = chunkTimeEnds[i] ?? 0;

      const existing = await query<{ byte_size: number; bar_count: number }>(
        `SELECT byte_size, bar_count FROM dataset_chunks
         WHERE dataset_id = $1 AND timeframe = $2 AND chunk_index = $3`,
        [id, tf, chunkIndex],
      );
      const byteSize = existing.rows[0]?.byte_size ?? 0;
      const barCount =
        existing.rows[0]?.bar_count ||
        (byteSize > 0 ? Math.floor(byteSize / BYTES_PER_BAR) : 0);

      await query(
        `INSERT INTO dataset_chunks (
           dataset_id, timeframe, chunk_index, chunk_id, object_key,
           logical_start, bar_count, time_start, time_end, byte_size
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (dataset_id, timeframe, chunk_index) DO UPDATE SET
           chunk_id = EXCLUDED.chunk_id,
           object_key = EXCLUDED.object_key,
           logical_start = EXCLUDED.logical_start,
           bar_count = CASE
             WHEN EXCLUDED.bar_count > 0 THEN EXCLUDED.bar_count
             ELSE dataset_chunks.bar_count
           END,
           time_start = EXCLUDED.time_start,
           time_end = EXCLUDED.time_end,
           byte_size = CASE
             WHEN EXCLUDED.byte_size > 0 THEN EXCLUDED.byte_size
             ELSE dataset_chunks.byte_size
           END`,
        [
          id,
          tf,
          chunkIndex,
          chunkId,
          key,
          logicalStart,
          barCount,
          timeStart,
          timeEnd,
          byteSize,
        ],
      );
    }

    // Drop stale chunk rows for this TF not in the published set.
    await query(
      `DELETE FROM dataset_chunks
       WHERE dataset_id = $1 AND timeframe = $2
         AND chunk_id <> ALL($3::text[])`,
      [id, tf, chunkIds],
    );

    // Keep dataset.timeframes / row_counts in sync for catalog listing.
    const rowCount =
      body.data.rowCount ??
      chunkIds.length; /* placeholder if omitted */
    await query(
      `UPDATE datasets SET
         timeframes = (
           SELECT ARRAY(
             SELECT DISTINCT unnest(timeframes || ARRAY[$2]::text[])
             ORDER BY 1
           )
         ),
         row_counts = jsonb_set(
           COALESCE(row_counts, '{}'::jsonb),
           ARRAY[$2],
           to_jsonb($3::int),
           true
         ),
         updated_at = now()
       WHERE id = $1`,
      [id, tf, Math.floor(Number(rowCount) || 0)],
    );

    return {
      series: {
        datasetId: id,
        timeframe: tf,
        rowCount: body.data.rowCount ?? 0,
        timeStart: body.data.timeStart ?? 0,
        timeEnd: body.data.timeEnd ?? 0,
        chunkIds,
        chunkStarts,
        chunkTimeStarts,
        chunkTimeEnds,
      },
    };
  },
  );

  /**
   * PUT /api/v1/datasets/:id/chunks/:tf/:n — raw packed OHLCV binary.
   */
  app.put(
    '/api/v1/datasets/:id/chunks/:tf/:n',
    rpmLimit(config.limits.publishRpm),
    async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id, tf, n } = req.params as { id: string; tf: string; n: string };
    if (!isDatasetId(id)) {
      return reply.code(400).send({ error: 'Invalid dataset id' });
    }
    if (!isTimeframe(tf)) {
      return reply.code(400).send({ error: 'Invalid timeframe' });
    }
    const chunkIndex = Number(n);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0 || chunkIndex > 1_000_000) {
      return reply.code(400).send({ error: 'Invalid chunk index' });
    }

    const exists = await query(`SELECT id FROM datasets WHERE id = $1`, [id]);
    if ((exists.rowCount ?? 0) === 0) {
      return reply.code(404).send({
        error: 'Dataset meta missing — PUT /datasets/:id first',
      });
    }
    if (!(await canWriteDataset(user, id))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = req.body;
    const buf = Buffer.isBuffer(body)
      ? body
      : body instanceof Uint8Array
        ? Buffer.from(body)
        : null;
    if (!buf || buf.byteLength === 0) {
      return reply.code(400).send({ error: 'Empty chunk body' });
    }
    if (buf.byteLength > config.limits.maxChunkBytes) {
      return reply.code(413).send({
        error: `Chunk too large (max ${config.limits.maxChunkBytes} bytes)`,
      });
    }
    if (buf.byteLength % BYTES_PER_BAR !== 0) {
      return reply.code(400).send({
        error: `Chunk size must be a multiple of ${BYTES_PER_BAR} bytes`,
      });
    }

    try {
      await addImportBytes(user.id, buf.byteLength);
    } catch (err) {
      return reply
        .code(429)
        .send({ error: err instanceof Error ? err.message : 'Quota' });
    }

    const key = objectKey(id, tf, chunkIndex);
    await putObject(key, buf);
    const barCount = Math.floor(buf.byteLength / BYTES_PER_BAR);
    const chunkId = `${id}/${tf}/${chunkIndex}`;
    const checksum = createHash('sha256').update(buf).digest('hex');

    await query(
      `INSERT INTO dataset_chunks (
         dataset_id, timeframe, chunk_index, chunk_id, object_key,
         logical_start, bar_count, time_start, time_end, byte_size, checksum
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9)
       ON CONFLICT (dataset_id, timeframe, chunk_index) DO UPDATE SET
         chunk_id = EXCLUDED.chunk_id,
         object_key = EXCLUDED.object_key,
         bar_count = EXCLUDED.bar_count,
         byte_size = EXCLUDED.byte_size,
         checksum = EXCLUDED.checksum`,
      [
        id,
        tf,
        chunkIndex,
        chunkId,
        key,
        chunkIndex * 5000,
        barCount,
        buf.byteLength,
        checksum,
      ],
    );

    return {
      ok: true,
      datasetId: id,
      timeframe: tf,
      chunkIndex,
      bytes: buf.byteLength,
    };
  },
  );

  app.get(
    '/api/v1/datasets/:id/chunks',
    rpmLimit(config.limits.chunkRpm),
    async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canReadDataset(req.user, id))) {
      return reply.code(404).send({ error: 'Dataset not found' });
    }
    const visibility = (await getDatasetVisibility(id)) ?? 'private';
    const q = req.query as { tf?: string; fromTime?: string; toTime?: string };
    const tf = q.tf ?? '1m';
    if (!isTimeframe(tf)) {
      return reply.code(400).send({ error: 'Invalid timeframe' });
    }
    const fromTime =
      q.fromTime != null && q.fromTime !== '' ? Number(q.fromTime) : null;
    const toTime = q.toTime != null && q.toTime !== '' ? Number(q.toTime) : null;
    if (fromTime != null && !Number.isFinite(fromTime)) {
      return reply.code(400).send({ error: 'Invalid fromTime' });
    }
    if (toTime != null && !Number.isFinite(toTime)) {
      return reply.code(400).send({ error: 'Invalid toTime' });
    }

    const maxChunks = config.limits.maxChunksPerQuery;

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
      `SELECT chunk_index, chunk_id, object_key, logical_start, bar_count,
              time_start, time_end, byte_size
       FROM dataset_chunks
       WHERE dataset_id = $1 AND timeframe = $2
         AND ($3::bigint IS NULL OR time_end >= $3)
         AND ($4::bigint IS NULL OR time_start <= $4)
       ORDER BY chunk_index ASC
       LIMIT $5`,
      [id, tf, fromTime, toTime, maxChunks],
    );

    if (rows.length === 0) {
      return reply.code(404).send({ error: `No chunks for tf=${tf} in window` });
    }

    applyMetaCacheHeaders(reply, visibility === 'public_read');

    const chunkIds = rows.map((c) => c.chunk_id);
    const chunkStarts = rows.map((c) => c.logical_start);
    const chunkTimeStarts = rows.map((c) => Number(c.time_start));
    const chunkTimeEnds = rows.map((c) => Number(c.time_end));
    const rowCount = rows.reduce((n, c) => n + c.bar_count, 0);
    const truncated = rows.length >= maxChunks;
    const lastEnd = chunkTimeEnds[chunkTimeEnds.length - 1] ?? 0;

    return {
      datasetId: id,
      timeframe: tf,
      truncated,
      /** Client warm-cache pages with fromTime = nextFromTime until truncated=false. */
      nextFromTime: truncated ? lastEnd + 1 : null,
      maxChunksPerQuery: maxChunks,
      seriesMeta: {
        rowCount,
        timeStart: chunkTimeStarts[0] ?? 0,
        timeEnd: lastEnd,
        chunkIds,
        chunkStarts,
        chunkTimeStarts,
        chunkTimeEnds,
        chunks: rows.map((c) => ({
          chunkIndex: c.chunk_index,
          chunkId: c.chunk_id,
          url: publicFileUrl(id, tf, c.chunk_index, visibility),
          logicalStart: c.logical_start,
          timeStart: Number(c.time_start),
          timeEnd: Number(c.time_end),
          bytes: c.byte_size,
        })),
      },
    };
  },
  );

  app.get(
    '/api/v1/files/datasets/:id/:tf/:file',
    rpmLimit(config.limits.chunkRpm),
    async (req, reply) => {
    const { id, tf, file } = req.params as { id: string; tf: string; file: string };
    if (!(await canReadDataset(req.user, id))) {
      return reply.code(404).send({ error: 'Not found' });
    }
    if (!isTimeframe(tf)) {
      return reply.code(400).send({ error: 'Invalid timeframe' });
    }
    const visibility = (await getDatasetVisibility(id)) ?? 'private';
    const m = /^(\d+)\.bin$/.exec(file);
    if (!m) return reply.code(400).send({ error: 'Invalid chunk file' });
    const chunkIndex = Number(m[1]);
    const { rows } = await query<{ object_key: string; checksum: string | null; byte_size: number }>(
      `SELECT object_key, checksum, byte_size FROM dataset_chunks
       WHERE dataset_id = $1 AND timeframe = $2 AND chunk_index = $3`,
      [id, tf, chunkIndex],
    );
    const row = rows[0];
    if (!row?.object_key) return reply.code(404).send({ error: 'Chunk not found' });

    if (row.checksum) {
      const inm = req.headers['if-none-match'];
      if (inm && inm.replace(/W\//, '') === `"${row.checksum}"`) {
        applyChunkBinaryHeaders(reply, {
          visibility,
          checksum: row.checksum,
          byteLength: row.byte_size,
        });
        return reply.code(304).send();
      }
    }

    const buf = await getObject(row.object_key);
    if (!buf) return reply.code(404).send({ error: 'Chunk missing in storage' });

    // Soft bandwidth quota for logged-in users (CDN public path skips this).
    if (req.user && visibility !== 'public_read') {
      try {
        await addDownloadBytes(req.user.id, buf.byteLength);
      } catch (err) {
        return reply
          .code(429)
          .send({ error: err instanceof Error ? err.message : 'Quota' });
      }
    }

    applyChunkBinaryHeaders(reply, {
      visibility,
      checksum: row.checksum,
      byteLength: buf.byteLength,
    });
    return reply.send(buf);
  },
  );

  app.post('/api/v1/jobs/ingest', rpmLimit(config.limits.jobsRpm), async (req, reply) => {
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

  app.post('/api/v1/jobs/backtest', rpmLimit(config.limits.jobsRpm), async (req, reply) => {
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
