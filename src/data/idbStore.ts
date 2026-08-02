/**
 * IndexedDB storage for bar chunks, series meta, and raw CSV blobs.
 */
import {
  IDB_NAME,
  IDB_STORE_CHUNKS,
  IDB_STORE_DATASET_CSV,
  IDB_STORE_META,
  IDB_VERSION,
} from '@/utils/constants';
import type { ChartBarWithVolume, DatasetMeta } from '@/types/bar';
import type { SeriesMeta } from '@/types/series';
import { seriesMetaKey } from '@/types/series';
import type { Timeframe } from '@/types/ui';
import { chunkIndexForLogical } from './barIndex';
import { toChartBars, unpackBuffer } from './binaryBar';

export async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE_CHUNKS)) {
        db.createObjectStore(IDB_STORE_CHUNKS);
      }
      if (!db.objectStoreNames.contains(IDB_STORE_META)) {
        db.createObjectStore(IDB_STORE_META);
      }
      if (!db.objectStoreNames.contains(IDB_STORE_DATASET_CSV)) {
        db.createObjectStore(IDB_STORE_DATASET_CSV);
      }
    };
  });
}

export async function putChunk(db: IDBDatabase, chunkId: string, buffer: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readwrite');
    tx.objectStore(IDB_STORE_CHUNKS).put(buffer, chunkId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChunk(db: IDBDatabase, chunkId: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_CHUNKS, 'readonly');
    const req = tx.objectStore(IDB_STORE_CHUNKS).get(chunkId);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putSeriesMeta(db: IDBDatabase, meta: SeriesMeta): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_META, 'readwrite');
    tx.objectStore(IDB_STORE_META).put(meta, seriesMetaKey(meta.datasetId, meta.timeframe));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSeriesMeta(
  db: IDBDatabase,
  datasetId: string,
  timeframe: Timeframe,
): Promise<SeriesMeta | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_META, 'readonly');
    const req = tx.objectStore(IDB_STORE_META).get(seriesMetaKey(datasetId, timeframe));
    req.onsuccess = () => resolve((req.result as SeriesMeta | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function hasSeriesIngested(
  db: IDBDatabase,
  datasetId: string,
  timeframe: Timeframe,
): Promise<boolean> {
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  return meta != null && meta.rowCount > 0 && meta.chunkIds.length > 0;
}

export async function getDatasetMeta(db: IDBDatabase): Promise<DatasetMeta | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_META, 'readonly');
    const req = tx.objectStore(IDB_STORE_META).get('dataset');
    req.onsuccess = () => resolve((req.result as DatasetMeta) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putDatasetCsv(db: IDBDatabase, datasetId: string, csv: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_DATASET_CSV, 'readwrite');
    tx.objectStore(IDB_STORE_DATASET_CSV).put(csv, datasetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDatasetCsv(db: IDBDatabase, datasetId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_DATASET_CSV, 'readonly');
    const req = tx.objectStore(IDB_STORE_DATASET_CSV).get(datasetId);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDatasetCsv(db: IDBDatabase, datasetId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_DATASET_CSV, 'readwrite');
    tx.objectStore(IDB_STORE_DATASET_CSV).delete(datasetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete all keys in a store whose string id starts with `prefix`. */
async function deleteKeysByPrefix(
  db: IDBDatabase,
  storeName: string,
  prefix: string,
): Promise<void> {
  if (!prefix) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    // String keys: `${datasetId}:…` (meta) or `${datasetId}/…` (chunks)
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, false);
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = String(cursor.key);
      if (key.startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove series meta + bar chunks for a dataset.
 * Meta keys: `${datasetId}:${tf}` · chunk keys: `${datasetId}/${tf}/${i}`
 */
export async function deleteSeriesForDataset(
  db: IDBDatabase,
  datasetId: string,
): Promise<void> {
  await deleteKeysByPrefix(db, IDB_STORE_META, `${datasetId}:`);
  await deleteKeysByPrefix(db, IDB_STORE_CHUNKS, `${datasetId}/`);
}

/** Load bars for logical index range from series chunks. */
export async function getBarsInRange(
  db: IDBDatabase,
  meta: SeriesMeta,
  fromIndex: number,
  toIndex: number,
): Promise<ChartBarWithVolume[]> {
  const from = Math.max(0, Math.floor(fromIndex));
  const to = Math.min(meta.rowCount, Math.ceil(toIndex));
  if (to <= from || meta.chunkIds.length === 0) return [];

  const out: ChartBarWithVolume[] = [];
  let chunkIdx = chunkIndexForLogical(meta, from);

  while (chunkIdx < meta.chunkIds.length) {
    const chunkStart = meta.chunkStarts[chunkIdx]!;
    const chunkEnd =
      chunkIdx + 1 < meta.chunkStarts.length
        ? meta.chunkStarts[chunkIdx + 1]!
        : meta.rowCount;
    if (chunkStart >= to) break;

    const buffer = await getChunk(db, meta.chunkIds[chunkIdx]!);
    if (!buffer) {
      chunkIdx++;
      continue;
    }
    const store = unpackBuffer(buffer);
    const localFrom = Math.max(0, from - chunkStart);
    const localTo = Math.min(store.length, to - chunkStart);
    if (localTo > localFrom) {
      out.push(...toChartBars(store, localFrom, localTo));
    }
    if (chunkEnd >= to) break;
    chunkIdx++;
  }

  return out;
}

export { unpackBuffer, toChartBars };
