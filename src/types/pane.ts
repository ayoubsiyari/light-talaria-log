import type { ChartBar, VisibleRange } from '@/types/bar';
import type { PairSymbol } from '@/types/session';
import type { ChartLayout, Timeframe } from '@/types/ui';

export interface ChartPaneState {
  id: string;
  /** Effective TF loaded into the canvas (may be coarser via zoom LOD). */
  timeframe: Timeframe;
  /**
   * User's last explicit TopBar TF pick — LOD floor.
   * Auto-LOD never goes finer than this without another explicit pick.
   */
  selectedTf: Timeframe;
  bars: ChartBar[];
  range: VisibleRange;
  /** Global logical index of bars[0] in the full series */
  windowFrom: number;
  totalBars: number;
  /** Pair shown in this pane */
  pair: PairSymbol;
  /** Ingested dataset backing this pane's viewport loads */
  datasetId: string;
}

/** Max multi-pane tiles (7/8 retired — memory/CPU). */
export const MAX_LAYOUT_PANES = 6;

export function paneCountForLayout(layout: ChartLayout | string): number {
  if (layout === '1') return 1;
  if (layout.startsWith('2')) return 2;
  if (layout.startsWith('3')) return 3;
  if (layout.startsWith('4')) return 4;
  if (layout === '5') return 5;
  // Legacy '7'/'8' and any oversize → 6
  if (layout === '6' || layout === '7' || layout === '8') return 6;
  return 1;
}

export function layoutForPaneCount(n: number): ChartLayout {
  if (n <= 1) return '1';
  if (n === 2) return '2h';
  if (n === 3) return '3r';
  if (n === 4) return '4';
  if (n === 5) return '5';
  return '6';
}
