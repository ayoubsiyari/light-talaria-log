import type { ChartLayout } from '@/types/ui';

/** Sync options under the layout picker (TradingView-style). */
export interface LayoutSyncOptions {
  symbol: boolean;
  interval: boolean;
  crosshair: boolean;
  time: boolean;
  dateRange: boolean;
}

export const DEFAULT_LAYOUT_SYNC: LayoutSyncOptions = {
  symbol: false,
  interval: false,
  crosshair: true,
  time: true,
  dateRange: true,
};

/** Cell rects in a 0–1 unit square for drawing the layout icon. */
export type LayoutCell = { x: number; y: number; w: number; h: number };

export interface LayoutOption {
  id: ChartLayout;
  /** Pane count for this layout. */
  panes: number;
  cells: LayoutCell[];
}

/**
 * Layout catalog grouped by pane count (TV layout menu rows).
 * Only options listed here are selectable; CSS grid classes live in ChartGrid.
 */
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
  return [{ x: 0, y: 0, w: 1, h: 1 }];
}
