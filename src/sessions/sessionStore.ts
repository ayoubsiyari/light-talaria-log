import type {
  BacktestSession,
  CreateSessionInput,
  PairSymbol,
  SessionLeg,
} from '@/types/session';
import type { Timeframe } from '@/types/ui';

const STORAGE_KEY = 'fast-chart.sessions.v1';
const MAX_SESSIONS = 50;

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
  return {
    id: s.id,
    name: s.name ?? `${primary.pair} ${s.timeframe}`,
    pair: primary.pair,
    timeframe: s.timeframe as Timeframe,
    startDate: s.startDate,
    endDate: s.endDate,
    datasetId: primary.datasetId,
    legs,
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
    ...(cursorTime !== undefined ? { cursorTime } : {}),
    ...(span !== undefined ? { span } : {}),
  };
}

function readAll(): BacktestSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSession).filter((s): s is BacktestSession => s !== null);
  } catch {
    return [];
  }
}

function writeAll(sessions: BacktestSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

export function listSessions(): BacktestSession[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getSession(id: string): BacktestSession | null {
  return readAll().find((s) => s.id === id) ?? null;
}

export function createSession(input: CreateSessionInput): BacktestSession {
  if (input.legs.length === 0) {
    throw new Error('Session requires at least one pair.');
  }
  const primary = input.legs[0]!;
  const label =
    input.legs.length === 1
      ? `${primary.pair} ${input.timeframe}`
      : `${input.legs.map((l) => l.pair).join(' + ')} ${input.timeframe}`;
  const session: BacktestSession = {
    id: crypto.randomUUID(),
    name: input.name.trim() || label,
    pair: primary.pair,
    timeframe: input.timeframe,
    startDate: input.startDate,
    endDate: input.endDate,
    datasetId: primary.datasetId,
    legs: input.legs,
    createdAt: Date.now(),
  };
  const next = [session, ...readAll()].slice(0, MAX_SESSIONS);
  writeAll(next);
  return session;
}

export function deleteSession(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id));
}

/** Persist replay progress so reopen/refresh can resume at the last candle. */
export function updateSessionProgress(
  id: string,
  patch: { cursorTime?: number; span?: number },
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
  all[idx] = next;
  writeAll(all);
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
