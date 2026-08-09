import type { DrawingToolId } from './toolRegistry';

/**
 * Map our DrawingToolId → V9 ChromeIcon name (src/v9/chromeIcons.jsx).
 * Used by settings header + left-rail flyout rows.
 */
const MAP: Partial<Record<DrawingToolId, string>> = {
  trendLine: 'trendline',
  ray: 'ray',
  extendedLine: 'extendedLine',
  hline: 'hline',
  horizontalRay: 'hray',
  vline: 'vline',
  crossLine: 'crossLine',
  infoLine: 'trendline',
  trendAngle: 'trendline',
  polyline: 'polyline',
  path: 'pathTool',
  brush: 'draw',
  highlighter: 'brush',

  parallelChannel: 'channel',
  regressionTrend: 'regressionCh',
  flatTopBottom: 'flatChannel',
  disjointChannel: 'disjointCh',
  pitchfork: 'pitchfork',
  schiffPitchfork: 'pitchfork',
  modifiedSchiffPitchfork: 'pitchfork',
  insidePitchfork: 'pitchfork',

  fibRetracement: 'fib',
  fibExtension: 'fibExtension',
  fibChannel: 'fibChannel',
  fibTimezone: 'fibTimeZone',
  fibSpeedFan: 'fibFan',
  fibTrendTime: 'fibTime',
  fibCircles: 'fibCircles',
  fibSpiral: 'fibSpiral',
  fibSpeedArcs: 'fibArcs',
  fibWedge: 'fibWedge',
  fibFan: 'fibFan',

  gannBox: 'gannBox',
  gannSquare: 'gannSquare',
  gannSquareFixed: 'gannSquare',
  gannFan: 'gannFan',

  elliottImpulse: 'elliott5',
  elliottCorrection: 'elliottABC',
  elliottTriangle: 'elliottTri',
  elliottDoubleCombo: 'elliottWXY',
  elliottTripleCombo: 'elliottWXYXZ',

  xabcd: 'xabcd',
  abcd: 'abcdPattern',
  cypher: 'xabcd',
  headShoulders: 'headShoulders',
  trianglePattern: 'triPattern',
  threeDrives: 'threeDrives',

  rectangle: 'rect',
  rotatedRectangle: 'rect',
  triangle: 'triangle',
  circle: 'circle',
  ellipse: 'ellipse',
  arc: 'arcShape',
  curve: 'curve',
  doubleCurve: 'doubleCurve',

  arrow: 'arrowLine',
  arrowMarker: 'arrowMarker',
  arrowUp: 'arrowUp',
  arrowDown: 'arrowDn',

  text: 'text',
  note: 'note',
  callout: 'callout',
  priceLabel: 'priceLabel',
  priceNote: 'priceNote',
  flagMark: 'flag',
  pin: 'pin',
  comment: 'comment',

  longPosition: 'longPos',
  shortPosition: 'shortPos',
  forecast: 'longPos',
  barsPattern: 'wave',

  datePriceRange: 'measure',
  priceRange: 'measure',
  dateRange: 'measure',

  anchoredVwap: 'vwap',
  fixedRangeVolumeProfile: 'volProfile',
  anchoredVolumeProfile: 'anchoredVol',

  cyclicLines: 'fibTime',
  timeCycles: 'fibTime',
  sineLine: 'curve',
};

/** ChromeIcon name for a drawing tool (fallback: trendline). */
export function chromeIconForTool(type: DrawingToolId): string {
  return MAP[type] ?? 'trendline';
}
