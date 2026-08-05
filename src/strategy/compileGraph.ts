/**
 * Validate ReactFlow puzzle → Worker-safe CompiledGraph.
 */
import type { Edge, Node } from 'reactflow';
import type { Timeframe } from '@/types/ui';
import {
  isPieceData,
  isRiskKind,
  isSectionData,
  type CompiledEdge,
  type CompiledGraph,
  type CompiledPiece,
  type GraphValidationIssue,
  type PieceKind,
} from '@/strategy/graphTypes';
import { getPieceDef, isLogicKind } from '@/strategy/pieceRegistry';

export interface CompileResult {
  ok: boolean;
  graph: CompiledGraph | null;
  issues: GraphValidationIssue[];
  requiredTimeframes: Timeframe[];
}

function asPieceKind(raw: string): PieceKind | null {
  return getPieceDef(raw as PieceKind) ? (raw as PieceKind) : null;
}

function hasCycle(ids: Set<string>, edges: CompiledEdge[]): boolean {
  const outs = new Map<string, string[]>();
  for (const id of ids) outs.set(id, []);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    outs.get(e.source)!.push(e.target);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (u: string): boolean => {
    const s = state.get(u) ?? 0;
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(u, 1);
    for (const v of outs.get(u) ?? []) {
      if (visit(v)) return true;
    }
    state.set(u, 2);
    return false;
  };
  for (const id of ids) {
    if (visit(id)) return true;
  }
  return false;
}

function reachableFrom(
  start: string,
  edges: CompiledEdge[],
  ids: Set<string>,
): Set<string> {
  const outs = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const list = outs.get(e.source) ?? [];
    list.push(e.target);
    outs.set(e.source, list);
  }
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    for (const v of outs.get(u) ?? []) stack.push(v);
  }
  return seen;
}

/** Compile + validate a strategy canvas. */
export function compileGraph(nodes: Node[], edges: Edge[]): CompileResult {
  const issues: GraphValidationIssue[] = [];
  let entryId: string | null = null;
  let exitId: string | null = null;
  const pieces: CompiledPiece[] = [];
  const pieceIds = new Set<string>();

  for (const n of nodes) {
    if (n.type === 'section' || isSectionData(n.data)) {
      const kind = isSectionData(n.data) ? n.data.kind : null;
      if (kind === 'entry') {
        if (entryId) {
          issues.push({ level: 'error', message: 'Multiple Entry boards', nodeId: n.id });
        }
        entryId = n.id;
      } else if (kind === 'exit') {
        if (exitId) {
          issues.push({ level: 'error', message: 'Multiple Exit boards', nodeId: n.id });
        }
        exitId = n.id;
      }
      continue;
    }

    if (n.type === 'piece' || isPieceData(n.data)) {
      if (!isPieceData(n.data)) {
        issues.push({
          level: 'error',
          message: 'Piece node missing data',
          nodeId: n.id,
        });
        continue;
      }
      const kind = asPieceKind(n.data.pieceKind);
      if (!kind) {
        issues.push({
          level: 'error',
          message: `Unknown piece kind: ${n.data.pieceKind}`,
          nodeId: n.id,
        });
        continue;
      }
      pieces.push({
        id: n.id,
        kind,
        params: { ...n.data.params },
        requiredTimeframe: n.data.requiredTimeframe ?? null,
        label: n.data.label || getPieceDef(kind)?.label || kind,
      });
      pieceIds.add(n.id);
      continue;
    }

    // Legacy unlabeled condition stubs — treat as errors for Run
    if (n.type === 'condition') {
      issues.push({
        level: 'error',
        message: 'Replace stub condition with a puzzle piece from the palette',
        nodeId: n.id,
      });
    }
  }

  if (!entryId) {
    issues.push({ level: 'error', message: 'Entry board is required' });
  }
  if (!exitId) {
    issues.push({ level: 'error', message: 'Exit board is required' });
  }

  const allIds = new Set<string>([...pieceIds]);
  if (entryId) allIds.add(entryId);
  if (exitId) allIds.add(exitId);

  const compiledEdges: CompiledEdge[] = [];
  for (const e of edges) {
    if (!e.source || !e.target) continue;
    if (!allIds.has(e.source) || !allIds.has(e.target)) {
      issues.push({
        level: 'warn',
        message: 'Edge references a missing node',
      });
      continue;
    }
    compiledEdges.push({ source: e.source, target: e.target });
  }

  // Logic arity (skip risk config nodes)
  const preds = new Map<string, string[]>();
  for (const p of pieces) preds.set(p.id, []);
  for (const e of compiledEdges) {
    if (!pieceIds.has(e.target)) continue;
    if (!pieceIds.has(e.source) && e.source !== entryId) continue;
    if (pieceIds.has(e.source)) {
      preds.get(e.target)!.push(e.source);
    }
  }
  for (const p of pieces) {
    if (isRiskKind(p.kind)) continue;
    const def = getPieceDef(p.kind);
    if (!def || !isLogicKind(p.kind)) continue;
    const ins = preds.get(p.id) ?? [];
    if (p.kind === 'not' && ins.length !== 1) {
      issues.push({
        level: 'error',
        message: 'NOT needs exactly one input',
        nodeId: p.id,
      });
    } else if (p.kind === 'xor' && ins.length !== 2) {
      issues.push({
        level: 'error',
        message: 'XOR needs exactly two inputs',
        nodeId: p.id,
      });
    } else if ((p.kind === 'and' || p.kind === 'or') && ins.length < 2) {
      issues.push({
        level: 'error',
        message: `${p.kind.toUpperCase()} needs at least two inputs`,
        nodeId: p.id,
      });
    } else if (ins.length > def.maxInputs) {
      issues.push({
        level: 'error',
        message: `Too many inputs on ${p.label}`,
        nodeId: p.id,
      });
    }
  }

  const conditionIds = new Set(
    pieces.filter((p) => !isRiskKind(p.kind)).map((p) => p.id),
  );
  if (entryId && conditionIds.size > 0) {
    const reach = reachableFrom(entryId, compiledEdges, allIds);
    const entryPieces = [...conditionIds].filter((id) => reach.has(id));
    if (entryPieces.length === 0) {
      issues.push({
        level: 'error',
        message: 'Connect at least one condition piece from Entry',
      });
    }
  } else if (conditionIds.size === 0) {
    issues.push({
      level: 'error',
      message: 'Add condition pieces and wire them from Entry',
    });
  }

  if (hasCycle(pieceIds, compiledEdges)) {
    issues.push({ level: 'error', message: 'Cycle detected in puzzle wiring' });
  }

  const requiredTimeframes = [
    ...new Set(
      pieces
        .map((p) => p.requiredTimeframe)
        .filter((tf): tf is Timeframe => !!tf),
    ),
  ];

  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length > 0 || !entryId || !exitId) {
    return { ok: false, graph: null, issues, requiredTimeframes };
  }

  // Risk nodes configure rules on the main thread — strip from Worker graph.
  const evalPieces = pieces.filter((p) => !isRiskKind(p.kind));
  const evalIds = new Set(evalPieces.map((p) => p.id));
  evalIds.add(entryId);
  evalIds.add(exitId);
  const evalEdges = compiledEdges.filter(
    (e) => evalIds.has(e.source) && evalIds.has(e.target),
  );

  return {
    ok: true,
    graph: {
      pieces: evalPieces,
      edges: evalEdges,
      entryId,
      exitId,
    },
    issues,
    requiredTimeframes,
  };
}

/** First mismatched required TF vs chart, if any. */
export function firstTfMismatch(
  required: Timeframe[],
  chartTf: Timeframe,
): Timeframe | null {
  return required.find((tf) => tf !== chartTf) ?? null;
}
