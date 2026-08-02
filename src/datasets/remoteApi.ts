/**
 * Thin client for Step 13 `/api/v1` stub.
 *
 * Datasets UI probes `/health` and lists remote datasets when the API is up.
 * Local Dukascopy / CSV / IDB Create Session path stays the default offline path.
 * `VITE_REMOTE_DATASETS=1` remains an optional override for non-UI call sites.
 *
 * Flow: API chunk meta + binaries → same IDB `putChunk` / `putSeriesMeta` as CSV ingest.
 */
import type {
  RemoteChunksResponse,
  RemoteDatasetMeta,
  RemoteJob,
  RemoteUser,
} from '@/types/remoteApi';
import { isRemoteDatasetsEnabled } from '@/types/remoteApi';

export const REMOTE_API_BASE = '/api/v1';

export { isRemoteDatasetsEnabled };

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${REMOTE_API_BASE}${path}`, {
    ...init,
    credentials: 'include', // Level-2 session cookie
    headers,
  });
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof payload.error === 'string' ? payload.error : `API ${res.status} ${path}`,
    );
  }
  return payload;
}

export async function loginRemote(email: string, password: string): Promise<RemoteUser> {
  const body = await apiJson<{ user: RemoteUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return body.user;
}

export async function registerRemote(
  email: string,
  password: string,
  displayName?: string,
): Promise<RemoteUser> {
  const body = await apiJson<{ user: RemoteUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
  return body.user;
}

export async function logoutRemote(): Promise<void> {
  await apiJson<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}

export async function fetchHealth(): Promise<{
  ok: boolean;
  service: string;
  mode?: string;
  storage?: string;
}> {
  return apiJson('/health');
}

export async function fetchMe(): Promise<RemoteUser> {
  const body = await apiJson<{ user: RemoteUser }>('/auth/me');
  return body.user;
}

export async function listRemoteDatasets(): Promise<RemoteDatasetMeta[]> {
  const body = await apiJson<{ datasets: RemoteDatasetMeta[] }>('/datasets');
  return body.datasets;
}

export async function getRemoteDataset(id: string): Promise<RemoteDatasetMeta> {
  const body = await apiJson<{ dataset: RemoteDatasetMeta }>(
    `/datasets/${encodeURIComponent(id)}`,
  );
  return body.dataset;
}

export async function fetchRemoteChunks(opts: {
  datasetId: string;
  timeframe: string;
  fromTime?: number;
  toTime?: number;
}): Promise<RemoteChunksResponse> {
  const q = new URLSearchParams({ tf: opts.timeframe });
  if (opts.fromTime != null) q.set('fromTime', String(opts.fromTime));
  if (opts.toTime != null) q.set('toTime', String(opts.toTime));
  return apiJson(
    `/datasets/${encodeURIComponent(opts.datasetId)}/chunks?${q.toString()}`,
  );
}

/** Fetch packed OHLCV ArrayBuffer for a chunk URL from the API. */
export async function fetchChunkBinary(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Chunk fetch failed (${res.status}): ${url}`);
  }
  return res.arrayBuffer();
}

export async function enqueueIngestJob(
  payload: Record<string, unknown>,
): Promise<RemoteJob> {
  const body = await apiJson<{ job: RemoteJob }>('/jobs/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return body.job;
}

export async function getRemoteJob(id: string): Promise<RemoteJob> {
  const body = await apiJson<{ job: RemoteJob }>(`/jobs/${encodeURIComponent(id)}`);
  return body.job;
}
