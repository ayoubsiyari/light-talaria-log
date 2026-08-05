/**
 * File-backed user sync store for the Vite `/api/v1` stub.
 * Path: `data/user-sync/{userId}.json` (gitignored under `/data/`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(process.cwd(), 'data', 'user-sync');

export interface SyncSession {
  id: string;
  name: string;
  pair: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  datasetId: string;
  legs: Array<{ pair: string; datasetId: string }>;
  createdAt: number;
  updatedAt: number;
  cursorTime?: number;
  span?: number;
  startingBalance?: number;
  strategyId?: string;
  strategyName?: string;
  description?: string;
  orderJournal?: unknown;
}

export interface SyncJournalEntry {
  id: string;
  sessionId: string;
  sessionName: string;
  result: unknown;
  savedAt: number;
}

interface UserBlob {
  sessions: SyncSession[];
  /** key = `${sessionId}:${datasetId}` */
  drawings: Record<string, unknown[]>;
  journal: SyncJournalEntry[];
}

function emptyBlob(): UserBlob {
  return { sessions: [], drawings: {}, journal: [] };
}

function filePath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(ROOT, `${safe}.json`);
}

function readBlob(userId: string): UserBlob {
  try {
    const fp = filePath(userId);
    if (!existsSync(fp)) return emptyBlob();
    const raw = JSON.parse(readFileSync(fp, 'utf8')) as Partial<UserBlob>;
    return {
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      drawings:
        raw.drawings && typeof raw.drawings === 'object' ? raw.drawings : {},
      journal: Array.isArray(raw.journal) ? raw.journal : [],
    };
  } catch {
    return emptyBlob();
  }
}

function writeBlob(userId: string, blob: UserBlob): void {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(filePath(userId), JSON.stringify(blob), 'utf8');
}

export function listSessions(userId: string): SyncSession[] {
  return readBlob(userId)
    .sessions.slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(userId: string, id: string): SyncSession | null {
  return readBlob(userId).sessions.find((s) => s.id === id) ?? null;
}

export function upsertSession(
  userId: string,
  input: Omit<SyncSession, 'updatedAt' | 'createdAt' | 'orderJournal'> & {
    id?: string;
    createdAt?: number;
    orderJournal?: unknown;
  },
): SyncSession {
  const blob = readBlob(userId);
  const id = input.id && input.id.length > 0 ? input.id : randomUUID();
  const existing = blob.sessions.find((s) => s.id === id);
  const session: SyncSession = {
    id,
    name: input.name,
    pair: input.pair,
    timeframe: input.timeframe,
    startDate: input.startDate,
    endDate: input.endDate,
    datasetId: input.datasetId,
    legs: input.legs,
    createdAt: existing?.createdAt ?? input.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    ...(input.cursorTime != null ? { cursorTime: input.cursorTime } : existing?.cursorTime != null ? { cursorTime: existing.cursorTime } : {}),
    ...(input.span != null ? { span: input.span } : existing?.span != null ? { span: existing.span } : {}),
    ...(input.startingBalance != null
      ? { startingBalance: input.startingBalance }
      : existing?.startingBalance != null
        ? { startingBalance: existing.startingBalance }
        : {}),
    ...(input.strategyId
      ? { strategyId: input.strategyId }
      : existing?.strategyId
        ? { strategyId: existing.strategyId }
        : {}),
    ...(input.strategyName
      ? { strategyName: input.strategyName }
      : existing?.strategyName
        ? { strategyName: existing.strategyName }
        : {}),
    ...(input.description
      ? { description: input.description }
      : existing?.description
        ? { description: existing.description }
        : {}),
    ...(input.orderJournal !== undefined
      ? { orderJournal: input.orderJournal }
      : existing?.orderJournal !== undefined
        ? { orderJournal: existing.orderJournal }
        : {}),
  };
  blob.sessions = [session, ...blob.sessions.filter((s) => s.id !== id)].slice(
    0,
    100,
  );
  writeBlob(userId, blob);
  return session;
}

export function patchSession(
  userId: string,
  id: string,
  patch: Partial<SyncSession>,
): SyncSession | null {
  const blob = readBlob(userId);
  const idx = blob.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const cur = blob.sessions[idx]!;
  const next: SyncSession = {
    ...cur,
    ...patch,
    id: cur.id,
    updatedAt: Date.now(),
  };
  blob.sessions[idx] = next;
  writeBlob(userId, blob);
  return next;
}

export function deleteSession(userId: string, id: string): boolean {
  const blob = readBlob(userId);
  const before = blob.sessions.length;
  blob.sessions = blob.sessions.filter((s) => s.id !== id);
  if (blob.sessions.length === before) return false;
  for (const key of Object.keys(blob.drawings)) {
    if (key.startsWith(`${id}:`)) delete blob.drawings[key];
  }
  blob.journal = blob.journal.filter((j) => j.sessionId !== id);
  writeBlob(userId, blob);
  return true;
}

export function getDrawings(
  userId: string,
  sessionId: string,
  datasetId: string,
): unknown[] {
  const key = `${sessionId}:${datasetId}`;
  return readBlob(userId).drawings[key] ?? [];
}

export function putDrawings(
  userId: string,
  sessionId: string,
  datasetId: string,
  drawings: unknown[],
): void {
  const blob = readBlob(userId);
  if (!blob.sessions.some((s) => s.id === sessionId)) {
    throw new Error('Session not found');
  }
  blob.drawings[`${sessionId}:${datasetId}`] = drawings.slice(0, 500);
  writeBlob(userId, blob);
}

export function putOrderJournal(
  userId: string,
  sessionId: string,
  orderJournal: unknown,
): boolean {
  const blob = readBlob(userId);
  const idx = blob.sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return false;
  blob.sessions[idx] = {
    ...blob.sessions[idx]!,
    orderJournal,
    updatedAt: Date.now(),
  };
  writeBlob(userId, blob);
  return true;
}

export function getOrderJournal(userId: string, sessionId: string): unknown {
  return getSession(userId, sessionId)?.orderJournal ?? null;
}

export function listJournal(userId: string): SyncJournalEntry[] {
  return readBlob(userId)
    .journal.slice()
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function upsertJournal(
  userId: string,
  entry: Omit<SyncJournalEntry, 'id' | 'savedAt'> & {
    id?: string;
    savedAt?: number;
  },
): SyncJournalEntry {
  const blob = readBlob(userId);
  const id = entry.id && entry.id.length > 0 ? entry.id : randomUUID();
  const next: SyncJournalEntry = {
    id,
    sessionId: entry.sessionId,
    sessionName: entry.sessionName,
    result: entry.result,
    savedAt: entry.savedAt ?? Date.now(),
  };
  blob.journal = [next, ...blob.journal.filter((j) => j.id !== id)].slice(
    0,
    100,
  );
  writeBlob(userId, blob);
  return next;
}

export function deleteJournal(userId: string, id: string): boolean {
  const blob = readBlob(userId);
  const before = blob.journal.length;
  blob.journal = blob.journal.filter((j) => j.id !== id);
  if (blob.journal.length === before) return false;
  writeBlob(userId, blob);
  return true;
}
