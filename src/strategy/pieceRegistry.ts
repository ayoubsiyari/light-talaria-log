/**
 * Puzzle piece catalog — labels, categories, default params, TF hints.
 */
import type { Timeframe } from '@/types/ui';
import type {
  PieceCategory,
  PieceKind,
  PieceParams,
} from '@/strategy/graphTypes';

export type ParamFieldType = 'number' | 'select' | 'boolean';

export interface ParamField {
  key: string;
  label: string;
  type: ParamFieldType;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export interface PieceDefinition {
  kind: PieceKind;
  label: string;
  shortLabel: string;
  category: PieceCategory;
  description: string;
  /** Suggested / locked TF for this piece (user can override in inspector). */
  defaultRequiredTimeframe: Timeframe | null;
  /** Max inputs for logic; conditions ignore this. */
  maxInputs: number;
  params: ParamField[];
  defaults: PieceParams;
}

const SIDE_OPTIONS = [
  { value: 'buy', label: 'Buy / long' },
  { value: 'sell', label: 'Sell / short' },
  { value: 'either', label: 'Either' },
];

const REF_OPTIONS = [
  { value: 'close', label: 'Close' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
];

export const PIECE_REGISTRY: PieceDefinition[] = [
  {
    kind: 'and',
    label: 'AND',
    shortLabel: 'AND',
    category: 'logic',
    description: 'All connected inputs must be true.',
    defaultRequiredTimeframe: null,
    maxInputs: 8,
    params: [],
    defaults: {},
  },
  {
    kind: 'or',
    label: 'OR',
    shortLabel: 'OR',
    category: 'logic',
    description: 'Any connected input may be true.',
    defaultRequiredTimeframe: null,
    maxInputs: 8,
    params: [],
    defaults: {},
  },
  {
    kind: 'not',
    label: 'NOT',
    shortLabel: 'NOT',
    category: 'logic',
    description: 'Inverts a single input.',
    defaultRequiredTimeframe: null,
    maxInputs: 1,
    params: [],
    defaults: {},
  },
  {
    kind: 'sma_cross',
    label: 'SMA cross',
    shortLabel: 'SMA×',
    category: 'indicator',
    description: 'Fast SMA crosses above/below slow SMA.',
    defaultRequiredTimeframe: null,
    maxInputs: 0,
    params: [
      { key: 'fastPeriod', label: 'Fast', type: 'number', min: 2, max: 200, step: 1 },
      { key: 'slowPeriod', label: 'Slow', type: 'number', min: 3, max: 400, step: 1 },
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
    ],
    defaults: { fastPeriod: 10, slowPeriod: 30, side: 'either' },
  },
  {
    kind: 'donchian_break',
    label: 'Donchian break',
    shortLabel: 'Don',
    category: 'indicator',
    description: 'Break of N-bar high (buy) or low (sell).',
    defaultRequiredTimeframe: null,
    maxInputs: 0,
    params: [
      { key: 'period', label: 'Period', type: 'number', min: 2, max: 200, step: 1 },
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
    ],
    defaults: { period: 20, side: 'either' },
  },
  {
    kind: 'rsi_gate',
    label: 'RSI gate',
    shortLabel: 'RSI',
    category: 'indicator',
    description: 'RSI below (buy) or above (sell) a level.',
    defaultRequiredTimeframe: null,
    maxInputs: 0,
    params: [
      { key: 'period', label: 'Period', type: 'number', min: 2, max: 100, step: 1 },
      { key: 'level', label: 'Level', type: 'number', min: 1, max: 99, step: 1 },
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
    ],
    defaults: { period: 14, level: 30, side: 'buy' },
  },
  {
    kind: 'candle_confirm',
    label: 'Candle confirm',
    shortLabel: 'Candle',
    category: 'price',
    description: 'N consecutive bars close above/below prior extreme.',
    defaultRequiredTimeframe: null,
    maxInputs: 0,
    params: [
      { key: 'bars', label: 'Bars', type: 'number', min: 1, max: 5, step: 1 },
      { key: 'ref', label: 'Reference', type: 'select', options: REF_OPTIONS },
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
    ],
    defaults: { bars: 2, ref: 'close', side: 'buy' },
  },
  {
    kind: 'session_range_break',
    label: 'Session range break',
    shortLabel: 'ORB',
    category: 'price',
    description: 'Break of the first N bars’ high/low (open-range style).',
    defaultRequiredTimeframe: '5m',
    maxInputs: 0,
    params: [
      { key: 'rangeBars', label: 'Range bars', type: 'number', min: 1, max: 60, step: 1 },
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
    ],
    defaults: { rangeBars: 6, side: 'either' },
  },
  {
    kind: 'fvg',
    label: 'Fair value gap',
    shortLabel: 'FVG',
    category: 'structure',
    description: '3-candle imbalance; price still inside the gap.',
    defaultRequiredTimeframe: '15m',
    maxInputs: 0,
    params: [
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
      { key: 'lookback', label: 'Lookback', type: 'number', min: 3, max: 100, step: 1 },
    ],
    defaults: { side: 'buy', lookback: 20 },
  },
  {
    kind: 'ifvg',
    label: 'Inversion FVG',
    shortLabel: 'IFVG',
    category: 'structure',
    description: 'Prior FVG that has been traded through (inverted).',
    defaultRequiredTimeframe: '15m',
    maxInputs: 0,
    params: [
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
      { key: 'lookback', label: 'Lookback', type: 'number', min: 3, max: 100, step: 1 },
    ],
    defaults: { side: 'buy', lookback: 20 },
  },
  {
    kind: 'ote_touch',
    label: 'OTE touch',
    shortLabel: 'OTE',
    category: 'structure',
    description: 'Retrace into 62–79% of recent swing (optimal trade entry zone).',
    defaultRequiredTimeframe: '15m',
    maxInputs: 0,
    params: [
      { key: 'swingLookback', label: 'Swing bars', type: 'number', min: 5, max: 100, step: 1 },
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
    ],
    defaults: { swingLookback: 20, side: 'buy' },
  },
  {
    kind: 'bos_choch',
    label: 'BOS / CHoCH',
    shortLabel: 'BOS',
    category: 'structure',
    description: 'Break of prior swing high/low (structure shift).',
    defaultRequiredTimeframe: '15m',
    maxInputs: 0,
    params: [
      { key: 'swingLookback', label: 'Swing bars', type: 'number', min: 3, max: 80, step: 1 },
      { key: 'side', label: 'Side', type: 'select', options: SIDE_OPTIONS },
    ],
    defaults: { swingLookback: 10, side: 'either' },
  },
];

const BY_KIND = new Map(PIECE_REGISTRY.map((p) => [p.kind, p]));

export function getPieceDef(kind: PieceKind): PieceDefinition | undefined {
  return BY_KIND.get(kind);
}

export function isLogicKind(kind: PieceKind): boolean {
  return kind === 'and' || kind === 'or' || kind === 'not';
}

export const PIECE_CATEGORIES: { id: PieceCategory; label: string }[] = [
  { id: 'logic', label: 'Logic' },
  { id: 'price', label: 'Price / candle' },
  { id: 'indicator', label: 'Indicators' },
  { id: 'structure', label: 'Structure' },
];

export function createPieceData(kind: PieceKind): {
  pieceKind: PieceKind;
  label: string;
  params: PieceParams;
  requiredTimeframe: Timeframe | null;
} {
  const def = getPieceDef(kind);
  if (!def) {
    return {
      pieceKind: kind,
      label: kind,
      params: {},
      requiredTimeframe: null,
    };
  }
  return {
    pieceKind: kind,
    label: def.label,
    params: { ...def.defaults },
    requiredTimeframe: def.defaultRequiredTimeframe,
  };
}
