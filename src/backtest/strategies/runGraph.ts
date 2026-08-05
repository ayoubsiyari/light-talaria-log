/**
 * Puzzle-graph strategy — evaluates compiled piece AST per bar.
 * Emits entry/exit trades plus per-piece detection marks (rising edges).
 * Worker-only.
 */
import { runAutomation, type RawFlipSignal } from '@/backtest/automationEngine';
import {
  evalAllConditions,
  sideAt,
  type ConditionEval,
} from '@/strategy/pieces/evalConditions';
import type { CompiledGraph, CompiledPiece } from '@/strategy/graphTypes';
import { isLogicKind } from '@/strategy/pieceRegistry';
import type {
  AutomationRules,
  BacktestCostParams,
  BacktestEvent,
  BacktestTrade,
  EquityPoint,
} from '@/types/backtest';
import type { OrderSide } from '@/types/order';

/** Cap piece-detection chips so the chart stays readable. */
const MAX_DETECT_MARKS = 2000;

export interface RunGraphInput {
  times: Float64Array;
  opens: Float32Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  graph: CompiledGraph;
  costs: BacktestCostParams;
  rules: AutomationRules;
}

export interface RunGraphOutput {
  trades: BacktestTrade[];
  events: BacktestEvent[];
  equity: EquityPoint[];
  finalEquity: number;
  totalPnl: number;
}

function buildAdj(graph: CompiledGraph): {
  outs: Map<string, string[]>;
  ins: Map<string, string[]>;
  byId: Map<string, CompiledPiece>;
} {
  const outs = new Map<string, string[]>();
  const ins = new Map<string, string[]>();
  const byId = new Map(graph.pieces.map((p) => [p.id, p]));
  const touch = (m: Map<string, string[]>, k: string) => {
    if (!m.has(k)) m.set(k, []);
  };
  touch(outs, graph.entryId);
  touch(outs, graph.exitId);
  touch(ins, graph.entryId);
  touch(ins, graph.exitId);
  for (const p of graph.pieces) {
    touch(outs, p.id);
    touch(ins, p.id);
  }
  for (const e of graph.edges) {
    outs.get(e.source)?.push(e.target);
    ins.get(e.target)?.push(e.source);
  }
  return { outs, ins, byId };
}

function collectDetectionMarks(
  leaves: Map<string, ConditionEval>,
  times: Float64Array,
  closes: Float32Array,
): BacktestEvent[] {
  // Collect rising edges per piece, then round-robin so every piece can show.
  const perPiece: BacktestEvent[][] = [];
  for (const [, ev] of leaves) {
    const list: BacktestEvent[] = [];
    const n = ev.flags.length;
    for (let i = 1; i < n; i++) {
      if (ev.flags[i] !== 1 || ev.flags[i - 1] === 1) continue;
      const side = sideAt(ev, i);
      list.push({
        id: '',
        time: times[i]!,
        price: closes[i]!,
        kind: 'signal',
        label: ev.label,
        side: side ?? undefined,
      });
    }
    if (list.length) perPiece.push(list);
  }

  const events: BacktestEvent[] = [];
  let seq = 0;
  let idx = 0;
  let progress = true;
  while (progress && seq < MAX_DETECT_MARKS) {
    progress = false;
    for (const list of perPiece) {
      if (idx >= list.length) continue;
      seq += 1;
      const ev = list[idx]!;
      events.push({ ...ev, id: `d${seq}` });
      progress = true;
      if (seq >= MAX_DETECT_MARKS) break;
    }
    idx += 1;
  }
  events.sort((a, b) => a.time - b.time);
  return events;
}

export function runGraphStrategy(input: RunGraphInput): RunGraphOutput {
  const { times, opens, highs, lows, closes, graph, costs, rules } = input;
  const n = closes.length;
  if (n === 0 || graph.pieces.length === 0) {
    return { trades: [], events: [], equity: [], finalEquity: 1, totalPnl: 0 };
  }

  const series = { times, opens, highs, lows, closes };
  const leaves = evalAllConditions(graph.pieces, series);
  const { outs, ins, byId } = buildAdj(graph);

  const memoKey = (id: string, i: number) => `${id}:${i}`;
  const boolMemo = new Map<string, boolean>();
  const sideMemo = new Map<string, OrderSide | null>();
  const labelMemo = new Map<string, string>();

  const evalNode = (
    id: string,
    i: number,
  ): { ok: boolean; side: OrderSide | null; label: string } => {
    const key = memoKey(id, i);
    if (boolMemo.has(key)) {
      return {
        ok: boolMemo.get(key)!,
        side: sideMemo.get(key) ?? null,
        label: labelMemo.get(key) ?? '',
      };
    }

    if (id === graph.entryId || id === graph.exitId) {
      const kids = (
        id === graph.entryId ? (outs.get(id) ?? []) : (ins.get(id) ?? [])
      ).filter((k) => byId.has(k));
      if (kids.length === 0) {
        boolMemo.set(key, false);
        sideMemo.set(key, null);
        labelMemo.set(key, '');
        return { ok: false, side: null, label: '' };
      }
      let ok = true;
      let side: OrderSide | null = null;
      const labels: string[] = [];
      for (const kid of kids) {
        const r = evalNode(kid, i);
        if (!r.ok) ok = false;
        if (r.ok && r.label) labels.push(r.label);
        if (r.side && !side) side = r.side;
      }
      const label = labels.join(' + ');
      boolMemo.set(key, ok);
      sideMemo.set(key, side);
      labelMemo.set(key, label);
      return { ok, side, label };
    }

    const piece = byId.get(id);
    if (!piece) {
      boolMemo.set(key, false);
      return { ok: false, side: null, label: '' };
    }

    if (isLogicKind(piece.kind)) {
      const preds = (ins.get(id) ?? []).filter((p) => byId.has(p));
      if (piece.kind === 'not') {
        const child = preds[0];
        if (!child) {
          boolMemo.set(key, false);
          return { ok: false, side: null, label: piece.label };
        }
        const r = evalNode(child, i);
        const ok = !r.ok;
        boolMemo.set(key, ok);
        sideMemo.set(key, r.side);
        labelMemo.set(key, ok ? `NOT(${r.label || piece.label})` : '');
        return {
          ok,
          side: r.side,
          label: ok ? `NOT(${r.label || piece.label})` : '',
        };
      }
      if (piece.kind === 'and') {
        let ok = preds.length > 0;
        let side: OrderSide | null = null;
        const labels: string[] = [];
        for (const p of preds) {
          const r = evalNode(p, i);
          if (!r.ok) ok = false;
          if (r.ok && r.label) labels.push(r.label);
          if (r.side && !side) side = r.side;
        }
        const label = labels.join(' ∧ ');
        boolMemo.set(key, ok);
        sideMemo.set(key, side);
        labelMemo.set(key, ok ? label : '');
        return { ok, side, label: ok ? label : '' };
      }
      if (piece.kind === 'xor') {
        const a = preds[0] ? evalNode(preds[0], i) : null;
        const b = preds[1] ? evalNode(preds[1], i) : null;
        const ok = !!(a && b && a.ok !== b.ok);
        const side = ok ? (a!.ok ? a!.side : b!.side) : null;
        const label = ok
          ? `XOR(${a!.ok ? a!.label : b!.label})`
          : '';
        boolMemo.set(key, ok);
        sideMemo.set(key, side);
        labelMemo.set(key, label);
        return { ok, side, label };
      }
      let ok = false;
      let side: OrderSide | null = null;
      const labels: string[] = [];
      for (const p of preds) {
        const r = evalNode(p, i);
        if (r.ok) {
          ok = true;
          if (r.label) labels.push(r.label);
          if (r.side && !side) side = r.side;
        }
      }
      const label = labels.join(' ∨ ');
      boolMemo.set(key, ok);
      sideMemo.set(key, side);
      labelMemo.set(key, ok ? label : '');
      return { ok, side, label: ok ? label : '' };
    }

    const leaf = leaves.get(id);
    if (!leaf) {
      boolMemo.set(key, false);
      return { ok: false, side: null, label: piece.label };
    }
    const ok = leaf.flags[i] === 1;
    const side = ok ? sideAt(leaf, i) : null;
    boolMemo.set(key, ok);
    sideMemo.set(key, side);
    labelMemo.set(key, ok ? leaf.label : '');
    return { ok, side, label: ok ? leaf.label : '' };
  };

  const signals: RawFlipSignal[] = [];
  let prevEntry = false;
  let prevExit = false;

  for (let i = 1; i < n; i++) {
    const entry = evalNode(graph.entryId, i);
    const exit = evalNode(graph.exitId, i);

    if (entry.ok && !prevEntry) {
      signals.push({
        i,
        side: entry.side ?? 'buy',
        label: entry.label || 'Entry',
      });
    } else if (exit.ok && !prevExit) {
      signals.push({
        i,
        side: exit.side ?? 'sell',
        label: exit.label || 'Exit',
        exitOnly: true,
      });
    }

    prevEntry = entry.ok;
    prevExit = exit.ok;
  }

  const auto = runAutomation({
    times,
    highs,
    lows,
    closes,
    signals,
    costs,
    rules,
    trendPeriod: 30,
  });

  const detects = collectDetectionMarks(leaves, times, closes);
  // Trade entry/exit first, then piece detections (chart draws all)
  const events = [...auto.events, ...detects];

  return {
    trades: auto.trades,
    events,
    equity: auto.equity,
    finalEquity: auto.finalEquity,
    totalPnl: auto.totalPnl,
  };
}
