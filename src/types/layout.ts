import type { ChartLayout } from '@/types/ui';

/** Sync options under the layout picker (Obsidian / Live). */
export interface LayoutSyncOptions {
  symbol: boolean;
  interval: boolean;
  crosshair: boolean;
  time: boolean;
  dateRange: boolean;
  drawings: boolean;
  indicators: boolean;
  chartType: boolean;
}

/** Independent panes by default — opt in to couple pan / time / crosshair. */
export const DEFAULT_LAYOUT_SYNC: LayoutSyncOptions = {
  symbol: false,
  interval: false,
  crosshair: true,
  time: false,
  dateRange: false,
  drawings: true,
  indicators: false,
  chartType: false,
};

export const LAYOUT_SYNC_ITEMS: {
  key: keyof LayoutSyncOptions;
  label: string;
  hint: string;
}[] = [
  { key: 'symbol', label: 'Symbol', hint: 'Same pair on every tile' },
  { key: 'interval', label: 'Interval', hint: 'Same timeframe' },
  { key: 'crosshair', label: 'Crosshair', hint: 'Shared crosshair' },
  { key: 'time', label: 'Time', hint: 'Scroll time together' },
  { key: 'dateRange', label: 'Date range', hint: 'Same visible range' },
  { key: 'drawings', label: 'Drawings', hint: 'Shared drawings' },
  { key: 'indicators', label: 'Indicators', hint: 'New studies fan out' },
  { key: 'chartType', label: 'Chart type', hint: 'Candles / area / …' },
];

export const LAYOUT_SYNC_HELP =
  'Replay playhead is always shared. Toggle what else stays aligned across tiles.';

/** Cell rects in a 0–1 unit square for drawing the layout icon. */
export type LayoutCell = { x: number; y: number; w: number; h: number };

export type LayoutLine = { x1: number; y1: number; x2: number; y2: number };

/**
 * Live Obsidian arrangement lines — index `n-1` → variants for n panels.
 * Used for thumb previews; selection maps to a ChartLayout id.
 */
export const LAYOUT_LY_LINES: LayoutLine[][][] = [
  [[]],
  [
    [{ x1: 0.5, y1: 0, x2: 0.5, y2: 1 }],
    [{ x1: 0, y1: 0.5, x2: 1, y2: 0.5 }],
  ],
  [
    [
      { x1: 0.333, y1: 0, x2: 0.333, y2: 1 },
      { x1: 0.667, y1: 0, x2: 0.667, y2: 1 },
    ],
    [
      { x1: 0, y1: 0.333, x2: 1, y2: 0.333 },
      { x1: 0, y1: 0.667, x2: 1, y2: 0.667 },
    ],
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0.5, y1: 0.5, x2: 1, y2: 0.5 },
    ],
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0, y1: 0.5, x2: 0.5, y2: 0.5 },
    ],
    [
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.5, y1: 0.5, x2: 0.5, y2: 1 },
    ],
    [
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.5, y1: 0, x2: 0.5, y2: 0.5 },
    ],
  ],
  [
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
    ],
    [
      { x1: 0, y1: 0.25, x2: 1, y2: 0.25 },
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0, y1: 0.75, x2: 1, y2: 0.75 },
    ],
    [
      { x1: 0.25, y1: 0, x2: 0.25, y2: 1 },
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0.75, y1: 0, x2: 0.75, y2: 1 },
    ],
    [
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.333, y1: 0, x2: 0.333, y2: 0.5 },
      { x1: 0.667, y1: 0, x2: 0.667, y2: 0.5 },
    ],
    [
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.333, y1: 0.5, x2: 0.333, y2: 1 },
      { x1: 0.667, y1: 0.5, x2: 0.667, y2: 1 },
    ],
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0.5, y1: 0.333, x2: 1, y2: 0.333 },
      { x1: 0.5, y1: 0.667, x2: 1, y2: 0.667 },
    ],
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0, y1: 0.333, x2: 0.5, y2: 0.333 },
      { x1: 0, y1: 0.667, x2: 0.5, y2: 0.667 },
    ],
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0.5, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.75, y1: 0.5, x2: 0.75, y2: 1 },
    ],
  ],
  // 5 panels (5 variants — engine still maps all → '5')
  [
    [
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.5, y1: 0, x2: 0.5, y2: 0.5 },
      { x1: 0.333, y1: 0.5, x2: 0.333, y2: 1 },
      { x1: 0.667, y1: 0.5, x2: 0.667, y2: 1 },
    ],
    [
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.333, y1: 0, x2: 0.333, y2: 0.5 },
      { x1: 0.667, y1: 0, x2: 0.667, y2: 0.5 },
      { x1: 0.5, y1: 0.5, x2: 0.5, y2: 1 },
    ],
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0.5, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0.75, y1: 0, x2: 0.75, y2: 1 },
    ],
    [
      { x1: 0.2, y1: 0, x2: 0.2, y2: 1 },
      { x1: 0.4, y1: 0, x2: 0.4, y2: 1 },
      { x1: 0.6, y1: 0, x2: 0.6, y2: 1 },
      { x1: 0.8, y1: 0, x2: 0.8, y2: 1 },
    ],
    [
      { x1: 0, y1: 0.2, x2: 1, y2: 0.2 },
      { x1: 0, y1: 0.4, x2: 1, y2: 0.4 },
      { x1: 0, y1: 0.6, x2: 1, y2: 0.6 },
      { x1: 0, y1: 0.8, x2: 1, y2: 0.8 },
    ],
  ],
  // 6 panels (4 variants → engine '6') — max supported layout
  [
    [
      { x1: 0.333, y1: 0, x2: 0.333, y2: 1 },
      { x1: 0.667, y1: 0, x2: 0.667, y2: 1 },
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
    ],
    [
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0, y1: 0.333, x2: 1, y2: 0.333 },
      { x1: 0, y1: 0.667, x2: 1, y2: 0.667 },
    ],
    [
      { x1: 0.167, y1: 0, x2: 0.167, y2: 1 },
      { x1: 0.333, y1: 0, x2: 0.333, y2: 1 },
      { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      { x1: 0.667, y1: 0, x2: 0.667, y2: 1 },
      { x1: 0.833, y1: 0, x2: 0.833, y2: 1 },
    ],
    [
      { x1: 0, y1: 0.167, x2: 1, y2: 0.167 },
      { x1: 0, y1: 0.333, x2: 1, y2: 0.333 },
      { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      { x1: 0, y1: 0.667, x2: 1, y2: 0.667 },
      { x1: 0, y1: 0.833, x2: 1, y2: 0.833 },
    ],
  ],
];

/** Hard cap — 7/8 were too heavy for multi-pane Play. */
export const MAX_LAYOUT_PANELS = 6;

/** Collapse legacy 7/8 (and any future oversize) onto 6. */
export function clampChartLayout(layout: ChartLayout | string): ChartLayout {
  if (layout === '7' || layout === '8') return '6';
  const n = Number(layout);
  if (Number.isFinite(n) && n > MAX_LAYOUT_PANELS) return '6';
  return layout as ChartLayout;
}

/** Map Live (panelCount, variantIndex) → our ChartLayout engine id. */
export function layoutIdForVariant(n: number, li: number): ChartLayout {
  const panels = Math.min(MAX_LAYOUT_PANELS, Math.max(1, Math.floor(n)));
  if (panels <= 1) return '1';
  if (panels === 2) return li === 1 ? '2v' : '2h';
  if (panels === 3) {
    const map: ChartLayout[] = ['3h', '3v', '3r', '3r', '3b', '3b'];
    return map[li] ?? '3r';
  }
  if (panels === 4) {
    const map: ChartLayout[] = ['4', '4v', '4h', '4', '4', '4', '4', '4'];
    return map[li] ?? '4';
  }
  if (panels === 5) return '5';
  return '6';
}

/** Best-effort reverse: which variant thumb is active for a ChartLayout. */
export function variantIndexForLayout(layout: ChartLayout): {
  n: number;
  li: number;
} {
  switch (clampChartLayout(layout)) {
    case '1':
      return { n: 1, li: 0 };
    case '2h':
      return { n: 2, li: 0 };
    case '2v':
      return { n: 2, li: 1 };
    case '3h':
      return { n: 3, li: 0 };
    case '3v':
      return { n: 3, li: 1 };
    case '3r':
      return { n: 3, li: 2 };
    case '3b':
      return { n: 3, li: 4 };
    case '4':
      return { n: 4, li: 0 };
    case '4v':
      return { n: 4, li: 1 };
    case '4h':
      return { n: 4, li: 2 };
    case '5':
      return { n: 5, li: 0 };
    case '6':
      return { n: 6, li: 0 };
    default:
      return { n: 1, li: 0 };
  }
}

export interface LayoutOption {
  id: ChartLayout;
  panes: number;
  cells: LayoutCell[];
}

/** Legacy catalog (still used by cellsForLayout / Compact glyphs). */
export const LAYOUT_ROWS: { panes: number; options: LayoutOption[] }[] = [
  {
    panes: 1,
    options: [{ id: '1', panes: 1, cells: [{ x: 0, y: 0, w: 1, h: 1 }] }],
  },
  {
    panes: 2,
    options: [
      {
        id: '2h',
        panes: 2,
        cells: [
          { x: 0, y: 0, w: 0.5, h: 1 },
          { x: 0.5, y: 0, w: 0.5, h: 1 },
        ],
      },
      {
        id: '2v',
        panes: 2,
        cells: [
          { x: 0, y: 0, w: 1, h: 0.5 },
          { x: 0, y: 0.5, w: 1, h: 0.5 },
        ],
      },
    ],
  },
  {
    panes: 3,
    options: [
      {
        id: '3h',
        panes: 3,
        cells: [
          { x: 0, y: 0, w: 1 / 3, h: 1 },
          { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
          { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
        ],
      },
      {
        id: '3v',
        panes: 3,
        cells: [
          { x: 0, y: 0, w: 1, h: 1 / 3 },
          { x: 0, y: 1 / 3, w: 1, h: 1 / 3 },
          { x: 0, y: 2 / 3, w: 1, h: 1 / 3 },
        ],
      },
      {
        id: '3r',
        panes: 3,
        cells: [
          { x: 0, y: 0, w: 0.5, h: 1 },
          { x: 0.5, y: 0, w: 0.5, h: 0.5 },
          { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        ],
      },
      {
        id: '3b',
        panes: 3,
        cells: [
          { x: 0, y: 0, w: 1, h: 0.5 },
          { x: 0, y: 0.5, w: 0.5, h: 0.5 },
          { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        ],
      },
    ],
  },
  {
    panes: 4,
    options: [
      {
        id: '4',
        panes: 4,
        cells: [
          { x: 0, y: 0, w: 0.5, h: 0.5 },
          { x: 0.5, y: 0, w: 0.5, h: 0.5 },
          { x: 0, y: 0.5, w: 0.5, h: 0.5 },
          { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        ],
      },
      {
        id: '4h',
        panes: 4,
        cells: [
          { x: 0, y: 0, w: 0.25, h: 1 },
          { x: 0.25, y: 0, w: 0.25, h: 1 },
          { x: 0.5, y: 0, w: 0.25, h: 1 },
          { x: 0.75, y: 0, w: 0.25, h: 1 },
        ],
      },
      {
        id: '4v',
        panes: 4,
        cells: [
          { x: 0, y: 0, w: 1, h: 0.25 },
          { x: 0, y: 0.25, w: 1, h: 0.25 },
          { x: 0, y: 0.5, w: 1, h: 0.25 },
          { x: 0, y: 0.75, w: 1, h: 0.25 },
        ],
      },
    ],
  },
];

export function cellsForLayout(id: ChartLayout): LayoutCell[] {
  for (const row of LAYOUT_ROWS) {
    const hit = row.options.find((o) => o.id === id);
    if (hit) return hit.cells;
  }
  // Equal grid fallback for 5–6
  const n = Number(id);
  if (n >= 5 && n <= 6) {
    const cols = 3;
    const rows = Math.ceil(n / cols);
    const cells: LayoutCell[] = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      cells.push({ x: c / cols, y: r / rows, w: 1 / cols, h: 1 / rows });
    }
    return cells;
  }
  return [{ x: 0, y: 0, w: 1, h: 1 }];
}
