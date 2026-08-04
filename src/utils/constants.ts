/** Performance constants — change only with PROJECT.md + benchmark update. */
export const MAX_BARS_IN_MEMORY = 2500;
export const VISIBLE_BARS_TARGET = 1500;
/** Candles kept on-screen during replay (right edge = cursor). */
export const REPLAY_VISIBLE_BARS = 120;
export const BUFFER_BARS = 500;
export const CHUNK_SIZE = 5000;
/**
 * Max packed bar chunks kept in IndexedDB per remote dataset×TF (sliding window).
 * ~8 × 5000 × 28 B ≈ 1.1 MB per series — long replay evicts far-behind chunks.
 */
export const MAX_IDB_CHUNKS_PER_SERIES = 8;
/** Min ms between sliding-window GC passes for the same dataset×TF. */
export const IDB_CHUNK_GC_THROTTLE_MS = 4000;
export const DEBOUNCE_MS = 50;
/** Extra debounce for zoom LOD TF switches (avoids thrash mid-wheel). */
export const LOD_DEBOUNCE_MS = 120;
/**
 * Max bars streamed into the backtest Worker (TypedArrays only).
 * Longer session spans are truncated from the end (newest bars kept).
 */
export const MAX_BACKTEST_BARS = 50_000;

export const IDB_NAME = 'fast-chart';
export const IDB_VERSION = 2;
export const IDB_STORE_CHUNKS = 'barChunks';
export const IDB_STORE_META = 'metadata';
/** Raw CSV blobs keyed by dataset id */
export const IDB_STORE_DATASET_CSV = 'datasetCsv';
