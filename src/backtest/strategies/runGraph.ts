/**
 * Puzzle-graph strategy — evaluates compiled piece AST per bar.
 * Emits entry/exit trades plus per-piece detection marks (rising edges).
 * Worker-only.
 */
import { runAutomation, type RawFlipSignal } from '@/backtest/automationEngine';
import { collectZonesFromLeaves } from '@/backtest/strategies/collectZones';
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
  BacktestZone,
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
  zones: BacktestZone[];
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
  byId: Map<string, CompiledPiece>,
): BacktestEvent[] {
  // Collect rising edges per piece, then round-robin so every piece can show.
  const perPiece: BacktestEvent[][] = [];
  for (const [id, ev] of leaves) {
    const piece = byId.get(id);
    const list: BacktestEvent[] = [];
    const n = ev.flags.length;
    for (let i = 1; i < n; i++) {
      if (ev.flags[i] !== 1 || ev.flags[i - 1] === 1) continue;
      const side = sideAt(ev, i);
      const name = ev.label || piece?.label || id;
      list.push({
        id: '',
        time: times[i]!,
        price: closes[i]!,
        kind: 'signal',
        label: name,
        side: side ?? undefined,
        pieceIds: [id],
        explain: `Detected: ${name}\nPiece id: ${id}${piece ? `\nKind: ${piece.kind}` : ''}`,
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
    return {
      trades: [],
      events: [],
      zones: [],
      equity: [],
      finalEquity: 1,
      totalPnl: 0,
    };
  }

  const series = { times, opens, highs, lows, closes };
  const leaves = evalAllConditions(graph.pieces, series);
  const { outs, ins, byId } = buildAdj(graph);

  type NodeEval = {
    ok: boolean;
    side: OrderSide | null;
    label: string;
    pieceIds: string[];
  };

  const memoKey = (id: string, i: number) => `${id}:${i}`;
  const memo = new Map<string, NodeEval>();

  const evalNode = (id: string, i: number): NodeEval => {
    const key = memoKey(id, i);
    const hit = memo.get(key);
    if (hit) return hit;

    const finish = (r: NodeEval): NodeEval => {
      memo.set(key, r);
      return r;
    };

    if (id === graph.entryId || id === graph.exitId) {
      const kids = (
        id === graph.entryId ? (outs.get(id) ?? []) : (ins.get(id) ?? [])
      ).filter((k) => byId.has(k));
      if (kids.length === 0) {
        return finish({ ok: false, side: null, label: '', pieceIds: [] });
      }
      let ok = true;
      let side: OrderSide | null = null;
      const labels: string[] = [];
      const pieceIds: string[] = [];
      for (const kid of kids) {
        const r = evalNode(kid, i);
        if (!r.ok) ok = false;
        if (r.ok && r.label) labels.push(r.label);
        if (r.ok) pieceIds.push(...r.pieceIds);
        if (r.side && !side) side = r.side;
      }
      return finish({
        ok,
        side,
        label: labels.join(' + '),
        pieceIds: [...new Set(pieceIds)],
      });
    }

    const piece = byId.get(id);
    if (!piece) {
      return finish({ ok: false, side: null, label: '', pieceIds: [] });
    }

    if (isLogicKind(piece.kind)) {
      const preds = (ins.get(id) ?? []).filter((p) => byId.has(p));
      if (piece.kind === 'not') {
        const child = preds[0];
        if (!child) {
          return finish({
            ok: false,
            side: null,
            label: piece.label,
            pieceIds: [],
          });
        }
        const r = evalNode(child, i);
        const ok = !r.ok;
        return finish({
          ok,
          side: r.side,
          label: ok ? `NOT(${r.label || piece.label})` : '',
          pieceIds: ok ? r.pieceIds : [],
        });
      }
      if (piece.kind === 'and') {
        let ok = preds.length > 0;
        let side: OrderSide | null = null;
        const labels: string[] = [];
        const pieceIds: string[] = [];
        for (const p of preds) {
          const r = evalNode(p, i);
          if (!r.ok) ok = false;
          if (r.ok && r.label) labels.push(r.label);
          if (r.ok) pieceIds.push(...r.pieceIds);
          if (r.side && !side) side = r.side;
        }
        return finish({
          ok,
          side,
          label: ok ? labels.join(' ∧ ') : '',
          pieceIds: ok ? [...new Set(pieceIds)] : [],
        });
      }
      if (piece.kind === 'xor') {
        const a = preds[0] ? evalNode(preds[0], i) : null;
        const b = preds[1] ? evalNode(preds[1], i) : null;
        const ok = !!(a && b && a.ok !== b.ok);
        const winner = ok ? (a!.ok ? a! : b!) : null;
        return finish({
          ok,
          side: winner?.side ?? null,
          label: winner ? `XOR(${winner.label})` : '',
          pieceIds: winner ? winner.pieceIds : [],
        });
      }
      let ok = false;
      let side: OrderSide | null = null;
      const labels: string[] = [];
      const pieceIds: string[] = [];
      for (const p of preds) {
        const r = evalNode(p, i);
        if (r.ok) {
          ok = true;
          if (r.label) labels.push(r.label);
          pieceIds.push(...r.pieceIds);
          if (r.side && !side) side = r.side;
        }
      }
      return finish({
        ok,
        side,
        label: ok ? labels.join(' ∨ ') : '',
        pieceIds: ok ? [...new Set(pieceIds)] : [],
      });
    }

    const leaf = leaves.get(id);
    if (!leaf) {
      return finish({
        ok: false,
        side: null,
        label: piece.label,
        pieceIds: [],
      });
    }
    const ok = leaf.flags[i] === 1;
    const side = ok ? sideAt(leaf, i) : null;
    return finish({
      ok,
      side,
      label: ok ? leaf.label : '',
      pieceIds: ok ? [id] : [],
    });
  };

  const explainFor = (
    kind: 'entry' | 'exit',
    label: string,
    pieceIds: string[],
  ): string => {
    const lines = [
      kind === 'entry' ? `Entry because: ${label || 'signal'}` : `Exit because: ${label || 'signal'}`,
    ];
    if (pieceIds.length) {
      const names = pieceIds.map((pid) => {
        const p = byId.get(pid);
        return p ? `${p.label} (${p.kind})` : pid;
      });
      lines.push(`Contributing pieces (${names.length}):`);
      for (const n of names) lines.push(`• ${n}`);
    }
    return lines.join('\n');
  };

  const signals: RawFlipSignal[] = [];
  let prevEntry = false;
  let prevExit = false;

  for (let i = 1; i < n; i++) {
    const entry = evalNode(graph.entryId, i);
    const exit = evalNode(graph.exitId, i);

    if (entry.ok && !prevEntry) {
      const label = entry.label || 'Entry';
      signals.push({
        i,
        side: entry.side ?? 'buy',
        label,
        pieceIds: entry.pieceIds,
        explain: explainFor('entry', label, entry.pieceIds),
      });
    } else if (exit.ok && !prevExit) {
      const label = exit.label || 'Exit';
      signals.push({
        i,
        side: exit.side ?? 'sell',
        label,
        exitOnly: true,
        pieceIds: exit.pieceIds,
        explain: explainFor('exit', label, exit.pieceIds),
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

  const detects = collectDetectionMarks(leaves, times, closes, byId);
  const zones = collectZonesFromLeaves(
    graph,
    leaves,
    times,
    highs,
    lows,
    closes,
  );

  const events = [...auto.events, ...detects];

  return {
    trades: auto.trades,
    events,
    zones,
    equity: auto.equity,
    finalEquity: auto.finalEquity,
    totalPnl: auto.totalPnl,
  };
}
