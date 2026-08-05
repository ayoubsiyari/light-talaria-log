/**
 * Puzzle-piece strategy graph — domain types for the Strategy Builder.
 * ReactFlow nodes carry these in `data`; layout stays on the node.
 */
import type { Timeframe } from '@/types/ui';

export type LogicKind = 'and' | 'or' | 'not' | 'xor';

export type ConditionKind =
  // Indicators / MA
  | 'sma_cross'
  | 'ema_cross'
  | 'wma_cross'
  | 'hma_cross'
  | 'donchian_break'
  | 'rsi_gate'
  | 'rsi_cross'
  | 'macd_cross'
  | 'macd_hist_flip'
  | 'bb_touch'
  | 'bb_squeeze'
  | 'bb_walk'
  | 'keltner_break'
  | 'envelopes_touch'
  | 'price_vs_ma'
  | 'ma_stack'
  | 'ma_slope'
  | 'stoch_cross'
  | 'stoch_gate'
  | 'atr_surge'
  | 'atr_compress'
  | 'momentum'
  | 'roc_extreme'
  | 'cci_gate'
  | 'cci_cross'
  | 'willr_gate'
  | 'adx_trend'
  | 'ao_cross'
  | 'supertrend_flip'
  | 'psar_flip'
  | 'ichimoku_tk_cross'
  | 'ichimoku_cloud'
  | 'trix_cross'
  | 'ppo_cross'
  | 'aroon_cross'
  | 'chop_filter'
  // Price / candle
  | 'candle_confirm'
  | 'engulfing'
  | 'pin_bar'
  | 'inside_bar'
  | 'outside_bar'
  | 'doji'
  | 'gap'
  | 'body_direction'
  | 'hh_ll'
  | 'hl_lh'
  | 'session_range_break'
  | 'morning_star'
  | 'evening_star'
  | 'three_soldiers'
  | 'three_crows'
  | 'harami'
  | 'piercing_dark'
  | 'marubozu'
  | 'spinning_top'
  | 'tweezer'
  | 'nr_bar'
  | 'wide_range_bar'
  | 'close_in_range'
  | 'rejection_wick'
  | 'two_bar_reversal'
  // Structure
  | 'fvg'
  | 'ifvg'
  | 'ote_touch'
  | 'bos_choch'
  | 'liquidity_sweep'
  | 'equal_highs_lows'
  | 'order_block'
  | 'displacement'
  | 'breaker_block'
  | 'premium_discount'
  | 'fib_touch'
  | 'retest_break'
  | 'swing_failure'
  | 'untapped_extreme'
  | 'mss'
  // Session / levels
  | 'killzone'
  | 'asian_range_break'
  | 'london_open_break'
  | 'ny_open_break'
  | 'prev_day_hl'
  | 'prev_week_hl'
  | 'week_open_break'
  | 'round_number'
  | 'day_of_week'
  | 'hour_window';

export type PieceKind = LogicKind | ConditionKind;

export type PieceCategory =
  | 'logic'
  | 'price'
  | 'indicator'
  | 'structure'
  | 'session';

export type PieceSide = 'buy' | 'sell' | 'either';

/** Params bag — keys validated per piece in the registry. */
export type PieceParams = Record<string, number | string | boolean>;

export interface PieceNodeData {
  pieceKind: PieceKind;
  label: string;
  params: PieceParams;
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
