/**
 * Overlay a second strategy run (lane B) onto the primary result for compare paint.
 */
import type { BacktestEvent, BacktestResult, BacktestZone } from '@/types/backtest';

function tagLane(
  events: readonly BacktestEvent[] | undefined,
  lane: 'a' | 'b',
): BacktestEvent[] {
  if (!events?.length) return [];
  return events.map((e) => ({
    ...e,
    id: `${lane}:${e.id}`,
    lane,
    label: lane === 'b' ? `B·${e.label}` : e.label,
  }));
}

function tagZones(
  zones: readonly BacktestZone[] | undefined,
  lane: 'a' | 'b',
): BacktestZone[] {
  if (!zones?.length) return [];
  return zones.map((z) => ({
    ...z,
    id: `${lane}:${z.id}`,
    lane,
  }));
}

/** Merge A (primary) + B (compare) for chart overlay. Stats stay on A. */
export function mergeAbResults(
  primary: BacktestResult,
  compare: BacktestResult,
): BacktestResult {
  return {
    ...primary,
    events: [
      ...tagLane(primary.events, 'a'),
      ...tagLane(compare.events, 'b'),
    ],
    zones: [
      ...tagZones(primary.zones, 'a'),
      ...tagZones(compare.zones, 'b'),
    ],
    strategyName: primary.strategyName
      ? `${primary.strategyName} vs ${compare.strategyName ?? 'B'}`
      : primary.strategyName,
  };
}
