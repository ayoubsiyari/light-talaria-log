/** Performance constants — change only with PROJECT.md + benchmark update. */
export const MAX_BARS_IN_MEMORY = 2500;
export const VISIBLE_BARS_TARGET = 1500;
/** Candles kept on-screen during replay (right edge = cursor). */
export const REPLAY_VISIBLE_BARS = 120;
export const BUFFER_BARS = 500;
export const CHUNK_SIZE = 5000;
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
