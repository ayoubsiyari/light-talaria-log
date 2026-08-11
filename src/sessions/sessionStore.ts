import type {
  BacktestSession,
  CreateSessionInput,
  PairSymbol,
  SessionLeg,
} from '@/types/session';
import type { Timeframe } from '@/types/ui';
import { newId } from '@/utils/uuid';
import { readScopedOrLegacy, writeScoped } from '@/sync/storageScope';
import { parseStoredTimeframe } from '@/sessions/sessionTf';

const STORAGE_BASE = 'sessions.v1';
const LEGACY_KEY = 'fast-chart.sessions.v1';
const MAX_SESSIONS = 50;

export type PersistOpts = { skipCloud?: boolean };

export type SessionProgressPatch = {
  cursorTime?: number;
  span?: number;
  /** Last TopBar TF — restored on reload. */
  selectedTf?: Timeframe;
};

function cloudPushSession(session: BacktestSession): void {
  void import('@/sync/cloudSync').then((m) => m.pushSession(session));
}
function cloudPushProgress(id: string, patch: SessionProgressPatch): void {
  void import('@/sync/cloudSync').then((m) => m.pushSessionProgress(id, patch));
}
function cloudDeleteSession(id: string): void {
  void import('@/sync/cloudSync').then((m) => m.pushDeleteSession(id));
}

function normalizeLegs(raw: Partial<BacktestSession>): SessionLeg[] | null {
  if (Array.isArray(raw.legs) && raw.legs.length > 0) {
    const legs: SessionLeg[] = [];
    for (const leg of raw.legs) {
      if (!leg || typeof leg !== 'object') continue;
      if (!leg.pair || !leg.datasetId) continue;
      legs.push({ pair: leg.pair as PairSymbol, datasetId: String(leg.datasetId) });
    }
    if (legs.length > 0) return legs;
  }
  if (raw.pair && raw.datasetId) {
    return [{ pair: raw.pair as PairSymbol, datasetId: String(raw.datasetId) }];
  }
  if (raw.pair) {
    return [{ pair: raw.pair as PairSymbol, datasetId: '' }];
  }
  return null;
}

function normalizeSession(raw: unknown): BacktestSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<BacktestSession>;
  if (!s.id || !s.timeframe || !s.startDate || !s.endDate) return null;
  const legs = normalizeLegs(s);
  if (!legs) return null;
  const primary = legs[0]!;
  const cursorTime =
    typeof s.cursorTime === 'number' && Number.isFinite(s.cursorTime)
      ? s.cursorTime
      : undefined;
  const span =
    typeof s.span === 'number' && Number.isFinite(s.span) && s.span > 0
      ? s.span
      : undefined;
  const selectedTf = parseStoredTimeframe(s.selectedTf) ?? undefined;
  const startingBalance =
    typeof s.startingBalance === 'number' &&
    Number.isFinite(s.startingBalance) &&
    s.startingBalance > 0
      ? s.startingBalance
      : undefined;
  const strategyId =
    typeof s.strategyId === 'string' && s.strategyId.trim()
      ? s.strategyId.trim()
      : undefined;
  const strategyName =
    typeof s.strategyName === 'string' && s.strategyName.trim()
      ? s.strategyName.trim()
      : undefined;
  const description =
    typeof s.description === 'string' && s.description.trim()
      ? s.description.trim()
      : undefined;
  return {
    id: s.id,
    name: s.name ?? `${primary.pair} ${s.timeframe}`,
    pair: primary.pair,
    timeframe: (parseStoredTimeframe(s.timeframe) ?? s.timeframe) as Timeframe,
    startDate: s.startDate,
    endDate: s.endDate,
    datasetId: primary.datasetId,
    legs,
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
    ...(cursorTime !== undefined ? { cursorTime } : {}),
    ...(span !== undefined ? { span } : {}),
    ...(selectedTf !== undefined ? { selectedTf } : {}),
    ...(startingBalance !== undefined ? { startingBalance } : {}),
    ...(strategyId !== undefined ? { strategyId } : {}),
    ...(strategyName !== undefined ? { strategyName } : {}),
    ...(description !== undefined ? { description } : {}),
  };
}

function readAll(): BacktestSession[] {
  try {
    const raw = readScopedOrLegacy(STORAGE_BASE, [LEGACY_KEY]);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSession).filter((s): s is BacktestSession => s !== null);
  } catch {
    return [];
  }
}

function writeAll(sessions: BacktestSession[]): void {
  try {
    writeScoped(STORAGE_BASE, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch (err) {
    console.warn('[sessions] persist failed', err);
  }
}

/** Replace local cache (cloud pull). Does not push. */
export function replaceSessions(sessions: BacktestSession[]): void {
  writeAll(
    sessions
      .map(normalizeSession)
      .filter((s): s is BacktestSession => s !== null)
      .slice(0, MAX_SESSIONS),
  );
}

export function listSessions(): BacktestSession[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getSession(id: string): BacktestSession | null {
  return readAll().find((s) => s.id === id) ?? null;
}

export function createSession(
  input: CreateSessionInput,
  opts?: PersistOpts,
): BacktestSession {
  if (input.legs.length === 0) {
    throw new Error('Session requires at least one pair.');
  }
  const primary = input.legs[0]!;
  const label =
    input.legs.length === 1
      ? `${primary.pair} ${input.timeframe}`
      : `${input.legs.map((l) => l.pair).join(' + ')} ${input.timeframe}`;
  const startingBalance =
    typeof input.startingBalance === 'number' &&
    Number.isFinite(input.startingBalance) &&
    input.startingBalance > 0
      ? input.startingBalance
      : undefined;
  const strategyId = input.strategyId?.trim() || undefined;
  const strategyName = input.strategyName?.trim() || undefined;
  const description = input.description?.trim() || undefined;
  const session: BacktestSession = {
    id: newId(),
    name: input.name.trim() || label,
    pair: primary.pair,
    timeframe: input.timeframe,
    selectedTf: input.timeframe,
    startDate: input.startDate,
    endDate: input.endDate,
    datasetId: primary.datasetId,
    legs: input.legs,
    createdAt: Date.now(),
    ...(startingBalance !== undefined ? { startingBalance } : {}),
    ...(strategyId !== undefined ? { strategyId } : {}),
    ...(strategyName !== undefined ? { strategyName } : {}),
    ...(description !== undefined ? { description } : {}),
  };
  const next = [session, ...readAll()].slice(0, MAX_SESSIONS);
  writeAll(next);
  if (!opts?.skipCloud) cloudPushSession(session);
  return session;
}

export function deleteSession(id: string, opts?: PersistOpts): void {
  writeAll(readAll().filter((s) => s.id !== id));
  if (!opts?.skipCloud) cloudDeleteSession(id);
}

/** Insert or replace a session by id (example / restore / cloud pull paths). */
export function upsertSession(
  session: BacktestSession,
  opts?: PersistOpts,
): void {
  const normalized = normalizeSession(session);
  if (!normalized) return;
  const all = readAll().filter((s) => s.id !== normalized.id);
  writeAll([normalized, ...all].slice(0, MAX_SESSIONS));
  if (!opts?.skipCloud) cloudPushSession(normalized);
}

/** Persist replay progress so reopen/refresh can resume at the last candle. */
export function updateSessionProgress(
  id: string,
  patch: SessionProgressPatch,
  opts?: PersistOpts,
): BacktestSession | null {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const cur = all[idx]!;
  const next: BacktestSession = { ...cur };
  if (typeof patch.cursorTime === 'number' && Number.isFinite(patch.cursorTime)) {
    next.cursorTime = patch.cursorTime;
  }
  if (typeof patch.span === 'number' && Number.isFinite(patch.span) && patch.span > 0) {
    next.span = patch.span;
  }
  const tf = parseStoredTimeframe(patch.selectedTf);
  if (tf) next.selectedTf = tf;
  all[idx] = next;
  writeAll(all);
  if (!opts?.skipCloud) cloudPushProgress(id, patch);
  return next;
}

export function validateSessionDates(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return 'Start and end dates are required.';
  if (startDate > endDate) return 'Start date must be on or before end date.';
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Invalid date.';
  const spanDays = (end - start) / (24 * 60 * 60 * 1000);
  if (spanDays > 365 * 5) return 'Range cannot exceed 5 years.';
  return null;
}
