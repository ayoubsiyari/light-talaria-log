/**
 * Persist latest backtest result per session (localStorage).
 * Trades + sparse equity only — never OHLC bars.
 */
import type { BacktestResult } from '@/types/backtest';

const STORAGE_KEY = 'talaria.journal.v1';
const MAX_ENTRIES = 50;

export interface JournalEntry {
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
  const e = raw as Partial<JournalEntry>;
  if (typeof e.sessionId !== 'string' || !isBacktestResult(e.result)) return null;
  return {
    sessionId: e.sessionId,
    sessionName: typeof e.sessionName === 'string' ? e.sessionName : e.sessionId,
    result: e.result,
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
  return readAll().find((e) => e.sessionId === sessionId) ?? null;
}

/** All journal entries, newest first. */
export function listJournalEntries(): JournalEntry[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

/** Upsert latest backtest result for a session (replaces prior run). */
export function saveJournalResult(
  sessionId: string,
  sessionName: string,
  result: BacktestResult,
): void {
  const entry: JournalEntry = {
    sessionId,
    sessionName,
    result,
    savedAt: Date.now(),
  };
  const others = readAll().filter((e) => e.sessionId !== sessionId);
  writeAll([entry, ...others]);
}

export function deleteJournalEntry(sessionId: string): void {
  writeAll(readAll().filter((e) => e.sessionId !== sessionId));
}
