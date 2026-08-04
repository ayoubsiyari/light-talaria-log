import type { DrawingStyle } from './drawingStyle';
import { DEFAULT_DRAWING_STYLE } from './drawingStyle';

/** How many clicks (or special modes) to finish a drawing. */
export type PointMode =
  | { kind: 'fixed'; count: number }
  | { kind: 'polyline'; min: number } // double-click / Enter to finish
  | { kind: 'freehand' }; // drag stroke

export type ToolCategoryId =
  | 'lines'
  | 'channels'
  | 'pitchforks'
  | 'fibonacci'
  | 'gann'
  | 'brushes'
  | 'arrows'
  | 'shapes'
  | 'text'
  | 'patterns'
  | 'elliott'
  | 'cycles'
  | 'forecast'
  | 'volume'
  | 'measure';

export type DrawingToolId =
  // Lines
  | 'trendLine'
  | 'ray'
  | 'infoLine'
  | 'extendedLine'
  | 'trendAngle'
  | 'hline'
  | 'horizontalRay'
  | 'vline'
  | 'crossLine'
  // Channels
  | 'parallelChannel'
  | 'regressionTrend'
  | 'flatTopBottom'
  | 'disjointChannel'
  // Pitchforks
  | 'pitchfork'
  | 'schiffPitchfork'
  | 'modifiedSchiffPitchfork'
  | 'insidePitchfork'
  // Fibonacci
  | 'fibRetracement'
  | 'fibExtension'
  | 'fibChannel'
  | 'fibTimezone'
  | 'fibSpeedFan'
  | 'fibTrendTime'
  | 'fibCircles'
  | 'fibSpiral'
  | 'fibSpeedArcs'
  | 'fibWedge'
  | 'fibFan'
  // Gann
  | 'gannBox'
  | 'gannSquareFixed'
  | 'gannSquare'
  | 'gannFan'
  // Brushes
  | 'brush'
  | 'highlighter'
  // Arrows
  | 'arrowMarker'
  | 'arrow'
  | 'arrowUp'
  | 'arrowDown'
  // Shapes
  | 'rectangle'
  | 'rotatedRectangle'
  | 'path'
  | 'circle'
  | 'ellipse'
  | 'polyline'
  | 'triangle'
  | 'arc'
  | 'curve'
  | 'doubleCurve'
  // Text
  | 'text'
  | 'note'
  | 'priceNote'
  | 'pin'
  | 'callout'
  | 'comment'
  | 'priceLabel'
  | 'flagMark'
  // Patterns
  | 'xabcd'
  | 'cypher'
  | 'headShoulders'
  | 'abcd'
  | 'trianglePattern'
  | 'threeDrives'
  // Elliott
  | 'elliottImpulse'
  | 'elliottCorrection'
  | 'elliottTriangle'
  | 'elliottDoubleCombo'
  | 'elliottTripleCombo'
  // Cycles
  | 'cyclicLines'
  | 'timeCycles'
  | 'sineLine'
  // Forecast
  | 'longPosition'
  | 'shortPosition'
  | 'forecast'
  | 'barsPattern'
  // Volume
  | 'anchoredVwap'
  | 'fixedRangeVolumeProfile'
  | 'anchoredVolumeProfile'
  // Measure
  | 'priceRange'
  | 'dateRange'
  | 'datePriceRange';

export interface ToolDef {
  id: DrawingToolId;
  category: ToolCategoryId;
  label: string;
  points: PointMode;
  /** Needs a text prompt after place. */
  needsText?: boolean;
  defaultStyle?: Partial<DrawingStyle>;
}

export interface CategoryDef {
  id: ToolCategoryId;
  label: string;
  /** Section headers inside the flyout (optional grouping). */
  sections: { title: string; tools: DrawingToolId[] }[];
}

export const TOOL_CATEGORIES: CategoryDef[] = [
  {
    id: 'lines',
    label: 'Lines',
    sections: [
      {
        title: 'LINES',
        tools: [
          'trendLine',
          'ray',
          'infoLine',
          'extendedLine',
          'trendAngle',
          'hline',
          'horizontalRay',
          'vline',
          'crossLine',
        ],
      },
    ],
  },
  {
    id: 'channels',
    label: 'Channels',
    sections: [
      {
        title: 'CHANNELS',
        tools: ['parallelChannel', 'regressionTrend', 'flatTopBottom', 'disjointChannel'],
      },
    ],
  },
  {
    id: 'pitchforks',
    label: 'Pitchforks',
    sections: [
      {
        title: 'PITCHFORKS',
        tools: [
          'pitchfork',
          'schiffPitchfork',
          'modifiedSchiffPitchfork',
          'insidePitchfork',
        ],
      },
    ],
  },
  {
    id: 'fibonacci',
    label: 'Fibonacci',
    sections: [
      {
        title: 'FIBONACCI',
        tools: [
          'fibRetracement',
          'fibExtension',
          'fibChannel',
          'fibTimezone',
          'fibSpeedFan',
          'fibTrendTime',
          'fibCircles',
          'fibSpiral',
          'fibSpeedArcs',
          'fibWedge',
          'fibFan',
        ],
      },
    ],
  },
  {
    id: 'gann',
    label: 'Gann',
    sections: [
      {
        title: 'GANN',
        tools: ['gannBox', 'gannSquareFixed', 'gannSquare', 'gannFan'],
      },
    ],
  },
  {
    id: 'brushes',
    label: 'Brushes',
    sections: [
      { title: 'BRUSHES', tools: ['brush', 'highlighter'] },
    ],
  },
  {
    id: 'arrows',
    label: 'Arrows',
    sections: [
      {
        title: 'ARROWS',
        tools: ['arrowMarker', 'arrow', 'arrowUp', 'arrowDown'],
      },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    sections: [
      {
        title: 'SHAPES',
        tools: [
          'rectangle',
          'rotatedRectangle',
          'path',
          'circle',
          'ellipse',
          'polyline',
          'triangle',
          'arc',
          'curve',
          'doubleCurve',
        ],
      },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    sections: [
      {
        title: 'TEXT AND NOTES',
        tools: [
          'text',
          'note',
          'priceNote',
          'pin',
          'callout',
          'comment',
          'priceLabel',
          'flagMark',
        ],
      },
    ],
  },
  {
    id: 'patterns',
    label: 'Patterns',
    sections: [
      {
        title: 'PATTERNS',
        tools: [
          'xabcd',
          'cypher',
          'headShoulders',
          'abcd',
          'trianglePattern',
          'threeDrives',
        ],
      },
    ],
  },
  {
    id: 'elliott',
    label: 'Elliott',
    sections: [
      {
        title: 'ELLIOTT WAVES',
        tools: [
          'elliottImpulse',
          'elliottCorrection',
          'elliottTriangle',
          'elliottDoubleCombo',
          'elliottTripleCombo',
        ],
      },
    ],
  },
  {
    id: 'cycles',
    label: 'Cycles',
    sections: [
      {
        title: 'CYCLES',
        tools: ['cyclicLines', 'timeCycles', 'sineLine'],
      },
    ],
  },
  {
    id: 'forecast',
    label: 'Forecast',
    sections: [
      {
        title: 'FORECAST',
        tools: ['longPosition', 'shortPosition', 'forecast', 'barsPattern'],
      },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    sections: [
      {
        title: 'VOLUME BASED',
        tools: [
          'anchoredVwap',
          'fixedRangeVolumeProfile',
          'anchoredVolumeProfile',
        ],
      },
    ],
  },
  {
    id: 'measure',
    label: 'Measure',
    sections: [
      {
        title: 'MEASURE',
        tools: ['priceRange', 'dateRange', 'datePriceRange'],
      },
    ],
  },
];

const FIXED = (n: number): PointMode => ({ kind: 'fixed', count: n });

export const TOOLS: Record<DrawingToolId, ToolDef> = {
  trendLine: { id: 'trendLine', category: 'lines', label: 'Trend Line', points: FIXED(2) },
  ray: { id: 'ray', category: 'lines', label: 'Ray', points: FIXED(2) },
  infoLine: { id: 'infoLine', category: 'lines', label: 'Info Line', points: FIXED(2) },
  extendedLine: {
    id: 'extendedLine',
    category: 'lines',
    label: 'Extended Line',
    points: FIXED(2),
    defaultStyle: { extend: 'both' },
  },
  trendAngle: {
    id: 'trendAngle',
    category: 'lines',
    label: 'Trend Angle',
    points: FIXED(2),
  },
  hline: { id: 'hline', category: 'lines', label: 'Horizontal Line', points: FIXED(1) },
  horizontalRay: {
    id: 'horizontalRay',
    category: 'lines',
    label: 'Horizontal Ray',
    points: FIXED(2),
  },
  vline: { id: 'vline', category: 'lines', label: 'Vertical Line', points: FIXED(1) },
  crossLine: { id: 'crossLine', category: 'lines', label: 'Cross Line', points: FIXED(1) },

  parallelChannel: {
    id: 'parallelChannel',
    category: 'channels',
    label: 'Parallel Channel',
    points: FIXED(3),
  },
  regressionTrend: {
    id: 'regressionTrend',
    category: 'channels',
    label: 'Regression Trend',
    points: FIXED(2),
  },
  flatTopBottom: {
    id: 'flatTopBottom',
    category: 'channels',
    label: 'Flat Top/Bottom',
    points: FIXED(3),
  },
  disjointChannel: {
    id: 'disjointChannel',
    category: 'channels',
    label: 'Disjoint Channel',
    points: FIXED(4),
  },

  pitchfork: { id: 'pitchfork', category: 'pitchforks', label: 'Pitchfork', points: FIXED(3) },
  schiffPitchfork: {
    id: 'schiffPitchfork',
    category: 'pitchforks',
    label: 'Schiff Pitchfork',
    points: FIXED(3),
  },
  modifiedSchiffPitchfork: {
    id: 'modifiedSchiffPitchfork',
    category: 'pitchforks',
    label: 'Modified Schiff Pitchfork',
    points: FIXED(3),
  },
  insidePitchfork: {
    id: 'insidePitchfork',
    category: 'pitchforks',
    label: 'Inside Pitchfork',
    points: FIXED(3),
  },

  fibRetracement: {
    id: 'fibRetracement',
    category: 'fibonacci',
    label: 'Fib Retracement',
    points: FIXED(2),
  },
  fibExtension: {
    id: 'fibExtension',
    category: 'fibonacci',
    label: 'Trend-Based Fib Extension',
    points: FIXED(3),
  },
  fibChannel: {
    id: 'fibChannel',
    category: 'fibonacci',
    label: 'Fib Channel',
    points: FIXED(3),
  },
  fibTimezone: {
    id: 'fibTimezone',
    category: 'fibonacci',
    label: 'Fib Time Zone',
    points: FIXED(2),
  },
  fibSpeedFan: {
    id: 'fibSpeedFan',
    category: 'fibonacci',
    label: 'Fib Speed Resistance Fan',
    points: FIXED(2),
  },
  fibTrendTime: {
    id: 'fibTrendTime',
    category: 'fibonacci',
    label: 'Trend-Based Fib Time',
    points: FIXED(3),
  },
  fibCircles: {
    id: 'fibCircles',
    category: 'fibonacci',
    label: 'Fib Circles',
    points: FIXED(2),
  },
  fibSpiral: {
    id: 'fibSpiral',
    category: 'fibonacci',
    label: 'Fib Spiral',
    points: FIXED(2),
  },
  fibSpeedArcs: {
    id: 'fibSpeedArcs',
    category: 'fibonacci',
    label: 'Fib Speed Resistance Arcs',
    points: FIXED(2),
  },
  fibWedge: {
    id: 'fibWedge',
    category: 'fibonacci',
    label: 'Fib Wedge',
    points: FIXED(3),
  },
  fibFan: { id: 'fibFan', category: 'fibonacci', label: 'Fib Fan', points: FIXED(2) },

  gannBox: { id: 'gannBox', category: 'gann', label: 'Gann Box', points: FIXED(2) },
  gannSquareFixed: {
    id: 'gannSquareFixed',
    category: 'gann',
    label: 'Gann Square Fixed',
    points: FIXED(2),
  },
  gannSquare: { id: 'gannSquare', category: 'gann', label: 'Gann Square', points: FIXED(2) },
  gannFan: { id: 'gannFan', category: 'gann', label: 'Gann Fan', points: FIXED(2) },

  brush: {
    id: 'brush',
    category: 'brushes',
    label: 'Brush',
    points: { kind: 'freehand' },
    defaultStyle: { width: 2.5 },
  },
  highlighter: {
    id: 'highlighter',
    category: 'brushes',
    label: 'Highlighter',
    points: { kind: 'freehand' },
    defaultStyle: { width: 12, opacity: 0.35, color: '#FFEB3B' },
  },

  arrowMarker: {
    id: 'arrowMarker',
    category: 'arrows',
    label: 'Arrow Marker',
    points: FIXED(2),
  },
  arrow: { id: 'arrow', category: 'arrows', label: 'Arrow', points: FIXED(2) },
  arrowUp: { id: 'arrowUp', category: 'arrows', label: 'Arrow Up', points: FIXED(1) },
  arrowDown: { id: 'arrowDown', category: 'arrows', label: 'Arrow Down', points: FIXED(1) },

  rectangle: { id: 'rectangle', category: 'shapes', label: 'Rectangle', points: FIXED(2) },
  rotatedRectangle: {
    id: 'rotatedRectangle',
    category: 'shapes',
    label: 'Rotated Rectangle',
    points: FIXED(3),
  },
  path: { id: 'path', category: 'shapes', label: 'Path', points: { kind: 'polyline', min: 2 } },
  circle: { id: 'circle', category: 'shapes', label: 'Circle', points: FIXED(2) },
  ellipse: { id: 'ellipse', category: 'shapes', label: 'Ellipse', points: FIXED(2) },
  polyline: {
    id: 'polyline',
    category: 'shapes',
    label: 'Polyline',
    points: { kind: 'polyline', min: 2 },
  },
  triangle: { id: 'triangle', category: 'shapes', label: 'Triangle', points: FIXED(3) },
  arc: { id: 'arc', category: 'shapes', label: 'Arc', points: FIXED(3) },
  curve: { id: 'curve', category: 'shapes', label: 'Curve', points: FIXED(3) },
  doubleCurve: {
    id: 'doubleCurve',
    category: 'shapes',
    label: 'Double Curve',
    points: FIXED(4),
  },

  text: {
    id: 'text',
    category: 'text',
    label: 'Text',
    points: FIXED(1),
    needsText: true,
  },
  note: {
    id: 'note',
    category: 'text',
    label: 'Note',
    points: FIXED(1),
    needsText: true,
  },
  priceNote: {
    id: 'priceNote',
    category: 'text',
    label: 'Price Note',
    points: FIXED(1),
    needsText: true,
  },
  pin: { id: 'pin', category: 'text', label: 'Pin', points: FIXED(1), needsText: true },
  callout: {
    id: 'callout',
    category: 'text',
    label: 'Callout',
    points: FIXED(2),
    needsText: true,
  },
  comment: {
    id: 'comment',
    category: 'text',
    label: 'Comment',
    points: FIXED(1),
    needsText: true,
  },
  priceLabel: {
    id: 'priceLabel',
    category: 'text',
    label: 'Price Label',
    points: FIXED(1),
  },
  flagMark: { id: 'flagMark', category: 'text', label: 'Flag Mark', points: FIXED(1) },

  xabcd: { id: 'xabcd', category: 'patterns', label: 'XABCD Pattern', points: FIXED(5) },
  cypher: { id: 'cypher', category: 'patterns', label: 'Cypher Pattern', points: FIXED(5) },
  headShoulders: {
    id: 'headShoulders',
    category: 'patterns',
    label: 'Head and Shoulders',
    points: FIXED(7),
  },
  abcd: { id: 'abcd', category: 'patterns', label: 'ABCD Pattern', points: FIXED(4) },
  trianglePattern: {
    id: 'trianglePattern',
    category: 'patterns',
    label: 'Triangle Pattern',
    points: FIXED(5),
  },
  threeDrives: {
    id: 'threeDrives',
    category: 'patterns',
    label: 'Three Drives',
    points: FIXED(7),
  },

  elliottImpulse: {
    id: 'elliottImpulse',
    category: 'elliott',
    label: 'Elliott Impulse Wave',
    points: FIXED(6),
  },
  elliottCorrection: {
    id: 'elliottCorrection',
    category: 'elliott',
    label: 'Elliott Correction',
    points: FIXED(4),
  },
  elliottTriangle: {
    id: 'elliottTriangle',
    category: 'elliott',
    label: 'Elliott Triangle',
    points: FIXED(6),
  },
  elliottDoubleCombo: {
    id: 'elliottDoubleCombo',
    category: 'elliott',
    label: 'Elliott Double Combo',
    points: FIXED(5),
  },
  elliottTripleCombo: {
    id: 'elliottTripleCombo',
    category: 'elliott',
    label: 'Elliott Triple Combo',
    points: FIXED(7),
  },

  cyclicLines: {
    id: 'cyclicLines',
    category: 'cycles',
    label: 'Cyclic Lines',
    points: FIXED(2),
  },
  timeCycles: {
    id: 'timeCycles',
    category: 'cycles',
    label: 'Time Cycles',
    points: FIXED(2),
  },
  sineLine: { id: 'sineLine', category: 'cycles', label: 'Sine Line', points: FIXED(2) },

  longPosition: {
    id: 'longPosition',
    category: 'forecast',
    label: 'Long Position',
    points: FIXED(3),
    defaultStyle: { color: '#4CAF50' },
  },
  shortPosition: {
    id: 'shortPosition',
    category: 'forecast',
    label: 'Short Position',
    points: FIXED(3),
    defaultStyle: { color: '#F44336' },
  },
  forecast: { id: 'forecast', category: 'forecast', label: 'Forecast', points: FIXED(2) },
  barsPattern: {
    id: 'barsPattern',
    category: 'forecast',
    label: 'Bars Pattern',
    points: FIXED(2),
  },

  anchoredVwap: {
    id: 'anchoredVwap',
    category: 'volume',
    label: 'Anchored VWAP',
    points: FIXED(1),
    defaultStyle: { color: '#FF6D00', width: 2 },
  },
  fixedRangeVolumeProfile: {
    id: 'fixedRangeVolumeProfile',
    category: 'volume',
    label: 'Fixed Range Volume Profile',
    points: FIXED(2),
  },
  anchoredVolumeProfile: {
    id: 'anchoredVolumeProfile',
    category: 'volume',
    label: 'Anchored Volume Profile',
    points: FIXED(1),
  },

  priceRange: {
    id: 'priceRange',
    category: 'measure',
    label: 'Price Range',
    points: FIXED(2),
  },
  dateRange: { id: 'dateRange', category: 'measure', label: 'Date Range', points: FIXED(2) },
  datePriceRange: {
    id: 'datePriceRange',
    category: 'measure',
    label: 'Date and Price Range',
    points: FIXED(2),
  },
};

export function getTool(id: DrawingToolId): ToolDef {
  return TOOLS[id];
}

export function pointsNeeded(type: DrawingToolId): number {
  const mode = TOOLS[type].points;
  if (mode.kind === 'fixed') return mode.count;
  if (mode.kind === 'polyline') return mode.min;
  return 2; // freehand accumulates
}

export function defaultStyleFor(type: DrawingToolId): DrawingStyle {
  return { ...DEFAULT_DRAWING_STYLE, ...TOOLS[type].defaultStyle };
}

/** Toolbar category → last-used tool defaults. */
export const CATEGORY_DEFAULT_TOOL: Record<ToolCategoryId, DrawingToolId> = {
  lines: 'trendLine',
  channels: 'parallelChannel',
  pitchforks: 'pitchfork',
  fibonacci: 'fibRetracement',
  gann: 'gannBox',
  brushes: 'brush',
  arrows: 'arrow',
  shapes: 'rectangle',
  text: 'text',
  patterns: 'xabcd',
  elliott: 'elliottImpulse',
  cycles: 'cyclicLines',
  forecast: 'longPosition',
  volume: 'anchoredVwap',
  measure: 'datePriceRange',
};
