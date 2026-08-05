/**
 * Optional starter puzzles — examples only; fully editable after load.
 */
import type { Edge, Node } from 'reactflow';
import { createPieceData } from '@/strategy/pieceRegistry';

export interface StarterPuzzle {
  id: string;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  timeframes: string[];
  tags: string[];
}

function piece(
  id: string,
  kind: Parameters<typeof createPieceData>[0],
  x: number,
  y: number,
  patch?: Partial<ReturnType<typeof createPieceData>>,
): Node {
  const data = { ...createPieceData(kind), ...patch };
  return {
    id,
    type: 'piece',
    position: { x, y },
    data,
  };
}

const entryExit = (): Node[] => [
  {
    id: 'entry',
    type: 'section',
    position: { x: 40, y: 160 },
    data: { label: 'Entry', kind: 'entry' },
  },
  {
    id: 'exit',
    type: 'section',
    position: { x: 640, y: 160 },
    data: { label: 'Exit', kind: 'exit' },
  },
];

export const STARTER_PUZZLES: StarterPuzzle[] = [
  {
    id: 'sma-and-rsi',
    name: 'SMA cross + RSI gate',
    description: 'Classic: bullish SMA cross AND RSI oversold, exit on opposite cross.',
    timeframes: ['5m', '15m'],
    tags: ['starter', 'indicator'],
    nodes: [
      ...entryExit(),
      piece('p-sma', 'sma_cross', 220, 80, {
        params: { fastPeriod: 10, slowPeriod: 30, side: 'buy' },
      }),
      piece('p-rsi', 'rsi_gate', 220, 220, {
        params: { period: 14, level: 35, side: 'buy' },
      }),
      piece('p-and', 'and', 420, 140),
      piece('p-exit-sma', 'sma_cross', 420, 280, {
        label: 'SMA exit',
        params: { fastPeriod: 10, slowPeriod: 30, side: 'sell' },
      }),
    ],
    edges: [
      { id: 'e1', source: 'entry', target: 'p-and' },
      { id: 'e3', source: 'p-sma', target: 'p-and' },
      { id: 'e4', source: 'p-rsi', target: 'p-and' },
      { id: 'e6', source: 'p-exit-sma', target: 'exit' },
    ],
  },
  {
    id: 'range-break',
    name: 'Session range break',
    description: 'Break of the opening range (sample ORB-style piece).',
    timeframes: ['5m'],
    tags: ['starter', 'price'],
    nodes: [
      ...entryExit(),
      piece('p-orb', 'session_range_break', 280, 140, {
        requiredTimeframe: '5m',
        params: { rangeBars: 6, side: 'either' },
      }),
      piece('p-exit-don', 'donchian_break', 280, 280, {
        label: 'Donchian exit',
        params: { period: 20, side: 'either' },
      }),
    ],
    edges: [
      { id: 'e1', source: 'entry', target: 'p-orb' },
      { id: 'e2', source: 'p-exit-don', target: 'exit' },
    ],
  },
  {
    id: 'structure-sample',
    name: 'FVG + OTE sample',
    description: 'Structure pieces wired with AND — edit freely.',
    timeframes: ['15m', '1h'],
    tags: ['starter', 'structure'],
    nodes: [
      ...entryExit(),
      piece('p-fvg', 'fvg', 220, 100, {
        requiredTimeframe: '15m',
        params: { side: 'buy', lookback: 20 },
      }),
      piece('p-ote', 'ote_touch', 220, 240, {
        requiredTimeframe: '15m',
        params: { swingLookback: 20, side: 'buy' },
      }),
      piece('p-and', 'and', 420, 160),
      piece('p-exit-bos', 'bos_choch', 420, 300, {
        label: 'BOS exit',
        requiredTimeframe: '15m',
        params: { swingLookback: 10, side: 'sell' },
      }),
    ],
    edges: [
      { id: 'e1', source: 'entry', target: 'p-and' },
      { id: 'e3', source: 'p-fvg', target: 'p-and' },
      { id: 'e4', source: 'p-ote', target: 'p-and' },
      { id: 'e5', source: 'p-exit-bos', target: 'exit' },
    ],
  },
];
