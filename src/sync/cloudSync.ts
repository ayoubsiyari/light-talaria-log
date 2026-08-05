/**
 * Pull/push user sessions, drawings, journal, order journals.
 * localStorage is the fast cache; server is source of truth when authenticated.
 */
import type { BacktestSession } from '@/types/session';
import type { Drawing } from '@/drawings/drawingStore';
import { saveDrawings as saveDrawingsLocal } from '@/drawings/drawingStore';
import {
  replaceJournalEntries,
  type JournalEntry,
} from '@/journal/journalStore';
import {
  clearJournal as clearOrderJournalLocal,
  persistJournal as persistOrderJournalLocal,
  type OrderJournal,
} from '@/orders/journal';
import { getSession, replaceSessions } from '@/sessions/sessionStore';
import { getStorageUserId } from '@/sync/storageScope';
import {
  deleteRemoteJournal,
  deleteRemoteSession,
  fetchRemoteDrawings,
  fetchRemoteJournal,
  fetchRemoteOrderJournal,
  fetchRemoteSessions,
  patchRemoteSession,
  putRemoteDrawings,
  putRemoteOrderJournal,
  upsertRemoteJournal,
  upsertRemoteSession,
} from '@/sync/userDataApi';

let cloudEnabled = false;
const drawingTimers = new Map<string, number>();
const orderJournalTimers = new Map<string, number>();
const progressTimers = new Map<string, number>();

export function setCloudSyncEnabled(enabled: boolean): void {
  cloudEnabled = enabled;
}

export function isCloudSyncEnabled(): boolean {
  return cloudEnabled && !!getStorageUserId();
}

function sessionKeyParts(sessionKey: string): {
  sessionId: string;
  datasetId: string;
} | null {
  const i = sessionKey.indexOf(':');
  if (i <= 0) return null;
  return {
    sessionId: sessionKey.slice(0, i),
    datasetId: sessionKey.slice(i + 1),
  };
}

/** Full hydrate from server → local caches. */
export async function pullAll(): Promise<void> {
  if (!getStorageUserId()) return;
  const sessions = await fetchRemoteSessions();
  replaceSessions(sessions);

  const journal = await fetchRemoteJournal();
  replaceJournalEntries(journal);

  for (const s of sessions) {
    const datasetIds = new Set(
      s.legs.map((l) => l.datasetId).filter(Boolean),
    );
    if (s.datasetId) datasetIds.add(s.datasetId);
    for (const datasetId of datasetIds) {
      try {
        const drawings = await fetchRemoteDrawings(s.id, datasetId);
        saveDrawingsLocal(`${s.id}:${datasetId}`, drawings, {
          skipCloud: true,
        });
      } catch {
        // empty / missing
      }
    }
    try {
      const oj = await fetchRemoteOrderJournal(s.id);
      if (oj && typeof oj === 'object' && Array.isArray(oj.entries)) {
        persistOrderJournalLocal(oj, { skipCloud: true });
      } else {
        clearOrderJournalLocal(s.id, { skipCloud: true });
      }
    } catch {
      // ignore
    }
  }
}

export async function pushSession(session: BacktestSession): Promise<void> {
  if (!isCloudSyncEnabled()) return;
  try {
    await upsertRemoteSession(session);
  } catch (err) {
    console.warn('[cloudSync] pushSession failed', err);
  }
}

export async function pushSessionProgress(
  id: string,
  patch: { cursorTime?: number; span?: number },
): Promise<void> {
  if (!isCloudSyncEnabled()) return;
  const prev = progressTimers.get(id);
  if (prev) window.clearTimeout(prev);
  const t = window.setTimeout(() => {
    progressTimers.delete(id);
    void patchRemoteSession(id, patch).catch((err) =>
      console.warn('[cloudSync] pushSessionProgress failed', err),
    );
  }, 800);
  progressTimers.set(id, t);
}

export async function pushDeleteSession(id: string): Promise<void> {
  if (!isCloudSyncEnabled()) return;
  try {
    await deleteRemoteSession(id);
  } catch (err) {
    console.warn('[cloudSync] deleteSession failed', err);
  }
}

export function schedulePushDrawings(
  sessionKey: string,
  drawings: Drawing[],
): void {
  if (!isCloudSyncEnabled()) return;
  const parts = sessionKeyParts(sessionKey);
  if (!parts) return;
  const prev = drawingTimers.get(sessionKey);
  if (prev) window.clearTimeout(prev);
  const t = window.setTimeout(() => {
    drawingTimers.delete(sessionKey);
    void (async () => {
      try {
        const session = getSession(parts.sessionId);
        if (session) await upsertRemoteSession(session);
        await putRemoteDrawings(parts.sessionId, parts.datasetId, drawings);
      } catch (err) {
        console.warn('[cloudSync] pushDrawings failed', err);
      }
    })();
  }, 300);
  drawingTimers.set(sessionKey, t);
}

export async function pushJournal(entry: JournalEntry): Promise<void> {
  if (!isCloudSyncEnabled()) return;
  try {
    await upsertRemoteJournal(entry);
  } catch (err) {
    console.warn('[cloudSync] pushJournal failed', err);
  }
}

export async function pushDeleteJournal(id: string): Promise<void> {
  if (!isCloudSyncEnabled()) return;
  try {
    await deleteRemoteJournal(id);
  } catch (err) {
    console.warn('[cloudSync] deleteJournal failed', err);
  }
}

export function schedulePushOrderJournal(journal: OrderJournal): void {
  if (!isCloudSyncEnabled()) return;
  const id = journal.sessionId;
  const prev = orderJournalTimers.get(id);
  if (prev) window.clearTimeout(prev);
  const t = window.setTimeout(() => {
    orderJournalTimers.delete(id);
    void (async () => {
      try {
        const session = getSession(id);
        if (session) await upsertRemoteSession(session);
        await putRemoteOrderJournal(id, journal);
      } catch (err) {
        console.warn('[cloudSync] pushOrderJournal failed', err);
      }
    })();
  }, 500);
  orderJournalTimers.set(id, t);
}
