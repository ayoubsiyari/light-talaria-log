/**
 * Sparse geometry overlays from puzzle detections (Worker-safe).
 * Prefers true zoneHints from evaluators; falls back to rising-edge pads.
 */
import type { ConditionEval } from '@/strategy/pieces/evalHelpers';
import type { CompiledGraph } from '@/strategy/graphTypes';
import type { BacktestZone, BacktestZoneKind } from '@/types/backtest';

const MAX_ZONES = 240;

/** Emit zones — evaluator geometry first, then coarse fallback. */
export function collectZonesFromLeaves(
  graph: CompiledGraph,
  leaves: Map<string, ConditionEval>,
  times: Float64Array,
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
): BacktestZone[] {
  const zones: BacktestZone[] = [];
  let seq = 0;
  const byId = new Map(graph.pieces.map((p) => [p.id, p]));

  for (const [id, ev] of leaves) {
    const piece = byId.get(id);
    if (!piece) continue;

    if (ev.zoneHints?.length) {
      for (const h of ev.zoneHints) {
        seq += 1;
        if (seq > MAX_ZONES) return zones;
        const i0 = Math.max(0, Math.min(times.length - 1, h.startIdx));
        const i1 = Math.max(i0, Math.min(times.length - 1, h.endIdx));
        zones.push({
          id: `z${seq}`,
          kind: h.kind as BacktestZoneKind,
          timeStart: times[i0]!,
          timeEnd: times[i1]!,
          priceHigh: h.priceHigh,
          priceLow: h.priceLow,
          side: h.side,
          label: ev.label || piece.label,
        });
      }
      continue;
    }

    const kind = piece.kind;
    const zoneKind: BacktestZoneKind | null =
      kind === 'fvg' || kind === 'ifvg'
        ? 'fvg'
        : kind === 'session_range_break' || kind === 'asian_range_break'
          ? 'orb'
          : kind === 'order_block' || kind === 'breaker_block'
            ? 'ob'
            : kind === 'fib_touch' ||
                kind === 'ote_touch' ||
                kind === 'premium_discount'
              ? 'fib'
              : kind === 'donchian_break'
                ? 'donchian'
                : kind === 'equal_highs_lows'
                  ? 'equal'
                  : kind.startsWith('htf_')
                    ? 'htf'
                    : null;
    if (!zoneKind) continue;

    const n = ev.flags.length;
    for (let i = 1; i < n; i++) {
      if (ev.flags[i] !== 1 || ev.flags[i - 1] === 1) continue;
      seq += 1;
      if (seq > MAX_ZONES) return zones;
      const span = Math.min(12, n - i);
      const end = Math.min(n - 1, i + span);
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = i; j <= end; j++) {
        hi = Math.max(hi, highs[j]!);
        lo = Math.min(lo, lows[j]!);
      }
      if (zoneKind === 'fib' || zoneKind === 'fvg') {
        const mid = closes[i]!;
        const pad = Math.max((hi - lo) * 0.15, Math.abs(mid) * 0.0002);
        hi = mid + pad;
        lo = mid - pad;
      }
      const side =
        ev.sides[i] === 2 ? 'sell' : ev.sides[i] === 1 ? 'buy' : undefined;
      zones.push({
        id: `z${seq}`,
        kind: zoneKind,
        timeStart: times[i]!,
        timeEnd: times[end]!,
        priceHigh: hi,
        priceLow: lo,
        side,
        label: ev.label || piece.label,
      });
    }
  }
  return zones;
}
