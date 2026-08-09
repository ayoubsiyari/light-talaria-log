import type { DrawingToolId } from '@/drawings/toolRegistry';
import { getTool } from '@/drawings/toolRegistry';
import { getToolSettings } from '@/drawings/toolSettings';

export type StyleFamily =
  | 'line'
  | 'brush'
  | 'highlighter'
  | 'shape'
  | 'measure'
  | 'position'
  | 'channel'
  | 'pitchfork'
  | 'fib'
  | 'gann'
  | 'pattern'
  | 'generic';

const SHAPE_BORDER = new Set<DrawingToolId>([
  'rectangle',
  'rotatedRectangle',
  'ellipse',
  'circle',
  'triangle',
  'arc',
]);

const SHAPE_BG = new Set<DrawingToolId>([
  'rectangle',
  'rotatedRectangle',
  'ellipse',
  'circle',
  'triangle',
  'arc',
  'curve',
  'arrowMarker',
  'arrowUp',
  'arrowDown',
  'parallelChannel',
  'flatTopBottom',
  'disjointChannel',
  'xabcd',
  'headShoulders',
  'trianglePattern',
]);

const MIDLINE_SHAPES = new Set<DrawingToolId>([
  'rectangle',
  'rotatedRectangle',
  'ellipse',
  'circle',
]);

const NO_ENDPOINTS = new Set<DrawingToolId>([
  'hline',
  'horizontalRay',
  'vline',
  'ray',
  'extendedLine',
  'crossLine',
  'polyline',
  'path',
  'triangle',
  'rectangle',
  'rotatedRectangle',
  'arc',
  'ellipse',
  'circle',
  'arrowMarker',
  'arrow',
  'arrowUp',
  'arrowDown',
  'parallelChannel',
  'regressionTrend',
  'flatTopBottom',
  'disjointChannel',
  'pitchfork',
  'schiffPitchfork',
  'modifiedSchiffPitchfork',
  'insidePitchfork',
  'highlighter',
]);

const INFO_TOOLS = new Set<DrawingToolId>([
  'trendLine',
  'infoLine',
  'datePriceRange',
  'priceRange',
  'dateRange',
]);

export function styleFamilyFor(type: DrawingToolId): StyleFamily {
  if (type === 'highlighter') return 'highlighter';
  if (type === 'brush') return 'brush';
  if (type === 'longPosition' || type === 'shortPosition' || type === 'forecast') {
    return 'position';
  }
  if (
    type === 'datePriceRange' ||
    type === 'priceRange' ||
    type === 'dateRange'
  ) {
    return 'measure';
  }
  const cat = getTool(type).category;
  if (cat === 'fibonacci') return 'fib';
  if (cat === 'gann') return 'gann';
  if (cat === 'channels') return 'channel';
  if (cat === 'pitchforks') return 'pitchfork';
  if (cat === 'patterns' || cat === 'elliott') return 'pattern';
  if (cat === 'shapes' || SHAPE_BORDER.has(type)) return 'shape';
  if (cat === 'lines' || cat === 'arrows') return 'line';
  return 'generic';
}

export function showEndpoints(type: DrawingToolId): boolean {
  if (getTool(type).category === 'fibonacci') return false;
  if (getTool(type).category === 'patterns') return false;
  return !NO_ENDPOINTS.has(type);
}

export function showShapeBorder(type: DrawingToolId): boolean {
  return SHAPE_BORDER.has(type);
}

export function showBackground(type: DrawingToolId): boolean {
  return SHAPE_BG.has(type) || getToolSettings(type).styleSections.includes('fill');
}

export function showMidLineRow(type: DrawingToolId): boolean {
  return MIDLINE_SHAPES.has(type) || type === 'parallelChannel';
}

export function showExtendChips(type: DrawingToolId): boolean {
  const s = getToolSettings(type);
  if (!s.styleSections.includes('lineExtras')) return false;
  if (type === 'brush' || type === 'highlighter') return false;
  if (type === 'vline' || type === 'hline') return false;
  return true;
}

export function showPriceChip(type: DrawingToolId): boolean {
  return type !== 'vline' && type !== 'text';
}

export function showTimeChip(type: DrawingToolId): boolean {
  return (
    type !== 'hline' &&
    type !== 'horizontalRay' &&
    type !== 'text'
  );
}

export function showInfoRow(type: DrawingToolId): boolean {
  return INFO_TOOLS.has(type);
}

export function showDash(type: DrawingToolId): boolean {
  return !getToolSettings(type).hideDash;
}
