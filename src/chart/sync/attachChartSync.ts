import type { ChartBar } from '@/types/bar';
import {
  timeRangeFromVisible,
  visibleRangeFromTimeWindow,
} from '@/data/timeframeAgg';
import type { ChartInstance } from '../createChart';
import type { CrosshairPoint } from '../types';
import type {
  ChartId,
  ChartSyncStore,
  SyncCrosshair,
  SyncTimeRange,
} from './chartSyncStore';

type ChartWithCrosshairLogical = ChartInstance & {
  setCrosshairLogical: (crosshair: SyncCrosshair | null) => void;
};

function hasSetCrosshairLogical(chart: ChartInstance): chart is ChartWithCrosshairLogical {
  return (
    'setCrosshairLogical' in chart &&
    typeof (chart as ChartWithCrosshairLogical).setCrosshairLogical === 'function'
  );
}

function pointToSyncCrosshair(point: CrosshairPoint): SyncCrosshair {
  return {
    time: point.time,
    price: point.price,
    index: point.barIndex ?? point.index,
  };
}

function timeRangesEqual(a: SyncTimeRange | null, b: SyncTimeRange | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  // Sub-ms noise from float round-trips shouldn't thrash slaves
  return (
    Math.abs(a.fromTime - b.fromTime) < 1e-6 && Math.abs(a.toTime - b.toTime) < 1e-6
  );
}

function crosshairsEqual(a: SyncCrosshair | null, b: SyncCrosshair | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.time === b.time && a.price === b.price;
}

export interface AttachChartSyncOptions {
  /** Current pane bars (may change when TF switches). */
  getBars: () => readonly ChartBar[];
  /** Layout sync: crosshair (default true). */
  getSyncCrosshair?: () => boolean;
  /** Layout sync: date range / visible window (default true). */
  getSyncDateRange?: () => boolean;
}

/**
 * Bidirectional sync: chart ↔ store via continuous wall-clock time.
 *
 * Publishes at most once per animation frame so multi-pane slaves track
 * smoothly without flooding. Remote apply is silent (no echo).
 */
export function attachChartSync(
  chart: ChartInstance,
  chartId: ChartId,
  store: ChartSyncStore,
  options: AttachChartSyncOptions,
): () => void {
  /** True while applying store → chart (suppresses echo publish). */
  let applyingRemote = false;
  let lastAppliedTimeRange: SyncTimeRange | null = null;
  let lastAppliedCrosshair: SyncCrosshair | null = null;
  let pendingPublish: SyncTimeRange | null = null;
  let pendingCrosshair: SyncCrosshair | null | undefined = undefined;
  let publishRaf = 0;

  const flushPublish = () => {
    publishRaf = 0;
    if (applyingRemote) {
      pendingPublish = null;
      pendingCrosshair = undefined;
      return;
    }

    const syncRange = options.getSyncDateRange?.() ?? true;
    const syncCrosshair = options.getSyncCrosshair?.() ?? true;

    const timeRange = pendingPublish;
    pendingPublish = null;
    if (
      syncRange &&
      timeRange &&
      !timeRangesEqual(timeRange, store.get().timeRange)
    ) {
      lastAppliedTimeRange = timeRange;
      store.setTimeRange(timeRange, chartId);
    }

    if (pendingCrosshair !== undefined) {
      const ch = pendingCrosshair;
      pendingCrosshair = undefined;
      if (
        syncCrosshair &&
        !crosshairsEqual(ch, store.get().crosshair)
      ) {
        lastAppliedCrosshair = ch;
        store.setCrosshair(ch, chartId);
      }
    }
  };

  const schedulePublish = () => {
    if (publishRaf === 0) {
      publishRaf = requestAnimationFrame(flushPublish);
    }
  };

  const unsubRange = chart.onVisibleRangeChange((range) => {
    if (applyingRemote) return;
    if (!(options.getSyncDateRange?.() ?? true)) return;
    const bars = options.getBars();
    const timeRange = timeRangeFromVisible(bars, range);
    if (!timeRange) return;
    if (timeRangesEqual(timeRange, store.get().timeRange)) return;
    pendingPublish = timeRange;
    schedulePublish();
  });

  const unsubCrosshair = chart.onCrosshairMove((point) => {
    if (applyingRemote) return;
    if (!(options.getSyncCrosshair?.() ?? true)) return;
    pendingCrosshair = point ? pointToSyncCrosshair(point) : null;
    schedulePublish();
  });

  const unsubStore = store.subscribe((state) => {
    if (state.origin === chartId) return;

    const bars = options.getBars();
    const syncRange = options.getSyncDateRange?.() ?? true;
    const syncCrosshair = options.getSyncCrosshair?.() ?? true;
    // Replay/session/TF-switch: App already set local ranges — don't remap by wall-clock.
    const applyRange =
      syncRange &&
      state.origin !== 'replay' &&
      state.origin !== 'session-load' &&
      state.origin !== 'tf-switch' &&
      state.timeRange != null &&
      !timeRangesEqual(state.timeRange, lastAppliedTimeRange);
    const crosshairChanged =
      syncCrosshair && !crosshairsEqual(state.crosshair, lastAppliedCrosshair);

    if (!applyRange && !crosshairChanged) return;

    applyingRemote = true;
    try {
      if (applyRange && state.timeRange && bars.length > 0) {
        const local = visibleRangeFromTimeWindow(
          bars,
          state.timeRange.fromTime,
          state.timeRange.toTime,
        );
        lastAppliedTimeRange = state.timeRange;
        // silent: remapped range must not echo back into the store
        chart.setVisibleRange(local.fromIndex, local.toIndex, { silent: true });
      }

      if (crosshairChanged && hasSetCrosshairLogical(chart)) {
        lastAppliedCrosshair = state.crosshair;
        chart.setCrosshairLogical(state.crosshair);
      }
    } finally {
      applyingRemote = false;
    }
  });

  return () => {
    if (publishRaf !== 0) {
      cancelAnimationFrame(publishRaf);
      publishRaf = 0;
    }
    unsubRange();
    unsubCrosshair();
    unsubStore();
  };
}
