/** TradingView-like drawing style defaults and palette. */

export type LineStyleKind = 'solid' | 'dashed' | 'dotted';
export type ExtendMode = 'none' | 'left' | 'right' | 'both';

export type TextAlignV = 'top' | 'middle' | 'bottom';
export type TextAlignH = 'left' | 'center' | 'right';

export interface DrawingStyle {
  color: string;
  width: number;
  opacity: number;
  lineStyle: LineStyleKind;
  fill: boolean;
  fillOpacity: number;
  /** Shape/channel fill color; falls back to `color` when unset. */
  fillColor: string;
  fontSize: number;
  textColor: string;
  textBold: boolean;
  textItalic: boolean;
  textAlignV: TextAlignV;
  textAlignH: TextAlignH;
  /** Line extend beyond anchors (trend / ray family). */
  extend: ExtendMode;
  showMidpoint: boolean;
  showPriceLabels: boolean;
  /** Obsidian Labels → Time chip. */
  showTimeLabels: boolean;
  /** Show Info metrics (trendline family). */
  showInfo: boolean;
  /** Selected info metrics (price range, bars, …). */
  infoMetrics: string[];
  /** Left / right end caps (circle / arrow). */
  leftEnd: boolean;
  rightEnd: boolean;
  /** End cap style: circle marker vs arrow (Obsidian ep1/ep2). */
  leftEndStyle: 'normal' | 'arrow';
  rightEndStyle: 'normal' | 'arrow';
}

/** TV-style swatches used in the style panel / toolbar. */
export const TV_COLOR_PALETTE = [
  '#2962FF',
  '#FF6D00',
  '#E91E63',
  '#9C27B0',
  '#673AB7',
  '#00BCD4',
  '#4CAF50',
  '#8BC34A',
  '#FFEB3B',
  '#FF9800',
  '#795548',
  '#607D8B',
  '#F44336',
  '#FFFFFF',
  '#787B86',
  '#131722',
] as const;

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#2962FF',
  width: 2,
  opacity: 1,
  lineStyle: 'solid',
  fill: true,
  fillOpacity: 0.15,
  fillColor: '#2962FF',
  fontSize: 14,
  /** Placeholder — painters map this to theme foreground in light/dark. */
  textColor: '#D1D4DC',
  textBold: false,
  textItalic: false,
  textAlignV: 'top',
  textAlignH: 'left',
  extend: 'none',
  showMidpoint: false,
  showPriceLabels: false,
  showTimeLabels: false,
  showInfo: false,
  infoMetrics: [],
  leftEnd: false,
  rightEnd: false,
  leftEndStyle: 'normal',
  rightEndStyle: 'normal',
};

/** Obsidian Show Info metric options (trendline / measure). */
export const INFO_METRIC_OPTIONS = [
  { id: 'priceRange', label: 'Price range' },
  { id: 'percentChange', label: 'Percent change' },
  { id: 'pips', label: 'Change in pips' },
  { id: 'bars', label: 'Bars range' },
  { id: 'dateRange', label: 'Date/time range' },
  { id: 'volume', label: 'Volume' },
] as const;

export const LINE_WIDTHS = [1, 2, 3, 4] as const;

/** Talaria highlighter thickness presets (brush stays on LINE_WIDTHS). */
export const HIGHLIGHTER_WIDTHS = [8, 12, 20, 32, 48, 64] as const;

export function cloneStyle(style?: Partial<DrawingStyle>): DrawingStyle {
  const next = { ...DEFAULT_DRAWING_STYLE, ...style };
  // Older saves may omit fillColor — keep stroke/fill visually linked.
  if (!style?.fillColor) next.fillColor = next.color;
  return next;
}

export function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  style: DrawingStyle,
): void {
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.globalAlpha = style.opacity;
  ctx.lineWidth = style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (style.lineStyle) {
    case 'dashed':
      ctx.setLineDash([6, 4]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 3]);
      break;
    default:
      ctx.setLineDash([]);
  }
}

export function applyFillStyle(ctx: CanvasRenderingContext2D, style: DrawingStyle): void {
  ctx.fillStyle = style.fillColor || style.color;
  ctx.globalAlpha = style.fillOpacity * style.opacity;
}

export function extendModeToPaint(
  extend: ExtendMode,
): 'segment' | 'ray' | 'rayLeft' | 'extended' {
  if (extend === 'both') return 'extended';
  if (extend === 'right') return 'ray';
  if (extend === 'left') return 'rayLeft';
  return 'segment';
}
