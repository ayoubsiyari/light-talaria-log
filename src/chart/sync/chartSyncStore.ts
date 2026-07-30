export type ChartId = string;

/** Shared wall-clock window — primary sync coordinate across different timeframes. */
export interface SyncTimeRange {
  fromTime: number;
  toTime: number;
}

export interface SyncCrosshair {
  /** Unix seconds — primary crosshair sync key across TFs */
  time: number | null;
  price: number | null;
  /** Pane-local logical index (optional; receivers prefer `time`) */
  index?: number;
}

export interface ChartSyncState {
  timeRange: SyncTimeRange | null;
  crosshair: SyncCrosshair | null;
  origin: ChartId | null;
}

export interface ChartSyncStore {
  get(): ChartSyncState;
  setTimeRange(range: SyncTimeRange, origin: ChartId): void;
  setCrosshair(crosshair: SyncCrosshair | null, origin: ChartId): void;
  subscribe(cb: (state: ChartSyncState) => void): () => void;
}

type Listener = (state: ChartSyncState) => void;

function timeRangesEqual(a: SyncTimeRange | null, b: SyncTimeRange | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.fromTime === b.fromTime && a.toTime === b.toTime;
}

function crosshairsEqual(a: SyncCrosshair | null, b: SyncCrosshair | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.time === b.time && a.price === b.price;
}

/**
 * Multi-chart sync store — syncs by **time**, not logical index,
 * so panes on different timeframes stay aligned.
 */
export function createChartSyncStore(initial?: SyncTimeRange | null): ChartSyncStore {
  let state: ChartSyncState = {
    timeRange: initial ?? null,
    crosshair: null,
    origin: null,
  };

  const listeners = new Set<Listener>();

  const notify = () => {
    for (const cb of listeners) cb(state);
  };

  return {
    get() {
      return state;
    },

    setTimeRange(range: SyncTimeRange, origin: ChartId) {
      if (timeRangesEqual(state.timeRange, range)) return;
      state = { ...state, timeRange: range, origin };
      notify();
    },

    setCrosshair(crosshair: SyncCrosshair | null, origin: ChartId) {
      if (crosshairsEqual(state.crosshair, crosshair)) return;
      state = { ...state, crosshair, origin };
      notify();
    },

    subscribe(cb: Listener) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
