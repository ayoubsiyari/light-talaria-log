/** TradingView-like drawing style defaults and palette. */

export type LineStyleKind = 'solid' | 'dashed' | 'dotted' | 'dashdot';
export type ExtendMode = 'none' | 'left' | 'right' | 'both';

export type TextAlignV = 'top' | 'middle' | 'bottom';
export type TextAlignH = 'left' | 'center' | 'right';
export type TextOrientation = 'horizontal' | 'vertical';
export type EndCapStyle = 'none' | 'normal' | 'arrow';

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
  /** Vertical line text rotation (V9 textOrientation). */
  textOrientation: TextOrientation;
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
  /** Shape / measure border (stub until paint wires). */
  showBorder: boolean;
  borderColor: string;
  borderWidth: number;
  borderLineStyle: LineStyleKind;
  /** Middle line (shapes / channels) — store only until paint wires. */
  midLine: boolean;
  midLineColor: string;
  midLineWidth: number;
  midLineStyle: LineStyleKind;
  /** Measure / RR label chrome (store only). */
  labelColor: string;
  labelBg: boolean;
  labelBgColor: string;
}

/** Level row used by channel / pitchfork / fib / gann style grids (meta). */
export interface StyleLevelRow {
  on: boolean;
  value: string;
  color: string;
  type: LineStyleKind;
  width: number;
  label?: string;
  middle?: boolean;
}

/** Visibility range row (Minutes/Hours/Days/Weeks/Months). */
export interface VisRangeRow {
  checked: boolean;
  min: number;
  max: number;
}

export type VisRanges = {
  visMinutes: VisRangeRow;
  visHours: VisRangeRow;
  visDays: VisRangeRow;
  visWeeks: VisRangeRow;
  visMonths: VisRangeRow;
};

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
  textOrientation: 'horizontal',
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
  showBorder: true,
  borderColor: '#8C8C8C',
  borderWidth: 1,
  borderLineStyle: 'dashed',
  midLine: false,
  midLineColor: '#8C8C8C',
  midLineWidth: 1,
  midLineStyle: 'dashed',
  labelColor: '#ffffff',
  labelBg: true,
  labelBgColor: 'rgba(0,0,0,0.6)',
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

export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 24] as const;

export const DEFAULT_VIS_RANGES: VisRanges = {
  visMinutes: { checked: true, min: 1, max: 59 },
  visHours: { checked: true, min: 1, max: 24 },
  visDays: { checked: true, min: 1, max: 366 },
  visWeeks: { checked: true, min: 1, max: 52 },
  visMonths: { checked: true, min: 1, max: 12 },
};

export const VIS_RANGE_HARD_MAX: Record<keyof VisRanges, number> = {
  visMinutes: 59,
  visHours: 24,
  visDays: 366,
  visWeeks: 52,
  visMonths: 12,
};

export const VIS_RANGE_LABELS: { key: keyof VisRanges; label: string }[] = [
  { key: 'visMinutes', label: 'Minutes' },
  { key: 'visHours', label: 'Hours' },
  { key: 'visDays', label: 'Days' },
  { key: 'visWeeks', label: 'Weeks' },
  { key: 'visMonths', label: 'Months' },
];

export function cloneStyle(style?: Partial<DrawingStyle>): DrawingStyle {
  const next = { ...DEFAULT_DRAWING_STYLE, ...style };
  // Older saves may omit fillColor — keep stroke/fill visually linked.
  if (!style?.fillColor) next.fillColor = next.color;
  if (!Array.isArray(next.infoMetrics)) next.infoMetrics = [];
  return next;
}

export function dashArrayFor(kind: LineStyleKind | string | undefined): string | undefined {
  if (kind === 'dotted') return '2,4';
  if (kind === 'dashed') return '7,4';
  if (kind === 'dashdot') return '7,4,2,4';
  return undefined;
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
    case 'dashdot':
      ctx.setLineDash([7, 4, 2, 4]);
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

export function endCapFromStyle(
  enabled: boolean,
  style: 'normal' | 'arrow',
): EndCapStyle {
  if (!enabled) return 'none';
  return style;
}

export function applyEndCap(
  cap: EndCapStyle,
): { enabled: boolean; style: 'normal' | 'arrow' } {
  if (cap === 'none') return { enabled: false, style: 'normal' };
  return { enabled: true, style: cap };
}

export function defaultChannelLevels(stroke = '#2962FF'): StyleLevelRow[] {
  const aux = '#1e3a5f';
  return [
    { on: true, value: '0', color: stroke, type: 'solid', width: 2 },
    { on: false, value: '0.25', color: aux, type: 'solid', width: 2 },
    { on: true, value: '0.5', color: stroke, type: 'dashed', width: 1, middle: true, label: 'Middle' },
    { on: false, value: '0.75', color: aux, type: 'solid', width: 2 },
    { on: true, value: '1', color: stroke, type: 'solid', width: 2 },
  ];
}

export function defaultRegLevels(stroke = '#2962FF'): StyleLevelRow[] {
  return [
    { on: true, value: '0', color: stroke, type: 'dashed', width: 2, label: 'Middle Line' },
    { on: true, value: '1', color: stroke, type: 'dashed', width: 2, label: 'Upper Line' },
    { on: true, value: '-1', color: stroke, type: 'dashed', width: 2, label: 'Lower Line' },
  ];
}

export function defaultPitchforkLevels(stroke = '#2962FF'): StyleLevelRow[] {
  return [
    { on: true, value: '0', color: stroke, type: 'solid', width: 2, label: 'Median' },
    { on: true, value: '0.5', color: stroke, type: 'dashed', width: 1 },
    { on: true, value: '1', color: stroke, type: 'solid', width: 1 },
    { on: false, value: '1.5', color: stroke, type: 'dotted', width: 1 },
    { on: false, value: '2', color: stroke, type: 'dotted', width: 1 },
  ];
}

export function normalizeVisRanges(raw?: unknown): VisRanges {
  const out = { ...DEFAULT_VIS_RANGES };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Partial<Record<keyof VisRanges, Partial<VisRangeRow>>>;
  (Object.keys(VIS_RANGE_HARD_MAX) as (keyof VisRanges)[]).forEach((key) => {
    const hm = VIS_RANGE_HARD_MAX[key];
    const cur = src[key];
    if (!cur || typeof cur !== 'object') return;
    let min = Number(cur.min);
    let max = Number(cur.max);
    if (!Number.isFinite(min)) min = 1;
    if (!Number.isFinite(max)) max = hm;
    min = Math.max(1, Math.min(min, hm));
    max = Math.max(min, Math.min(max, hm));
    out[key] = { checked: cur.checked !== false, min, max };
  });
  return out;
}
