import type { DrawingToolId, ToolCategoryId } from './toolRegistry';
import { TOOLS } from './toolRegistry';
import { defaultFibMetaFor, resolveFibMeta, type FibMeta } from './fibLevels';

export type { FibLevel, FibMeta } from './fibLevels';
export {
  DEFAULT_FIB_LEVELS,
  DEFAULT_FIB_LEVEL_DEFS,
  formatFibCoeff,
  normalizeFibLevels,
  resolveFibMeta,
  visibleFibLevels,
} from './fibLevels';

/** Shared Style-tab building blocks (same chrome for every tool). */
export type StyleSection = 'stroke' | 'fill' | 'lineExtras';

/**
 * Tool-specific Inputs panel. Same modal shell; content varies by panel id.
 * Category defaults apply unless overridden per tool.
 */
export type ToolPanelId =
  | 'generic'
  | 'line'
  | 'channel'
  | 'pitchfork'
  | 'fibLevels'
  | 'gann'
  | 'brush'
  | 'arrow'
  | 'shape'
  | 'text'
  | 'pattern'
  | 'elliott'
  | 'cycles'
  | 'position'
  | 'volumeProfile'
  | 'vwap'
  | 'measure';

export interface ToolSettingsDef {
  styleSections: StyleSection[];
  toolPanel: ToolPanelId;
  /** Show Text tab (label / note). */
  showTextTab: boolean;
  /** Dedicated Inputs tab (level editors, tool-specific fields). */
  showInputsTab: boolean;
}

export interface BrushMeta {
  softEdge: boolean;
}

export interface PositionMeta {
  riskReward: number;
  showPrices: boolean;
  showQty: boolean;
  /** Show estimated P&L at target from account risk sizing. */
  showPnl: boolean;
  /** Account equity used for risk sizing. */
  accountSize: number;
  /** Risk % of account for suggested size. */
  riskPercent: number;
  /** Manual lots override; 0 = compute from risk. */
  lots: number;
}

export interface VolumeProfileMeta {
  rows: number;
  valueAreaPct: number;
  developRight: boolean;
}

export interface CyclesMeta {
  periods: number;
}

export interface MeasureMeta {
  showStats: boolean;
  showAngle: boolean;
}

export interface ChannelMeta {
  showMidline: boolean;
}

export interface PitchforkMeta {
  showMedian: boolean;
}

export interface GannMeta {
  showFan: boolean;
  subdivisions: number;
}

export interface VwapMeta {
  bandMult: number;
  showBands: boolean;
}

export interface ArrowMeta {
  showLabel: boolean;
}

export interface ShapeMeta {
  showCenter: boolean;
}

export interface PatternMeta {
  showRatios: boolean;
}

export interface ElliottMeta {
  showLabels: boolean;
}

export interface LineMeta {
  showAngle: boolean;
}

export interface TextToolMeta {
  bold: boolean;
}

const CATEGORY_PANEL: Record<ToolCategoryId, ToolPanelId> = {
  lines: 'line',
  channels: 'channel',
  pitchforks: 'pitchfork',
  fibonacci: 'fibLevels',
  gann: 'gann',
  brushes: 'brush',
  arrows: 'arrow',
  shapes: 'shape',
  text: 'text',
  patterns: 'pattern',
  elliott: 'elliott',
  cycles: 'cycles',
  forecast: 'position',
  volume: 'volumeProfile',
  measure: 'measure',
};

const LINE_EXTRAS = new Set<DrawingToolId>([
  'trendLine',
  'ray',
  'extendedLine',
  'infoLine',
  'trendAngle',
  'horizontalRay',
  'hline',
  'vline',
]);

const FILL_TOOLS = new Set<DrawingToolId>([
  'rectangle',
  'rotatedRectangle',
  'circle',
  'ellipse',
  'triangle',
  'parallelChannel',
  'disjointChannel',
  'flatTopBottom',
  'longPosition',
  'shortPosition',
  'gannBox',
  'gannSquare',
  'gannSquareFixed',
  'datePriceRange',
  'priceRange',
  'fibRetracement',
  'fibExtension',
  'fibChannel',
  'fibCircles',
  'fibWedge',
]);

const TOOL_PANEL_OVERRIDE: Partial<Record<DrawingToolId, ToolPanelId>> = {
  hline: 'line',
  vline: 'line',
  crossLine: 'line',
  horizontalRay: 'line',
  forecast: 'position',
  barsPattern: 'pattern',
  anchoredVwap: 'vwap',
  fixedRangeVolumeProfile: 'volumeProfile',
  anchoredVolumeProfile: 'volumeProfile',
  highlighter: 'brush',
  regressionTrend: 'channel',
  /** Level-based tools share the Fib Inputs editor. */
  gannFan: 'fibLevels',
  cyclicLines: 'fibLevels',
};

export function getToolSettings(type: DrawingToolId): ToolSettingsDef {
  const def = TOOLS[type];
  const styleSections: StyleSection[] = ['stroke'];
  if (FILL_TOOLS.has(type)) styleSections.push('fill');
  if (LINE_EXTRAS.has(type)) styleSections.push('lineExtras');

  const toolPanel =
    TOOL_PANEL_OVERRIDE[type] ?? CATEGORY_PANEL[def.category] ?? 'generic';

  return {
    styleSections,
    toolPanel,
    showTextTab: true, // optional note on every tool; text tools emphasize it
    showInputsTab: toolPanel !== 'generic',
  };
}

export function defaultMetaFor(type: DrawingToolId): Record<string, unknown> {
  const panel = getToolSettings(type).toolPanel;
  switch (panel) {
    case 'fibLevels':
      return { ...defaultFibMetaFor(type) } satisfies FibMeta;
    case 'brush':
      return { softEdge: type === 'highlighter' } satisfies BrushMeta;
    case 'position':
      return {
        riskReward: 2,
        showPrices: true,
        showQty: true,
        showPnl: true,
        accountSize: 10_000,
        riskPercent: 1,
        lots: 0,
      } satisfies PositionMeta;
    case 'volumeProfile':
      return { rows: 24, valueAreaPct: 70, developRight: true } satisfies VolumeProfileMeta;
    case 'cycles':
      return { periods: 8 } satisfies CyclesMeta;
    case 'measure':
      return { showStats: true, showAngle: false } satisfies MeasureMeta;
    case 'channel':
      return { showMidline: true } satisfies ChannelMeta;
    case 'pitchfork':
      return { showMedian: true } satisfies PitchforkMeta;
    case 'gann':
      return { showFan: true, subdivisions: 4 } satisfies GannMeta;
    case 'vwap':
      return { bandMult: 1, showBands: false } satisfies VwapMeta;
    case 'arrow':
      return { showLabel: false } satisfies ArrowMeta;
    case 'shape':
      return { showCenter: false } satisfies ShapeMeta;
    case 'pattern':
      return { showRatios: true } satisfies PatternMeta;
    case 'elliott':
      return { showLabels: true } satisfies ElliottMeta;
    case 'line':
      return { showAngle: type === 'trendAngle' || type === 'infoLine' } satisfies LineMeta;
    case 'text':
      return { bold: false } satisfies TextToolMeta;
    default:
      return {};
  }
}

/** Merge stored meta with defaults for the tool. */
export function resolveMeta(type: DrawingToolId, meta?: Record<string, unknown>): Record<string, unknown> {
  const panel = getToolSettings(type).toolPanel;
  if (panel === 'fibLevels') {
    return { ...defaultMetaFor(type), ...meta, ...resolveFibMeta(type, meta) };
  }
  return { ...defaultMetaFor(type), ...meta };
}

export function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function asNumberArray(v: unknown, fallback: number[]): number[] {
  if (!Array.isArray(v)) return fallback;
  const out = v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return out.length > 0 ? out : fallback;
}
