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
  const raw = await res.text();
  let payload: (T & { error?: string }) | null = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as T & { error?: string };
    } catch {
      throw new Error(
        res.ok
          ? `API ${path} returned non-JSON`
          : `API ${res.status} ${path} (empty or non-JSON — use npm run dev, or saas:dev with API up)`,
      );
    }
  }
  if (!res.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : `API ${res.status} ${path}${res.status === 404 ? ' — stub/API not mounted on this server' : ''}`,
    );
  }
  if (payload == null) {
    throw new Error(`API ${path} returned an empty body`);
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

/** Publish / overwrite dataset catalog meta on the shared server store. */
export async function putRemoteDatasetMeta(
  id: string,
  meta: RemoteDatasetMeta,
): Promise<RemoteDatasetMeta> {
  const body = await apiJson<{ dataset: RemoteDatasetMeta }>(
    `/datasets/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(meta) },
  );
  return body.dataset;
}

/** Publish series meta for one timeframe. */
export async function putRemoteSeriesMeta(
  datasetId: string,
  timeframe: string,
  series: {
    rowCount: number;
    timeStart: number;
    timeEnd: number;
    chunkIds: string[];
    chunkStarts: number[];
    chunkTimeStarts: number[];
    chunkTimeEnds: number[];
  },
): Promise<void> {
  await apiJson(
    `/datasets/${encodeURIComponent(datasetId)}/series/${encodeURIComponent(timeframe)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        datasetId,
        timeframe,
        rowCount: series.rowCount,
        timeStart: series.timeStart,
        timeEnd: series.timeEnd,
        chunkIds: series.chunkIds,
        chunkStarts: series.chunkStarts,
        chunkTimeStarts: series.chunkTimeStarts,
        chunkTimeEnds: series.chunkTimeEnds,
      }),
    },
  );
}

/** Upload one packed OHLCV chunk binary. */
export async function putRemoteChunkBinary(
  datasetId: string,
  timeframe: string,
  chunkIndex: number,
  buffer: ArrayBuffer,
): Promise<void> {
  const res = await fetch(
    `${REMOTE_API_BASE}/datasets/${encodeURIComponent(datasetId)}/chunks/${encodeURIComponent(timeframe)}/${chunkIndex}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
    },
  );
  if (!res.ok) {
    let msg = `Chunk upload failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (typeof j.error === 'string') msg = j.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
}
