/**
 * Persist backtest runs (localStorage). Multi-run append — never OHLC bars.
 */
import type { BacktestResult } from '@/types/backtest';
import { normalizeBacktestParams } from '@/types/backtest';
import { newId } from '@/utils/uuid';

const STORAGE_KEY = 'talaria.journal.v1';
const MAX_ENTRIES = 50;

export interface JournalEntry {
  /** Unique run id (multi-run). Legacy entries may reuse sessionId. */
  id: string;
  sessionId: string;
  /** Denormalized label for list UI without loading sessions. */
  sessionName: string;
  result: BacktestResult;
  savedAt: number;
}

function isBacktestResult(raw: unknown): raw is BacktestResult {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Partial<BacktestResult>;
  return (
    typeof r.sessionId === 'string' &&
    Array.isArray(r.trades) &&
    Array.isArray(r.equity) &&
    typeof r.finalEquity === 'number' &&
    typeof r.totalPnl === 'number'
  );
}

function normalizeEntry(raw: unknown): JournalEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<JournalEntry> & { result?: unknown };
  if (typeof e.sessionId !== 'string' || !isBacktestResult(e.result)) return null;
  const result: BacktestResult = {
    ...e.result,
    params: normalizeBacktestParams(e.result.params),
    events: Array.isArray(e.result.events) ? e.result.events : [],
    runId:
      typeof e.result.runId === 'string'
        ? e.result.runId
        : typeof e.id === 'string'
          ? e.id
          : undefined,
  };
  const id =
    typeof e.id === 'string'
      ? e.id
      : typeof result.runId === 'string'
        ? result.runId
        : e.sessionId;
  return {
    id,
    sessionId: e.sessionId,
    sessionName: typeof e.sessionName === 'string' ? e.sessionName : e.sessionId,
    result,
    savedAt: typeof e.savedAt === 'number' ? e.savedAt : Date.now(),
  };
}

function readAll(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((e): e is JournalEntry => e !== null);
  } catch {
    return [];
  }
}

function writeAll(entries: JournalEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

/** Latest saved result for a session, or null. */
export function getJournalEntry(sessionId: string): JournalEntry | null {
  return (
    readAll()
      .filter((e) => e.sessionId === sessionId)
      .sort((a, b) => b.savedAt - a.savedAt)[0] ?? null
  );
}

export function getJournalRun(runId: string): JournalEntry | null {
  return readAll().find((e) => e.id === runId) ?? null;
}

/** All journal runs, newest first. */
export function listJournalEntries(): JournalEntry[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

/** Append a backtest run (keeps prior runs for the same session). */
export function saveJournalResult(
  sessionId: string,
  sessionName: string,
  result: BacktestResult,
): JournalEntry {
  const runId = result.runId && result.runId.length > 0 ? result.runId : newId();
  const withId: BacktestResult = {
    ...result,
    runId,
    params: normalizeBacktestParams(result.params),
    events: Array.isArray(result.events) ? result.events : [],
  };
  const entry: JournalEntry = {
    id: runId,
    sessionId,
    sessionName,
    result: withId,
    savedAt: Date.now(),
  };
  writeAll([entry, ...readAll().filter((e) => e.id !== runId)]);
  return entry;
}

/** Delete one run by id. */
export function deleteJournalRun(runId: string): void {
  writeAll(readAll().filter((e) => e.id !== runId));
}

/** Delete all runs for a session (session teardown). */
export function deleteJournalEntry(sessionId: string): void {
  writeAll(readAll().filter((e) => e.sessionId !== sessionId));
}
