import type { Timeframe } from '@/types/ui';

export interface PaneConfig {
  datasetId: string;
  /** Effective TF actually displayed. */
  tf: Timeframe;
  /** Last explicit TopBar pick — LOD floor. */
  selectedTf: Timeframe;
  pair: string;
}

export interface SessionBounds {
  start: number;
  end: number;
}

export type RevealMode = 'replay' | 'full';

/**
 * Canonical session state — single source of truth for replay + camera + panes.
 * Camera is TF-invariant: `anchorTime` (right edge) + `span` (bar count).
 */
export interface SessionState {
  /** The ONLY clock. Always on the dataset BASE TF grid (usually 1m). */
  cursorTime: number;
  /** Wall-clock time at the camera's RIGHT edge. TF-invariant. */
  anchorTime: number;
  /** Visible bar COUNT. Perceptually invariant across TFs. */
  span: number;
  panes: Record<string, PaneConfig>;
  activePaneId: string;
  revealMode: RevealMode;
  bounds: SessionBounds;
  /** Dataset base TF — replay clock grid. */
  baseTf: Timeframe;
  playing: boolean;
}

export interface PaneView {
  bars: import('@/types/bar').ChartBar[];
  range: import('@/types/bar').VisibleRange;
  timeframe: Timeframe;
  selectedTf: Timeframe;
  datasetId: string;
  pair: string;
}
