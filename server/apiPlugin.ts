/**
 * Vite middleware: /api/v1/* — Phase 11 / Step 13 scaffolding.
 * Cookie-session auth + disk chunk store + in-memory job queue.
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
import {
  adminCountByRole,
  adminUserCount,
  clearSessionCookie,
  createSession,
  destroySession,
  listPublicUsers,
  loginUser,
  originAllowed,
  parseCookies,
  COOKIE_NAME,
  registerUser,
  setSessionCookie,
  setUserRole,
  toPublicUser,
  userFromRequest,
  type PublicDevUser,
} from './devAuth';
import { enqueueJob, getJob, listJobs } from './jobQueue';
import * as userSync from './userSyncStore';

function requireAdminUser(
  user: PublicDevUser,
  res: Connect.ServerResponse,
): boolean {
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Admin required' });
    return false;
  }
  return true;
}

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

function parseUrl(req: Connect.IncomingMessage): { pathname: string; searchParams: URLSearchParams } {
  const raw = req.url ?? '/';
  const u = new URL(raw, 'http://localhost');
  return { pathname: u.pathname, searchParams: u.searchParams };
}

async function handleApi(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
): Promise<void> {
  const { pathname, searchParams } = parseUrl(req);
  const method = (req.method ?? 'GET').toUpperCase();

  // GET /api/v1/health
  if (method === 'GET' && pathname === '/api/v1/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'talaria-log-api-stub',
      auth: 'cookie-session',
      storage: 'local-disk',
      chunkRoot: 'data/chunks',
    });
    return;
  }

  // Auth — register / login set HttpOnly cookie; me requires session
  if (method === 'POST' && pathname === '/api/v1/auth/register') {
    if (!originAllowed(req)) {
      sendJson(res, 403, { error: 'Forbidden origin' });
      return;
    }
    const body = (await readJsonBody(req)) as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    const result = registerUser({
      email: typeof body.email === 'string' ? body.email : '',
      password: typeof body.password === 'string' ? body.password : '',
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
    });
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    const token = createSession(result.user.id);
    setSessionCookie(res, token);
    sendJson(res, 201, { user: toPublicUser(result.user) });
    return;
  }

  if (method === 'POST' && pathname === '/api/v1/auth/login') {
    if (!originAllowed(req)) {
      sendJson(res, 403, { error: 'Forbidden origin' });
      return;
    }
    const body = (await readJsonBody(req)) as { email?: string; password?: string };
    const result = loginUser(
      typeof body.email === 'string' ? body.email : '',
      typeof body.password === 'string' ? body.password : '',
    );
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    const token = createSession(result.user.id);
    setSessionCookie(res, token);
    sendJson(res, 200, { user: toPublicUser(result.user) });
    return;
  }

  if (method === 'POST' && pathname === '/api/v1/auth/logout') {
    const token = parseCookies(req)[COOKIE_NAME];
    destroySession(token);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/api/v1/auth/me') {
    const me = userFromRequest(req);
    if (!me) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    sendJson(res, 200, { user: toPublicUser(me) });
    return;
  }

  const authed = userFromRequest(req);
  if (!authed) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }
  const user: PublicDevUser = toPublicUser(authed);

  // --- Admin control plane (server-enforced) ---
  if (method === 'GET' && pathname === '/api/v1/admin/overview') {
    if (!requireAdminUser(user, res)) return;
    const datasets = listDiskDatasets();
    const roles = adminCountByRole();
    const jobs = listJobs();
    sendJson(res, 200, {
      overview: {
        usersTotal: adminUserCount(),
        admins: roles.admins,
        traders: roles.users,
        datasetsTotal: datasets.length,
        datasetsReady: datasets.filter((d) => d.status === 'ready').length,
        jobsTotal: jobs.length,
        jobsFailed: jobs.filter((j) => j.status === 'failed').length,
        jobsRunning: jobs.filter(
          (j) => j.status === 'queued' || j.status === 'running',
        ).length,
        storage: 'local-disk',
        service: 'talaria-log-api-stub',
      },
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/v1/admin/users') {
    if (!requireAdminUser(user, res)) return;
    sendJson(res, 200, { users: listPublicUsers() });
    return;
  }

  const adminUserMatch = pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)$/);
  if (method === 'PATCH' && adminUserMatch) {
    if (!requireAdminUser(user, res)) return;
    if (!originAllowed(req)) {
      sendJson(res, 403, { error: 'Forbidden origin' });
      return;
    }
    const id = decodeURIComponent(adminUserMatch[1]!);
    const body = (await readJsonBody(req)) as { role?: string };
    if (body.role !== 'user' && body.role !== 'admin') {
      sendJson(res, 400, { error: 'role must be user or admin' });
      return;
    }
    const result = setUserRole(id, body.role);
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    sendJson(res, 200, { user: toPublicUser(result.user) });
    return;
  }

  if (method === 'GET' && pathname === '/api/v1/admin/jobs') {
    if (!requireAdminUser(user, res)) return;
    sendJson(res, 200, { jobs: listJobs().slice(0, 100) });
    return;
  }

  // --- User cloud sync (sessions / drawings / journal) ---
  if (method === 'GET' && pathname === '/api/v1/sessions') {
    sendJson(res, 200, { sessions: userSync.listSessions(user.id) });
    return;
  }
  if (method === 'POST' && pathname === '/api/v1/sessions') {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    if (!body.name || !body.timeframe || !Array.isArray(body.legs)) {
      sendJson(res, 400, { error: 'Invalid session payload' });
      return;
    }
    const session = userSync.upsertSession(user.id, {
      id: typeof body.id === 'string' ? body.id : undefined,
      name: String(body.name),
      pair: String(body.pair ?? ''),
      timeframe: String(body.timeframe),
      startDate: String(body.startDate ?? ''),
      endDate: String(body.endDate ?? ''),
      datasetId: String(body.datasetId ?? ''),
      legs: body.legs as Array<{ pair: string; datasetId: string }>,
      createdAt: typeof body.createdAt === 'number' ? body.createdAt : undefined,
      cursorTime: typeof body.cursorTime === 'number' ? body.cursorTime : undefined,
      span: typeof body.span === 'number' ? body.span : undefined,
      startingBalance:
        typeof body.startingBalance === 'number' ? body.startingBalance : undefined,
      strategyId: typeof body.strategyId === 'string' ? body.strategyId : undefined,
      strategyName:
        typeof body.strategyName === 'string' ? body.strategyName : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
    });
    sendJson(res, 200, { session });
    return;
  }

  const sessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]!);
    if (method === 'GET') {
      const session = userSync.getSession(user.id, id);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { session });
      return;
    }
    if (method === 'PATCH') {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const session = userSync.patchSession(user.id, id, body as never);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { session });
      return;
    }
    if (method === 'DELETE') {
      if (!userSync.deleteSession(user.id, id)) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  const drawingsMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/drawings$/);
  if (drawingsMatch) {
    const id = decodeURIComponent(drawingsMatch[1]!);
    if (method === 'GET') {
      const datasetId = searchParams.get('datasetId') ?? '';
      if (!datasetId) {
        sendJson(res, 400, { error: 'datasetId query required' });
        return;
      }
      if (!userSync.getSession(user.id, id)) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, {
        drawings: userSync.getDrawings(user.id, id, datasetId),
      });
      return;
    }
    if (method === 'PUT') {
      const body = (await readJsonBody(req)) as {
        datasetId?: string;
        drawings?: unknown[];
      };
      if (!body.datasetId || !Array.isArray(body.drawings)) {
        sendJson(res, 400, { error: 'Invalid drawings payload' });
        return;
      }
      try {
        userSync.putDrawings(user.id, id, body.datasetId, body.drawings);
        sendJson(res, 200, { ok: true, count: body.drawings.length });
      } catch {
        sendJson(res, 404, { error: 'Session not found' });
      }
      return;
    }
  }

  const orderJournalMatch = pathname.match(
    /^\/api\/v1\/sessions\/([^/]+)\/order-journal$/,
  );
  if (orderJournalMatch) {
    const id = decodeURIComponent(orderJournalMatch[1]!);
    if (method === 'GET') {
      if (!userSync.getSession(user.id, id)) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, {
        orderJournal: userSync.getOrderJournal(user.id, id),
      });
      return;
    }
    if (method === 'PUT') {
      const body = await readJsonBody(req);
      if (!userSync.putOrderJournal(user.id, id, body)) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (method === 'GET' && pathname === '/api/v1/journal') {
    sendJson(res, 200, { entries: userSync.listJournal(user.id) });
    return;
  }
  if (method === 'POST' && pathname === '/api/v1/journal') {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    if (
      typeof body.sessionId !== 'string' ||
      typeof body.sessionName !== 'string' ||
      body.result == null
    ) {
      sendJson(res, 400, { error: 'Invalid journal payload' });
      return;
    }
    const entry = userSync.upsertJournal(user.id, {
      id: typeof body.id === 'string' ? body.id : undefined,
      sessionId: body.sessionId,
      sessionName: body.sessionName,
      result: body.result,
      savedAt: typeof body.savedAt === 'number' ? body.savedAt : undefined,
    });
    sendJson(res, 200, { entry });
    return;
  }
  const journalMatch = pathname.match(/^\/api\/v1\/journal\/([^/]+)$/);
  if (method === 'DELETE' && journalMatch) {
    const id = decodeURIComponent(journalMatch[1]!);
    if (!userSync.deleteJournal(user.id, id)) {
      sendJson(res, 404, { error: 'Journal run not found' });
      return;
    }
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

  // PUT /api/v1/datasets/:id — publish / overwrite (admin only)
  if (method === 'PUT' && datasetMatch) {
    if (!requireAdminUser(user, res)) return;
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

  // PUT /api/v1/datasets/:id/series/:tf — publish series meta (admin only)
  const seriesPutMatch = pathname.match(
    /^\/api\/v1\/datasets\/([^/]+)\/series\/([^/]+)$/,
  );
  if (method === 'PUT' && seriesPutMatch) {
    if (!requireAdminUser(user, res)) return;
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

  // PUT /api/v1/datasets/:id/chunks/:tf/:n — raw packed OHLCV binary (admin only)
  const chunkPutMatch = pathname.match(
    /^\/api\/v1\/datasets\/([^/]+)\/chunks\/([^/]+)\/(\d+)$/,
  );
  if (method === 'PUT' && chunkPutMatch) {
    if (!requireAdminUser(user, res)) return;
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

  // POST /api/v1/datasets/:id/ingest — enqueue ingest stub (admin only)
  const ingestMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/ingest$/);
  if (method === 'POST' && ingestMatch) {
    if (!requireAdminUser(user, res)) return;
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

/**
 * Vite middleware: /api/v1/* disk stub (dev + preview).
 * Skipped when TALARIA_API_PROXY is set — real API handles /api/v1 instead.
 */
export function talariaApiPlugin(): Plugin {
  const proxy = process.env.TALARIA_API_PROXY || '';
  if (proxy) {
    return {
      name: 'talaria-log-api',
      configureServer() {
        console.log(`[api] stub disabled — proxying /api/v1 → ${proxy}`);
      },
      configurePreviewServer() {
        console.log(`[api] stub disabled — proxying /api/v1 → ${proxy}`);
      },
    };
  }
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
