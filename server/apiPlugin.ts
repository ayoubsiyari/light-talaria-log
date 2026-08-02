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
    sendJson(res, 200, {
      datasetId: id,
      timeframe: tf,
      seriesMeta: {
        rowCount: result.series.rowCount,
        timeStart: result.series.timeStart,
        timeEnd: result.series.timeEnd,
        chunkIds: result.series.chunkIds,
        chunkStarts: result.series.chunkStarts,
        chunkTimeStarts: result.series.chunkTimeStarts,
        chunkTimeEnds: result.series.chunkTimeEnds,
        chunks: result.chunks,
      },
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
