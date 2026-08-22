import type { DrawingToolId, ToolCategoryId } from '@/drawings/toolRegistry';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';

/**
 * Multi-chart layouts (TradingView-style).
 * Letter suffix: h = columns, v = rows, r = main+right stack, b = main+bottom stack.
 * `'7'` / `'8'` are legacy only — picker + runtime clamp to `'6'`.
 */
export type ChartLayout =
  | '1'
  | '2h'
  | '2v'
  | '3h'
  | '3v'
  | '3r'
  | '3b'
  | '4'
  | '4h'
  | '4v'
  | '5'
  | '6'
  | '7'
  | '8';

/** Toolbar selection: cursor, a drawing tool, or a utility mode. */
export type ChartToolId = 'cursor' | 'zoom' | DrawingToolId;

export type { DrawingToolId, ToolCategoryId };

export type BottomTabId = 'all' | 'pending' | 'open' | 'history' | 'analytics';
