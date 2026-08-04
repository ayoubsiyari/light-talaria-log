/**
 * Vite middleware: /api/v1/* — Phase 11 / Step 13 scaffolding.
 * Dev auth stub + disk chunk store + in-memory job queue.
 * Does not replace Dukascopy or require Postgres/Docker.
 */
import type { Plugin, Connect } from 'vite';
import {
  chunksForTimeRange,
  ensureChunkStore,
  getDiskDataset,
  listDiskDatasets,
  readChunkBinary,
  writeDiskChunkBinary,
  writeDiskDatasetMeta,
  writeDiskSeriesMeta,
  type DiskDatasetMeta,
  type DiskSeriesMeta,
} from './chunkStore';
import { enqueueJob, getJob } from './jobQueue';

const DEV_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@localhost',
  displayName: 'Dev User',
} as const;

function sendJson(
  res: Connect.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendBinary(
  res: Connect.ServerResponse,
  status: number,
  buf: Buffer,
  contentType = 'application/octet-stream',
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(buf.byteLength));
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.end(buf);
}

function readJsonBody(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function readBinaryBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Dev stub: always authenticated as DEV_USER; optional X-Talaria-User-Id override (display only). */
function resolveUser(req: Connect.IncomingMessage): typeof DEV_USER {
  const header = req.headers['x-talaria-user-id'];
  const id = typeof header === 'string' && header.trim() ? header.trim() : DEV_USER.id;
  if (id === DEV_USER.id) return DEV_USER;
  return {
    id,
    email: `${id.slice(0, 8)}@localhost`,
    displayName: `Dev User (${id.slice(0, 8)})`,
  };
}

function parseUrl(req: Connect.IncomingMessage): { pathname: string; searchParams: URLSearchParams } {
  const raw = req.url ?? '/';
  const u = new URL(raw, 'http://localhost');
  return { pathname: u.pathname, searchParams: u.searchParams };
}

function requireAuth(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  pathname: string,
): typeof DEV_USER | null {
  // Public: health + login/register stubs
  if (
    pathname === '/api/v1/health' ||
    pathname === '/api/v1/auth/login' ||
    pathname === '/api/v1/auth/register'
  ) {
    return DEV_USER;
  }
  // Files and everything else: stub-auth (always ok in dev)
  return resolveUser(req);
}

async function handleApi(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
): Promise<void> {
  const { pathname, searchParams } = parseUrl(req);
  const method = (req.method ?? 'GET').toUpperCase();
  const user = requireAuth(req, res, pathname);
  if (!user) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  // GET /api/v1/health
  if (method === 'GET' && pathname === '/api/v1/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'talaria-log-api-stub',
      auth: 'dev-stub',
      storage: 'local-disk',
      chunkRoot: 'data/chunks',
    });
    return;
  }

  // Auth stubs
  if (method === 'GET' && pathname === '/api/v1/auth/me') {
    sendJson(res, 200, { user });
    return;
  }
  if (method === 'POST' && pathname === '/api/v1/auth/login') {
    sendJson(res, 200, { user, token: 'dev-stub-token' });
    return;
  }
  if (method === 'POST' && pathname === '/api/v1/auth/register') {
    sendJson(res, 201, { user, token: 'dev-stub-token' });
    return;
  }
  if (method === 'POST' && pathname === '/api/v1/auth/logout') {
    sendJson(res, 200, { ok: true });
    return;
  }

  // GET /api/v1/datasets
  if (method === 'GET' && pathname === '/api/v1/datasets') {
    const datasets = listDiskDatasets().map((d) => ({
      id: d.id,
      symbol: d.symbol,
      baseTimeframe: d.baseTimeframe,
      name: d.name,
      visibility: d.visibility,
      status: d.status,
      timeStart: d.timeStart,
      timeEnd: d.timeEnd,
      rowCounts: d.rowCounts,
      timeframes: d.timeframes,
    }));
    sendJson(res, 200, { datasets });
    return;
  }

  // GET /api/v1/datasets/:id
  const datasetMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)$/);
  if (method === 'GET' && datasetMatch) {
    const id = decodeURIComponent(datasetMatch[1]!);
    const d = getDiskDataset(id);
    if (!d) {
      sendJson(res, 404, { error: 'Dataset not found' });
      return;
    }
    sendJson(res, 200, { dataset: d });
    return;
  }

  // GET /api/v1/datasets/:id/chunks?tf=&fromTime=&toTime=
  const chunksMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/chunks$/);
  if (method === 'GET' && chunksMatch) {
    const id = decodeURIComponent(chunksMatch[1]!);
    const tf = searchParams.get('tf') ?? searchParams.get('timeframe') ?? '';
    if (!tf) {
      sendJson(res, 400, { error: 'Query param tf is required' });
      return;
    }
    const fromRaw = searchParams.get('fromTime') ?? searchParams.get('from');
    const toRaw = searchParams.get('toTime') ?? searchParams.get('to');
    const fromTime = fromRaw != null && fromRaw !== '' ? Number(fromRaw) : undefined;
    const toTime = toRaw != null && toRaw !== '' ? Number(toRaw) : undefined;
    if (fromTime != null && !Number.isFinite(fromTime)) {
      sendJson(res, 400, { error: 'fromTime must be a number (unix seconds)' });
      return;
    }
    if (toTime != null && !Number.isFinite(toTime)) {
      sendJson(res, 400, { error: 'toTime must be a number (unix seconds)' });
      return;
    }

    const result = chunksForTimeRange(id, tf, fromTime, toTime);
    if (!result) {
      sendJson(res, 404, { error: 'Dataset or timeframe not found' });
      return;
    }
    // Match SaaS API paging — keep warm-cache / large series from one huge JSON.
    const maxChunks = 24;
    const page = result.chunks.slice(0, maxChunks);
    const truncated = result.chunks.length > maxChunks;
    const lastEnd =
      page.length > 0 ? page[page.length - 1]!.timeEnd : result.series.timeEnd;
    sendJson(res, 200, {
      datasetId: id,
      timeframe: tf,
      truncated,
      nextFromTime: truncated ? lastEnd + 1 : null,
      maxChunksPerQuery: maxChunks,
      seriesMeta: {
        rowCount: page.reduce((n, c) => n + Math.max(0, Math.floor(c.bytes / 28)), 0),
        timeStart: page[0]?.timeStart ?? result.series.timeStart,
        timeEnd: lastEnd,
        chunkIds: page.map((c) => c.chunkId),
        chunkStarts: page.map((c) => c.logicalStart),
        chunkTimeStarts: page.map((c) => c.timeStart),
        chunkTimeEnds: page.map((c) => c.timeEnd),
        chunks: page,
      },
    });
    return;
  }

  // PUT /api/v1/datasets/:id — publish / overwrite dataset meta (shared server store)
  if (method === 'PUT' && datasetMatch) {
    const id = decodeURIComponent(datasetMatch[1]!);
    let body: Partial<DiskDatasetMeta>;
    try {
      body = (await readJsonBody(req)) as Partial<DiskDatasetMeta>;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    if (!body.symbol || !body.baseTimeframe || !body.name) {
      sendJson(res, 400, { error: 'symbol, baseTimeframe, and name are required' });
      return;
    }
    const meta: DiskDatasetMeta = {
      id,
      symbol: String(body.symbol),
      baseTimeframe: String(body.baseTimeframe),
      name: String(body.name),
      visibility:
        body.visibility === 'private' || body.visibility === 'shared'
          ? body.visibility
          : 'public_read',
      status: 'ready',
      timeStart: Number(body.timeStart) || 0,
      timeEnd: Number(body.timeEnd) || 0,
      rowCounts: (body.rowCounts as Record<string, number>) ?? {},
      timeframes: Array.isArray(body.timeframes)
        ? body.timeframes.map(String)
        : [String(body.baseTimeframe)],
      ownerUserId: user.id,
    };
    writeDiskDatasetMeta(meta);
    sendJson(res, 200, { dataset: meta });
    return;
  }

  // PUT /api/v1/datasets/:id/series/:tf — publish series meta for one TF
  const seriesPutMatch = pathname.match(
    /^\/api\/v1\/datasets\/([^/]+)\/series\/([^/]+)$/,
  );
  if (method === 'PUT' && seriesPutMatch) {
    const id = decodeURIComponent(seriesPutMatch[1]!);
    const tf = decodeURIComponent(seriesPutMatch[2]!);
    let body: Partial<DiskSeriesMeta>;
    try {
      body = (await readJsonBody(req)) as Partial<DiskSeriesMeta>;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    if (!Array.isArray(body.chunkIds) || body.chunkIds.length === 0) {
      sendJson(res, 400, { error: 'series meta with chunkIds is required' });
      return;
    }
    const series: DiskSeriesMeta = {
      datasetId: id,
      timeframe: tf,
      rowCount: Number(body.rowCount) || 0,
      timeStart: Number(body.timeStart) || 0,
      timeEnd: Number(body.timeEnd) || 0,
      chunkIds: body.chunkIds.map(String),
      chunkStarts: (body.chunkStarts as number[]) ?? [],
      chunkTimeStarts: (body.chunkTimeStarts as number[]) ?? [],
      chunkTimeEnds: (body.chunkTimeEnds as number[]) ?? [],
    };
    writeDiskSeriesMeta(series);
    sendJson(res, 200, { series });
    return;
  }

  // PUT /api/v1/datasets/:id/chunks/:tf/:n — raw packed OHLCV binary
  const chunkPutMatch = pathname.match(
    /^\/api\/v1\/datasets\/([^/]+)\/chunks\/([^/]+)\/(\d+)$/,
  );
  if (method === 'PUT' && chunkPutMatch) {
    const id = decodeURIComponent(chunkPutMatch[1]!);
    const tf = decodeURIComponent(chunkPutMatch[2]!);
    const chunkIndex = Number(chunkPutMatch[3]);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
      sendJson(res, 400, { error: 'Invalid chunk index' });
      return;
    }
    const buf = await readBinaryBody(req);
    if (buf.byteLength === 0) {
      sendJson(res, 400, { error: 'Empty chunk body' });
      return;
    }
    writeDiskChunkBinary(id, tf, chunkIndex, buf);
    sendJson(res, 200, {
      ok: true,
      datasetId: id,
      timeframe: tf,
      chunkIndex,
      bytes: buf.byteLength,
    });
    return;
  }

  // POST /api/v1/datasets/:id/ingest — enqueue ingest stub
  const ingestMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/ingest$/);
  if (method === 'POST' && ingestMatch) {
    const id = decodeURIComponent(ingestMatch[1]!);
    let body: Record<string, unknown> = {};
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const job = enqueueJob('ingest', user.id, { datasetId: id, ...body });
    sendJson(res, 202, { job });
    return;
  }

  // Binary files: GET /api/v1/files/datasets/:id/:tf/:n.bin
  const fileMatch = pathname.match(
    /^\/api\/v1\/files\/datasets\/([^/]+)\/([^/]+)\/(\d+)\.bin$/,
  );
  if (method === 'GET' && fileMatch) {
    const datasetId = decodeURIComponent(fileMatch[1]!);
    const tf = decodeURIComponent(fileMatch[2]!);
    const chunkIndex = Number(fileMatch[3]);
    const buf = readChunkBinary(datasetId, tf, chunkIndex);
    if (!buf) {
      sendJson(res, 404, { error: 'Chunk not found' });
      return;
    }
    sendBinary(res, 200, buf);
    return;
  }

  // POST /api/v1/jobs/ingest
  if (method === 'POST' && pathname === '/api/v1/jobs/ingest') {
    let body: Record<string, unknown> = {};
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const job = enqueueJob('ingest', user.id, body);
    sendJson(res, 202, { job });
    return;
  }

  // POST /api/v1/jobs/backtest — placeholder for server backtest
  if (method === 'POST' && pathname === '/api/v1/jobs/backtest') {
    let body: Record<string, unknown> = {};
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const job = enqueueJob('backtest', user.id, body);
    sendJson(res, 202, { job });
    return;
  }

  // GET /api/v1/jobs/:id
  const jobMatch = pathname.match(/^\/api\/v1\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobMatch) {
    const job = getJob(decodeURIComponent(jobMatch[1]!));
    if (!job) {
      sendJson(res, 404, { error: 'Job not found' });
      return;
    }
    sendJson(res, 200, { job });
    return;
  }

  sendJson(res, 404, { error: 'Not found', path: pathname });
}

function attachTalariaApi(middlewares: Connect.Server): void {
  ensureChunkStore();
  middlewares.use((req, res, next) => {
    const pathOnly = req.url?.split('?')[0] ?? '';
    if (!pathOnly.startsWith('/api/v1')) {
      next();
      return;
    }
    void handleApi(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Internal error';
      sendJson(res, 500, { error: message });
    });
  });
}

/** Vite middleware: /api/v1/* Phase 11 API stub (dev + preview). */
export function talariaApiPlugin(): Plugin {
  return {
    name: 'talaria-log-api',
    configureServer(server) {
      attachTalariaApi(server.middlewares);
    },
    configurePreviewServer(server) {
      attachTalariaApi(server.middlewares);
    },
  };
}
