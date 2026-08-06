/**
 * Authenticated CRUD for chart sessions, drawings, journal runs, order journals.
 * All rows scoped by user_id — never leak across accounts.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { query, withClient } from './db.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

const legSchema = z.object({
  pair: z.string().min(1).max(32),
  datasetId: z.string().min(1).max(128),
});

const sessionBodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  pair: z.string().min(1).max(32),
  timeframe: z.string().min(1).max(8),
  startDate: z.string().min(4).max(32),
  endDate: z.string().min(4).max(32),
  datasetId: z.string().min(1).max(128),
  legs: z.array(legSchema).min(1).max(20),
  createdAt: z.number().optional(),
  cursorTime: z.number().optional(),
  span: z.number().optional(),
  startingBalance: z.number().optional(),
  strategyId: z.string().max(80).optional(),
  strategyName: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

const drawingSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().min(1).max(64),
  points: z.array(z.record(z.unknown())).max(64),
  style: z.record(z.unknown()).optional(),
  text: z.string().max(2000).optional(),
  name: z.string().max(200).optional(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  visibleOnTfs: z.unknown().optional(),
  meta: z.record(z.unknown()).optional(),
});

type SessionRow = {
  id: string;
  user_id: string;
  name: string;
  timeframe: string;
  start_date: string | Date | null;
  end_date: string | Date | null;
  legs: unknown;
  primary_dataset_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function dateStr(v: string | Date | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function metaOf(row: SessionRow): Record<string, unknown> {
  return row.meta && typeof row.meta === 'object' ? row.meta : {};
}

type ManualTradeRow = {
  side: 'buy' | 'sell';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  /** Full CollectedTrade (or thin fallback) for trades.meta. */
  meta: Record<string, unknown>;
};

/** Project POSITION_OPENED/CLOSED journal events → trades table rows. */
function closedTradesFromOrderJournal(journal: {
  entries: Array<Record<string, unknown>>;
}): ManualTradeRow[] {
  const opens = new Map<
    string,
    { side: 'buy' | 'sell'; entryPrice: number; entryTime: number }
  >();
  const out: ManualTradeRow[] = [];

  for (const e of journal.entries) {
    const type = typeof e.type === 'string' ? e.type : '';
    const payload =
      e.payload && typeof e.payload === 'object'
        ? (e.payload as Record<string, unknown>)
        : {};
    const cursorTime =
      typeof e.cursorTime === 'number' && Number.isFinite(e.cursorTime)
        ? e.cursorTime
        : 0;

    if (type === 'POSITION_OPENED') {
      const id = typeof payload.positionId === 'string' ? payload.positionId : '';
      const sideRaw = payload.side;
      const side =
        sideRaw === 'SELL' || sideRaw === 'sell' ? 'sell' : 'buy';
      const entryPrice = Number(payload.entryPrice);
      if (!id || !Number.isFinite(entryPrice)) continue;
      opens.set(id, { side, entryPrice, entryTime: cursorTime });
      continue;
    }

    if (type !== 'POSITION_CLOSED') continue;
    const id = typeof payload.positionId === 'string' ? payload.positionId : '';
    const fillPrice =
      Number(payload.fillPrice) || Number(payload.fillsPrice);
    const net = Number(payload.netPnLAccount);
    if (!id || !Number.isFinite(fillPrice)) continue;
    const open = opens.get(id);
    opens.delete(id);
    const sidePayload = payload.side;
    const side: 'buy' | 'sell' =
      sidePayload === 'SELL' || sidePayload === 'sell'
        ? 'sell'
        : sidePayload === 'BUY' || sidePayload === 'buy'
          ? 'buy'
          : (open?.side ?? 'buy');
    const entryPrice = Number.isFinite(Number(payload.entryPrice))
      ? Number(payload.entryPrice)
      : (open?.entryPrice ?? fillPrice);
    const entryTime = Number.isFinite(Number(payload.openedAt))
      ? Number(payload.openedAt)
      : (open?.entryTime ?? cursorTime);
    const pnl = Number.isFinite(net) ? net : 0;
    const pnlPct =
      entryPrice !== 0
        ? ((fillPrice - entryPrice) / entryPrice) *
          100 *
          (side === 'buy' ? 1 : -1)
        : 0;
    const collected =
      payload.collected && typeof payload.collected === 'object'
        ? (payload.collected as Record<string, unknown>)
        : {
            tradeId: id,
            symbol: typeof payload.symbol === 'string' ? payload.symbol : null,
            type: side,
            orderType: payload.orderType ?? null,
            status: 'closed',
            openPrice: entryPrice,
            closePrice: fillPrice,
            stopLoss: payload.stopLoss ?? payload.initialStopPrice ?? null,
            takeProfit: payload.takeProfit ?? payload.initialTargetPrice ?? null,
            initial_sl: payload.initialStopPrice ?? null,
            quantity: payload.size ?? null,
            netPnL: pnl,
            rMultiple: payload.rMultiple ?? null,
            closeType: payload.exitReason ?? 'MANUAL',
            mfe: payload.mfePrice ?? null,
            mae: payload.maePrice ?? null,
            openTime: entryTime,
            closeTime: cursorTime,
          };
    out.push({
      side,
      entryTime,
      exitTime: cursorTime,
      entryPrice,
      exitPrice: fillPrice,
      pnl,
      pnlPct,
      meta: { collected },
    });
  }
  return out;
}

function sessionDto(row: SessionRow) {
  const legs = Array.isArray(row.legs) ? row.legs : [];
  const primary = legs[0] as { pair?: string; datasetId?: string } | undefined;
  const meta = metaOf(row);
  return {
    id: row.id,
    name: row.name,
    pair: primary?.pair ?? meta.pair ?? '',
    timeframe: row.timeframe,
    startDate: dateStr(row.start_date),
    endDate: dateStr(row.end_date),
    datasetId: row.primary_dataset_id ?? primary?.datasetId ?? '',
    legs,
    createdAt:
      typeof meta.createdAt === 'number'
        ? meta.createdAt
        : new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    ...(typeof meta.cursorTime === 'number' ? { cursorTime: meta.cursorTime } : {}),
    ...(typeof meta.span === 'number' ? { span: meta.span } : {}),
    ...(typeof meta.startingBalance === 'number'
      ? { startingBalance: meta.startingBalance }
      : {}),
    ...(typeof meta.strategyId === 'string' ? { strategyId: meta.strategyId } : {}),
    ...(typeof meta.strategyName === 'string'
      ? { strategyName: meta.strategyName }
      : {}),
    ...(typeof meta.description === 'string' ? { description: meta.description } : {}),
  };
}

function buildMeta(body: z.infer<typeof sessionBodySchema>): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    pair: body.pair,
    createdAt: body.createdAt ?? Date.now(),
  };
  if (body.cursorTime != null) meta.cursorTime = body.cursorTime;
  if (body.span != null) meta.span = body.span;
  if (body.startingBalance != null) meta.startingBalance = body.startingBalance;
  if (body.strategyId) meta.strategyId = body.strategyId;
  if (body.strategyName) meta.strategyName = body.strategyName;
  if (body.description) meta.description = body.description;
  return meta;
}

async function ownedSession(
  userId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  if (!isUuid(sessionId)) return null;
  const { rows } = await query<SessionRow>(
    `SELECT * FROM chart_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  return rows[0] ?? null;
}

export async function registerUserSyncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/sessions', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { rows } = await query<SessionRow>(
      `SELECT * FROM chart_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
      [user.id],
    );
    return { sessions: rows.map(sessionDto) };
  });

  app.post('/api/v1/sessions', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const parsed = sessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid session payload' });
    }
    const body = parsed.data;
    const id = body.id ?? undefined;
    const meta = buildMeta(body);
    const { rows } = await query<SessionRow>(
      `INSERT INTO chart_sessions (
         id, user_id, name, timeframe, start_date, end_date,
         legs, primary_dataset_id, meta
       ) VALUES (
         COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5::date, $6::date,
         $7::jsonb, $8, $9::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         timeframe = EXCLUDED.timeframe,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         legs = EXCLUDED.legs,
         primary_dataset_id = EXCLUDED.primary_dataset_id,
         meta = chart_sessions.meta || EXCLUDED.meta,
         updated_at = now()
       WHERE chart_sessions.user_id = $2
       RETURNING *`,
      [
        id ?? null,
        user.id,
        body.name,
        body.timeframe,
        body.startDate,
        body.endDate,
        JSON.stringify(body.legs),
        body.datasetId || null,
        JSON.stringify(meta),
      ],
    );
    const row = rows[0];
    if (!row) {
      return reply.code(403).send({ error: 'Session not owned by user' });
    }
    return { session: sessionDto(row) };
  });

  app.get('/api/v1/sessions/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const row = await ownedSession(user.id, id);
    if (!row) return reply.code(404).send({ error: 'Session not found' });
    return { session: sessionDto(row) };
  });

  app.patch('/api/v1/sessions/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const existing = await ownedSession(user.id, id);
    if (!existing) return reply.code(404).send({ error: 'Session not found' });

    const patch = z
      .object({
        name: z.string().min(1).max(200).optional(),
        cursorTime: z.number().optional(),
        span: z.number().optional(),
        startingBalance: z.number().optional(),
        strategyId: z.string().max(80).nullable().optional(),
        strategyName: z.string().max(200).nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
        timeframe: z.string().min(1).max(8).optional(),
        startDate: z.string().min(4).max(32).optional(),
        endDate: z.string().min(4).max(32).optional(),
        legs: z.array(legSchema).min(1).max(20).optional(),
        datasetId: z.string().min(1).max(128).optional(),
      })
      .safeParse(req.body);
    if (!patch.success) {
      return reply.code(400).send({ error: 'Invalid session patch' });
    }
    const p = patch.data;
    const meta = { ...metaOf(existing) };
    if (p.cursorTime != null) meta.cursorTime = p.cursorTime;
    if (p.span != null) meta.span = p.span;
    if (p.startingBalance != null) meta.startingBalance = p.startingBalance;
    if (p.strategyId !== undefined) {
      if (p.strategyId) meta.strategyId = p.strategyId;
      else delete meta.strategyId;
    }
    if (p.strategyName !== undefined) {
      if (p.strategyName) meta.strategyName = p.strategyName;
      else delete meta.strategyName;
    }
    if (p.description !== undefined) {
      if (p.description) meta.description = p.description;
      else delete meta.description;
    }

    const { rows } = await query<SessionRow>(
      `UPDATE chart_sessions SET
         name = COALESCE($3, name),
         timeframe = COALESCE($4, timeframe),
         start_date = COALESCE($5::date, start_date),
         end_date = COALESCE($6::date, end_date),
         legs = COALESCE($7::jsonb, legs),
         primary_dataset_id = COALESCE($8, primary_dataset_id),
         meta = $9::jsonb,
         updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        user.id,
        p.name ?? null,
        p.timeframe ?? null,
        p.startDate ?? null,
        p.endDate ?? null,
        p.legs ? JSON.stringify(p.legs) : null,
        p.datasetId ?? null,
        JSON.stringify(meta),
      ],
    );
    return { session: sessionDto(rows[0]!) };
  });

  app.delete('/api/v1/sessions/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { rowCount } = await query(
      `DELETE FROM chart_sessions WHERE id = $1 AND user_id = $2`,
      [id, user.id],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Session not found' });
    return { ok: true };
  });

  app.get('/api/v1/sessions/:id/drawings', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const datasetId = String((req.query as { datasetId?: string }).datasetId ?? '');
    if (!datasetId) {
      return reply.code(400).send({ error: 'datasetId query required' });
    }
    const session = await ownedSession(user.id, id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    const { rows } = await query<{ id: string; payload: Record<string, unknown> }>(
      `SELECT id, payload FROM drawings
       WHERE session_id = $1 AND user_id = $2 AND dataset_id = $3
       ORDER BY updated_at ASC`,
      [id, user.id, datasetId],
    );
    const drawings = rows.map((r) => {
      const payload =
        r.payload && typeof r.payload === 'object' ? { ...r.payload } : {};
      return { ...payload, id: r.id };
    });
    return { drawings };
  });

  app.put('/api/v1/sessions/:id/drawings', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        datasetId: z.string().min(1).max(128),
        drawings: z.array(drawingSchema).max(500),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid drawings payload' });
    }
    const session = await ownedSession(user.id, id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(
          `DELETE FROM drawings WHERE session_id = $1 AND user_id = $2 AND dataset_id = $3`,
          [id, user.id, body.data.datasetId],
        );
        for (const d of body.data.drawings) {
          const { id: drawingId, ...rest } = d;
          const rowId = isUuid(drawingId) ? drawingId : null;
          await client.query(
            `INSERT INTO drawings (id, session_id, dataset_id, user_id, payload, updated_at)
             VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5::jsonb, now())`,
            [
              rowId,
              id,
              body.data.datasetId,
              user.id,
              JSON.stringify({ ...rest, id: drawingId }),
            ],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
    return { ok: true, count: body.data.drawings.length };
  });

  app.put('/api/v1/sessions/:id/order-journal', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const session = await ownedSession(user.id, id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    const body = z
      .object({
        sessionId: z.string().uuid(),
        entries: z.array(z.record(z.unknown())).max(50000),
        /** Command log — required to rebuild open book after sync/reload. */
        commands: z.array(z.unknown()).max(50000).optional().default([]),
        bootstrap: z.record(z.unknown()),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid order journal payload' });
    }
    const orderJournal = {
      sessionId: body.data.sessionId,
      entries: body.data.entries,
      commands: body.data.commands,
      bootstrap: body.data.bootstrap,
    };
    const meta = { ...metaOf(session), orderJournal };
    const closed = closedTradesFromOrderJournal(orderJournal);

    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(
          `UPDATE chart_sessions SET meta = $3::jsonb, updated_at = now()
           WHERE id = $1 AND user_id = $2`,
          [id, user.id, JSON.stringify(meta)],
        );
        // Replace Place Order closed trades for this session (source=manual).
        await client.query(
          `DELETE FROM trades
           WHERE user_id = $1 AND session_id = $2
             AND source = 'manual' AND backtest_run_id IS NULL`,
          [user.id, id],
        );
        const datasetId =
          session.primary_dataset_id && isUuid(session.primary_dataset_id)
            ? session.primary_dataset_id
            : null;
        for (const t of closed.slice(0, 5000)) {
          await client.query(
            `INSERT INTO trades (
               id, user_id, session_id, dataset_id, backtest_run_id,
               side, entry_time, exit_time, entry_price, exit_price, pnl, pnl_pct, source, meta
             ) VALUES (
               gen_random_uuid(), $1, $2, $3, NULL,
               $4, $5, $6, $7, $8, $9, $10, 'manual', $11::jsonb
             )`,
            [
              user.id,
              id,
              datasetId,
              t.side,
              t.entryTime,
              t.exitTime,
              t.entryPrice,
              t.exitPrice,
              t.pnl,
              t.pnlPct,
              JSON.stringify(t.meta),
            ],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
    return { ok: true, tradeCount: closed.length };
  });

  app.get('/api/v1/sessions/:id/order-journal', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const session = await ownedSession(user.id, id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    const oj = metaOf(session).orderJournal ?? null;
    return { orderJournal: oj };
  });

  app.get('/api/v1/journal', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { rows } = await query<{
      id: string;
      session_id: string | null;
      session_name: string;
      result: unknown;
      created_at: string | Date;
    }>(
      `SELECT id, session_id, session_name, result, created_at
       FROM backtest_runs
       WHERE user_id = $1 AND result IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 100`,
      [user.id],
    );
    return {
      entries: rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id ?? '',
        sessionName: r.session_name || r.session_id || '',
        result: r.result,
        savedAt: new Date(r.created_at).getTime(),
      })),
    };
  });

  app.post('/api/v1/journal', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        id: z.string().uuid().optional(),
        sessionId: z.string().uuid(),
        sessionName: z.string().min(1).max(200),
        result: z.record(z.unknown()),
        savedAt: z.number().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid journal payload' });
    }
    const session = await ownedSession(user.id, body.data.sessionId);
    // Allow orphan journal if session was deleted locally but still syncing — soft require
    const runId = body.data.id ?? null;
    const result = body.data.result as {
      trades?: Array<Record<string, unknown>>;
      equity?: unknown;
      params?: unknown;
      totalPnl?: number;
      finalEquity?: number;
      barCount?: number;
      truncated?: boolean;
    };
    const datasetId =
      typeof (result as { datasetId?: string }).datasetId === 'string'
        ? (result as { datasetId: string }).datasetId
        : session?.primary_dataset_id ?? null;

    const entry = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const { rows } = await client.query<{
          id: string;
          session_id: string | null;
          session_name: string;
          result: unknown;
          created_at: string | Date;
        }>(
          `INSERT INTO backtest_runs (
             id, user_id, session_id, dataset_id, params, bar_count, truncated,
             equity, total_pnl, final_equity, result, session_name, created_at
           ) VALUES (
             COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5::jsonb, $6, $7,
             $8::jsonb, $9, $10, $11::jsonb, $12,
             COALESCE(to_timestamp($13 / 1000.0), now())
           )
           ON CONFLICT (id) DO UPDATE SET
             result = EXCLUDED.result,
             session_name = EXCLUDED.session_name,
             params = EXCLUDED.params,
             equity = EXCLUDED.equity,
             total_pnl = EXCLUDED.total_pnl,
             final_equity = EXCLUDED.final_equity,
             bar_count = EXCLUDED.bar_count,
             truncated = EXCLUDED.truncated
           WHERE backtest_runs.user_id = $2
           RETURNING id, session_id, session_name, result, created_at`,
          [
            runId,
            user.id,
            session ? body.data.sessionId : null,
            datasetId,
            JSON.stringify(result.params ?? {}),
            typeof result.barCount === 'number' ? result.barCount : 0,
            result.truncated === true,
            JSON.stringify(result.equity ?? []),
            typeof result.totalPnl === 'number' ? result.totalPnl : 0,
            typeof result.finalEquity === 'number' ? result.finalEquity : 1,
            JSON.stringify(body.data.result),
            body.data.sessionName,
            body.data.savedAt ?? Date.now(),
          ],
        );
        const row = rows[0]!;
        await client.query(`DELETE FROM trades WHERE backtest_run_id = $1`, [row.id]);
        const trades = Array.isArray(result.trades) ? result.trades : [];
        for (const t of trades.slice(0, 5000)) {
          const side = t.side === 'sell' || t.side === 'SELL' ? 'sell' : 'buy';
          await client.query(
            `INSERT INTO trades (
               id, user_id, session_id, dataset_id, backtest_run_id,
               side, entry_time, exit_time, entry_price, exit_price, pnl, pnl_pct, source
             ) VALUES (
               COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5,
               $6, $7, $8, $9, $10, $11, $12, 'backtest'
             )
             ON CONFLICT (id) DO NOTHING`,
            [
              typeof t.id === 'string' && isUuid(t.id) ? t.id : null,
              user.id,
              session ? body.data.sessionId : null,
              datasetId,
              row.id,
              side,
              Number(t.entryTime) || 0,
              Number(t.exitTime) || 0,
              Number(t.entryPrice) || 0,
              Number(t.exitPrice) || 0,
              Number(t.pnl) || 0,
              Number(t.pnlPct) || 0,
            ],
          );
        }
        await client.query('COMMIT');
        return row;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });

    return {
      entry: {
        id: entry.id,
        sessionId: entry.session_id ?? body.data.sessionId,
        sessionName: entry.session_name,
        result: entry.result,
        savedAt: new Date(entry.created_at).getTime(),
      },
    };
  });

  app.delete('/api/v1/journal/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { rowCount } = await query(
      `DELETE FROM backtest_runs WHERE id = $1 AND user_id = $2`,
      [id, user.id],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Journal run not found' });
    return { ok: true };
  });
}
