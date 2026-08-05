/**
 * Event-sourced order journal — persist, replay, display timestamps.
 * Date.now() is allowed HERE ONLY for wall-clock display metadata.
 */

import type { EngineEvent, OrderEngineState } from './orderTypes';
import { createInitialState, hashState, reduceCommand, stepEngine } from './orderEngine';
import type { InstrumentSpec } from './instrumentSpec';
import type { EngineCommand, MarketContext } from './orderTypes';
import type { ChartBar } from '@/types/bar';

import { getStorageUserId, scopedKey } from '@/sync/storageScope';

const LEGACY_PREFIX = 'talaria.orderJournal.v1:';

export type PersistOpts = { skipCloud?: boolean };

function orderJournalKey(sessionId: string): string {
  return scopedKey(`orderJournal.v1:${sessionId}`);
}

export interface JournalEntry {
  /** Monotonic engine seq. */
  seq: number;
  cursorTime: number;
  type: string;
  payload: Record<string, unknown>;
  /** Wall-clock when the entry was recorded (display only — not used by engine). */
  recordedAtMs: number;
}

export interface OrderJournal {
  sessionId: string;
  entries: JournalEntry[];
  /** Snapshot of initial engine params for replay. */
  bootstrap: {
    symbol: string;
    accountCurrency: string;
    balance: number;
    leverage: number;
    mode: 'netting' | 'hedging';
  };
}

export function createJournal(
  sessionId: string,
  bootstrap: OrderJournal['bootstrap'],
): OrderJournal {
  return { sessionId, entries: [], bootstrap };
}

export function appendEvents(
  journal: OrderJournal,
  events: EngineEvent[],
): OrderJournal {
  if (events.length === 0) return journal;
  const recordedAtMs = Date.now(); // display-only wall clock
  const entries = journal.entries.slice();
  for (const e of events) {
    entries.push({
      seq: e.seq,
      cursorTime: e.cursorTime,
      type: e.type,
      payload: e.payload,
      recordedAtMs,
    });
  }
  return { ...journal, entries };
}

export function persistJournal(
  journal: OrderJournal,
  opts?: PersistOpts,
): void {
  try {
    localStorage.setItem(
      orderJournalKey(journal.sessionId),
      JSON.stringify(journal),
    );
    if (!opts?.skipCloud) {
      void import('@/sync/cloudSync').then((m) =>
        m.schedulePushOrderJournal(journal),
      );
    }
  } catch {
    // Quota / private mode — journal stays in memory only.
  }
}

export function loadJournal(sessionId: string): OrderJournal | null {
  try {
    const scoped = localStorage.getItem(orderJournalKey(sessionId));
    if (scoped) return JSON.parse(scoped) as OrderJournal;
    if (getStorageUserId()) return null;
    const legacy = localStorage.getItem(LEGACY_PREFIX + sessionId);
    if (legacy) {
      localStorage.setItem(orderJournalKey(sessionId), legacy);
      return JSON.parse(legacy) as OrderJournal;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearJournal(sessionId: string, opts?: PersistOpts): void {
  try {
    localStorage.removeItem(orderJournalKey(sessionId));
    localStorage.removeItem(LEGACY_PREFIX + sessionId);
    if (!opts?.skipCloud) {
      void import('@/sync/cloudSync').then((m) =>
        m.schedulePushOrderJournal({
          sessionId,
          entries: [],
          bootstrap: {
            symbol: '',
            accountCurrency: 'USD',
            balance: 0,
            leverage: 1,
            mode: 'netting',
          },
        }),
      );
    }
  } catch {
    /* ignore */
  }
}

export type ReplayableStep =
  | { kind: 'command'; command: EngineCommand }
  | { kind: 'bar'; bar: ChartBar; ctx: MarketContext };

/**
 * Replay a recorded sequence of commands + bars into a fresh engine.
 * Used by the §7.1 hash-equality test.
 */
export function replaySteps(
  bootstrap: OrderJournal['bootstrap'],
  sessionId: string,
  steps: readonly ReplayableStep[],
  spec: InstrumentSpec,
): OrderEngineState {
  let state = createInitialState({
    ...bootstrap,
    sessionId,
  });
  for (const step of steps) {
    if (step.kind === 'command') {
      state = reduceCommand(state, step.command, spec).state;
    } else {
      state = stepEngine(state, step.bar, spec, step.ctx).state;
    }
  }
  return state;
}

export { hashState, createInitialState };
