import type { Timeframe } from '@/types/ui';

/** Wire types for Step 13 `/api/v1` stub (local disk CDN stand-in). */

export interface RemoteUser {
  id: string;
  email: string;
  displayName: string;
}

export interface RemoteDatasetMeta {
  id: string;
  symbol: string;
  baseTimeframe: string;
  name: string;
  visibility: 'private' | 'shared' | 'public_read';
  status: 'pending' | 'ready' | 'failed';
  timeStart: number;
  timeEnd: number;
  rowCounts: Record<string, number>;
  timeframes: string[];
  ownerUserId?: string;
}

export interface RemoteChunkRef {
  chunkIndex: number;
  chunkId: string;
  url: string;
  logicalStart: number;
  timeStart: number;
  timeEnd: number;
  bytes: number;
}

export interface RemoteChunksResponse {
  datasetId: string;
  timeframe: string;
  seriesMeta: {
    rowCount: number;
    timeStart: number;
    timeEnd: number;
    chunkIds: string[];
    chunkStarts: number[];
    chunkTimeStarts: number[];
    chunkTimeEnds: number[];
    chunks: RemoteChunkRef[];
  };
}

export interface RemoteJob {
  id: string;
  type: 'ingest' | 'backtest';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  userId: string;
  payload: Record<string, unknown>;
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Opt-in only — Create Session / Datasets stay local-IDB by default. */
export function isRemoteDatasetsEnabled(): boolean {
  return import.meta.env.VITE_REMOTE_DATASETS === '1';
}

export type { Timeframe };
