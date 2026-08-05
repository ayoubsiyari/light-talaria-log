/**
 * Puzzle-piece strategy graph — domain types for the Strategy Builder.
 * ReactFlow nodes carry these in `data`; layout stays on the node.
 */
import type { Timeframe } from '@/types/ui';

export type LogicKind = 'and' | 'or' | 'not';

export type ConditionKind =
  | 'sma_cross'
  | 'donchian_break'
  | 'rsi_gate'
  | 'candle_confirm'
  | 'session_range_break'
  | 'fvg'
  | 'ifvg'
  | 'ote_touch'
  | 'bos_choch';

export type PieceKind = LogicKind | ConditionKind;

export type PieceCategory = 'logic' | 'price' | 'indicator' | 'structure';

export type PieceSide = 'buy' | 'sell' | 'either';

/** Params bag — keys validated per piece in the registry. */
export type PieceParams = Record<string, number | string | boolean>;

export interface PieceNodeData {
  pieceKind: PieceKind;
  label: string;
  params: PieceParams;
  /** When set, Run may ask the user to switch chart TF. */
  requiredTimeframe?: Timeframe | null;
}

export interface SectionNodeData {
  label: string;
  kind: 'entry' | 'exit';
}

export type StrategyNodeData = PieceNodeData | SectionNodeData;

export function isPieceData(d: unknown): d is PieceNodeData {
  return (
    !!d &&
    typeof d === 'object' &&
    typeof (d as PieceNodeData).pieceKind === 'string' &&
    typeof (d as PieceNodeData).label === 'string'
  );
}

export function isSectionData(d: unknown): d is SectionNodeData {
  return (
    !!d &&
    typeof d === 'object' &&
    ((d as SectionNodeData).kind === 'entry' ||
      (d as SectionNodeData).kind === 'exit')
  );
}

/** Serializable graph for the Worker (no ReactFlow layout). */
export interface CompiledPiece {
  id: string;
  kind: PieceKind;
  params: PieceParams;
  requiredTimeframe?: Timeframe | null;
  label: string;
}

export interface CompiledEdge {
  source: string;
  target: string;
}

export interface CompiledGraph {
  pieces: CompiledPiece[];
  edges: CompiledEdge[];
  entryId: string;
  exitId: string;
}

export interface GraphValidationIssue {
  level: 'error' | 'warn';
  message: string;
  nodeId?: string;
}
