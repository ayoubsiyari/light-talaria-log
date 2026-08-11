import { getChunk, getSeriesMeta, hasSeriesIngested } from '@/data/idbStore';
import type { SeriesMeta } from '@/types/series';
import type { Timeframe } from '@/types/ui';

/**
 * Pure health predicate (testable without IDB).
 * True when ingested flag is set, meta lists chunks, and first chunk is non-empty.
 */
export function isSeriesMetaHealthy(
  hasIngested: boolean,
  meta: SeriesMeta | null | undefined,
  firstChunk: ArrayBuffer | null | undefined,
): boolean {
  if (!hasIngested) return false;
  if (!meta || meta.chunkIds.length === 0) return false;
  return firstChunk != null && firstChunk.byteLength > 0;
}

/**
 * True when base TF series meta exists and the first chunk buffer is present.
 * Guards partial / wiped IDB after ingest or remote sync.
 */
export async function seriesChunksHealthy(
  db: IDBDatabase,
  datasetId: string,
  baseTf: Timeframe,
): Promise<boolean> {
  const hasIngested = await hasSeriesIngested(db, datasetId, baseTf);
  if (!hasIngested) return false;
  const meta = await getSeriesMeta(db, datasetId, baseTf);
  if (!meta || meta.chunkIds.length === 0) return false;
  const buf = await getChunk(db, meta.chunkIds[0]!);
  return isSeriesMetaHealthy(true, meta, buf);
}
