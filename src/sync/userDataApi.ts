/**
 * Client for cloud sync routes (`/api/v1/sessions|journal|…`).
 */
import type { BacktestSession } from '@/types/session';
import type { Drawing } from '@/drawings/drawingStore';
import type { JournalEntry } from '@/journal/journalStore';
import type { OrderJournal } from '@/orders/journal';
import { REMOTE_API_BASE } from '@/datasets/remoteApi';

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${REMOTE_API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const raw = await res.text();
  let payload: (T & { error?: string }) | null = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as T & { error?: string };
    } catch {
      throw new Error(
        res.ok
          ? `API ${path} returned non-JSON`
          : `API ${res.status} ${path}`,
      );
    }
  }
  if (!res.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : `API ${res.status} ${path}`,
    );
  }
  if (payload == null) {
    throw new Error(`API ${path} returned an empty body`);
  }
  return payload;
}

export async function fetchRemoteSessions(): Promise<BacktestSession[]> {
  const body = await apiJson<{ sessions: BacktestSession[] }>('/sessions');
  return body.sessions ?? [];
}

export async function upsertRemoteSession(
  session: BacktestSession,
): Promise<BacktestSession> {
  const body = await apiJson<{ session: BacktestSession }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(session),
  });
  return body.session;
}

export async function patchRemoteSession(
  id: string,
  patch: Partial<BacktestSession>,
): Promise<BacktestSession> {
  const body = await apiJson<{ session: BacktestSession }>(
    `/sessions/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return body.session;
}

export async function deleteRemoteSession(id: string): Promise<void> {
  await apiJson<{ ok: boolean }>(`/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchRemoteDrawings(
  sessionId: string,
  datasetId: string,
): Promise<Drawing[]> {
  const q = new URLSearchParams({ datasetId });
  const body = await apiJson<{ drawings: Drawing[] }>(
    `/sessions/${encodeURIComponent(sessionId)}/drawings?${q}`,
  );
  return body.drawings ?? [];
}

export async function putRemoteDrawings(
  sessionId: string,
  datasetId: string,
  drawings: Drawing[],
): Promise<void> {
  await apiJson<{ ok: boolean }>(
    `/sessions/${encodeURIComponent(sessionId)}/drawings`,
    {
      method: 'PUT',
      body: JSON.stringify({ datasetId, drawings }),
    },
  );
}

export async function fetchRemoteOrderJournal(
  sessionId: string,
): Promise<OrderJournal | null> {
  const body = await apiJson<{ orderJournal: OrderJournal | null }>(
    `/sessions/${encodeURIComponent(sessionId)}/order-journal`,
  );
  return body.orderJournal ?? null;
}

export async function putRemoteOrderJournal(
  sessionId: string,
  journal: OrderJournal,
): Promise<void> {
  await apiJson<{ ok: boolean }>(
    `/sessions/${encodeURIComponent(sessionId)}/order-journal`,
    { method: 'PUT', body: JSON.stringify(journal) },
  );
}

export async function fetchRemoteJournal(): Promise<JournalEntry[]> {
  const body = await apiJson<{ entries: JournalEntry[] }>('/journal');
  return body.entries ?? [];
}

export async function upsertRemoteJournal(
  entry: JournalEntry,
): Promise<JournalEntry> {
  const body = await apiJson<{ entry: JournalEntry }>('/journal', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
  return body.entry;
}

export async function deleteRemoteJournal(id: string): Promise<void> {
  await apiJson<{ ok: boolean }>(`/journal/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
