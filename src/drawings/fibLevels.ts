/**
 * TradingView-like Fibonacci / multi-level line definitions.
 * Levels are editable (coeff + visibility + color + line style).
 */
import type { LineStyleKind } from '@/drawings/drawingStyle';
import type { DrawingToolId } from '@/drawings/toolRegistry';

export interface FibLevel {
  coeff: number;
  visible: boolean;
  color: string;
  lineStyle: LineStyleKind;
}

export type FibLabelMode = 'values' | 'percent' | 'both';

export interface FibMeta {
  levels: FibLevel[];
  /** Show coefficient labels (0.618, …). */
  showLabels: boolean;
  /** Show price at each level. */
  showPrices: boolean;
  reverse: boolean;
  extendLeft: boolean;
  extendRight: boolean;
  /** Fill bands between consecutive levels. */
  showZones: boolean;
  /** Label content: price values, coeffs, or both. */
  labelMode: FibLabelMode;
}

/** Classic retracement / extension coeffs with TV-ish colors. */
export const DEFAULT_FIB_LEVEL_DEFS: readonly FibLevel[] = [
  { coeff: 0, visible: true, color: '#787B86', lineStyle: 'solid' },
  { coeff: 0.236, visible: true, color: '#F23645', lineStyle: 'solid' },
  { coeff: 0.382, visible: true, color: '#FF9800', lineStyle: 'solid' },
  { coeff: 0.5, visible: true, color: '#4CAF50', lineStyle: 'solid' },
  { coeff: 0.618, visible: true, color: '#089981', lineStyle: 'solid' },
  { coeff: 0.786, visible: true, color: '#00BCD4', lineStyle: 'solid' },
  { coeff: 1, visible: true, color: '#787B86', lineStyle: 'solid' },
  { coeff: 1.272, visible: false, color: '#2962FF', lineStyle: 'dashed' },
  { coeff: 1.618, visible: true, color: '#E91E63', lineStyle: 'dashed' },
  { coeff: 2.618, visible: false, color: '#9C27B0', lineStyle: 'dashed' },
  { coeff: 3.618, visible: false, color: '#673AB7', lineStyle: 'dotted' },
  { coeff: 4.236, visible: false, color: '#795548', lineStyle: 'dotted' },
];

/** Coeff-only list kept for callers that still want numbers. */
export const DEFAULT_FIB_LEVELS = DEFAULT_FIB_LEVEL_DEFS.map((l) => l.coeff);

const FAN_LEVELS: readonly FibLevel[] = [
  { coeff: 0.25, visible: true, color: '#F23645', lineStyle: 'solid' },
  { coeff: 0.382, visible: true, color: '#FF9800', lineStyle: 'solid' },
  { coeff: 0.5, visible: true, color: '#4CAF50', lineStyle: 'solid' },
  { coeff: 0.618, visible: true, color: '#089981', lineStyle: 'solid' },
  { coeff: 0.75, visible: true, color: '#00BCD4', lineStyle: 'solid' },
  { coeff: 1, visible: true, color: '#787B86', lineStyle: 'solid' },
];

const TIMEZONE_LEVELS: readonly FibLevel[] = [
  { coeff: 0, visible: true, color: '#787B86', lineStyle: 'solid' },
  { coeff: 1, visible: true, color: '#F23645', lineStyle: 'dashed' },
  { coeff: 2, visible: true, color: '#FF9800', lineStyle: 'dashed' },
  { coeff: 3, visible: true, color: '#4CAF50', lineStyle: 'dashed' },
  { coeff: 5, visible: true, color: '#089981', lineStyle: 'dashed' },
  { coeff: 8, visible: true, color: '#00BCD4', lineStyle: 'dashed' },
  { coeff: 13, visible: true, color: '#2962FF', lineStyle: 'dashed' },
  { coeff: 21, visible: true, color: '#E91E63', lineStyle: 'dashed' },
  { coeff: 34, visible: false, color: '#9C27B0', lineStyle: 'dotted' },
];

const CHANNEL_LEVELS: readonly FibLevel[] = [
  { coeff: 0, visible: true, color: '#787B86', lineStyle: 'solid' },
  { coeff: 0.382, visible: true, color: '#FF9800', lineStyle: 'solid' },
  { coeff: 0.5, visible: true, color: '#4CAF50', lineStyle: 'solid' },
  { coeff: 0.618, visible: true, color: '#089981', lineStyle: 'solid' },
  { coeff: 1, visible: true, color: '#787B86', lineStyle: 'solid' },
  { coeff: 1.618, visible: false, color: '#E91E63', lineStyle: 'dashed' },
];

const CIRCLE_LEVELS: readonly FibLevel[] = [
  { coeff: 0.382, visible: true, color: '#FF9800', lineStyle: 'solid' },
  { coeff: 0.5, visible: true, color: '#4CAF50', lineStyle: 'solid' },
  { coeff: 0.618, visible: true, color: '#089981', lineStyle: 'solid' },
  { coeff: 1, visible: true, color: '#787B86', lineStyle: 'solid' },
  { coeff: 1.618, visible: true, color: '#E91E63', lineStyle: 'dashed' },
  { coeff: 2.618, visible: false, color: '#9C27B0', lineStyle: 'dotted' },
];

const GANN_FAN_LEVELS: readonly FibLevel[] = [
  { coeff: 0.125, visible: true, color: '#F23645', lineStyle: 'solid' },
  { coeff: 0.25, visible: true, color: '#FF9800', lineStyle: 'solid' },
  { coeff: 0.333, visible: true, color: '#FFEB3B', lineStyle: 'solid' },
  { coeff: 0.5, visible: true, color: '#4CAF50', lineStyle: 'solid' },
  { coeff: 1, visible: true, color: '#787B86', lineStyle: 'solid' },
  { coeff: 2, visible: true, color: '#00BCD4', lineStyle: 'solid' },
  { coeff: 3, visible: true, color: '#2962FF', lineStyle: 'solid' },
  { coeff: 4, visible: true, color: '#E91E63', lineStyle: 'solid' },
  { coeff: 8, visible: true, color: '#9C27B0', lineStyle: 'solid' },
];

const CYCLE_LEVELS: readonly FibLevel[] = Array.from({ length: 9 }, (_, i) => ({
  coeff: i,
  visible: true,
  color: i === 0 ? '#787B86' : '#2962FF',
  lineStyle: (i === 0 ? 'solid' : 'dashed') as LineStyleKind,
}));

const LINE_STYLES = new Set<LineStyleKind>(['solid', 'dashed', 'dotted']);

function colorForCoeff(coeff: number): string {
  const hit = DEFAULT_FIB_LEVEL_DEFS.find((l) => Math.abs(l.coeff - coeff) < 1e-9);
  return hit?.color ?? '#2962FF';
}

function isFibLevel(v: unknown): v is FibLevel {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.coeff === 'number' && Number.isFinite(o.coeff);
}

/** Normalize legacy `number[]` or partial objects into FibLevel[]. */
export function normalizeFibLevels(
  raw: unknown,
  fallback: readonly FibLevel[],
): FibLevel[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return fallback.map((l) => ({ ...l }));
  }
  // Legacy: plain number array = visible coeffs only.
  if (typeof raw[0] === 'number') {
    const nums = raw.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    if (nums.length === 0) return fallback.map((l) => ({ ...l }));
    const byCoeff = new Map(fallback.map((l) => [l.coeff, l]));
    // Keep full catalog from fallback; toggle visibility from the number list.
    if (fallback.length > 0) {
      return fallback.map((l) => ({
        ...l,
        visible: nums.some((n) => Math.abs(n - l.coeff) < 1e-9),
      }));
    }
    return nums.map((coeff) => {
      const base = byCoeff.get(coeff);
      return {
        coeff,
        visible: true,
        color: base?.color ?? colorForCoeff(coeff),
        lineStyle: base?.lineStyle ?? 'solid',
      };
    });
  }
  const out: FibLevel[] = [];
  for (const item of raw) {
    if (!isFibLevel(item)) continue;
    const o = item as FibLevel & Record<string, unknown>;
    const lineStyle =
      typeof o.lineStyle === 'string' && LINE_STYLES.has(o.lineStyle as LineStyleKind)
        ? (o.lineStyle as LineStyleKind)
        : 'solid';
    out.push({
      coeff: o.coeff,
      visible: typeof o.visible === 'boolean' ? o.visible : true,
      color: typeof o.color === 'string' && o.color ? o.color : colorForCoeff(o.coeff),
      lineStyle,
    });
  }
  return out.length > 0 ? out : fallback.map((l) => ({ ...l }));
}

export function defaultFibLevelsFor(type: DrawingToolId): FibLevel[] {
  switch (type) {
    case 'fibTimezone':
    case 'fibTrendTime':
      return TIMEZONE_LEVELS.map((l) => ({ ...l }));
    case 'fibFan':
    case 'fibSpeedFan':
      return FAN_LEVELS.map((l) => ({ ...l }));
    case 'fibChannel':
      return CHANNEL_LEVELS.map((l) => ({ ...l }));
    case 'fibCircles':
    case 'fibSpeedArcs':
    case 'fibWedge':
    case 'fibSpiral':
      return CIRCLE_LEVELS.map((l) => ({ ...l }));
    case 'gannFan':
      return GANN_FAN_LEVELS.map((l) => ({ ...l }));
    case 'cyclicLines':
      return CYCLE_LEVELS.map((l) => ({ ...l }));
    default:
      return DEFAULT_FIB_LEVEL_DEFS.map((l) => ({ ...l }));
  }
}

export function defaultFibMetaFor(type: DrawingToolId): FibMeta {
  const extend =
    type === 'fibExtension' || type === 'fibChannel' || type === 'fibTimezone';
  return {
    levels: defaultFibLevelsFor(type),
    showLabels: true,
    showPrices: type === 'fibRetracement' || type === 'fibExtension',
    reverse: false,
    extendLeft: false,
    extendRight: extend,
    showZones: true,
    labelMode: 'both',
  };
}

/** Resolve fib meta with migration from legacy `extendLines` / number[] levels. */
export function resolveFibMeta(
  type: DrawingToolId,
  meta?: Record<string, unknown>,
): FibMeta {
  const base = defaultFibMetaFor(type);
  if (!meta) return base;
  const levels = normalizeFibLevels(meta.levels, base.levels);
  let extendLeft = typeof meta.extendLeft === 'boolean' ? meta.extendLeft : base.extendLeft;
  let extendRight =
    typeof meta.extendRight === 'boolean' ? meta.extendRight : base.extendRight;
  // Legacy single flag.
  if (typeof meta.extendLines === 'boolean' && meta.extendLeft == null && meta.extendRight == null) {
    extendLeft = meta.extendLines;
    extendRight = meta.extendLines;
  }
  const labelModeRaw = meta.labelMode;
  const labelMode: FibLabelMode =
    labelModeRaw === 'values' || labelModeRaw === 'percent' || labelModeRaw === 'both'
      ? labelModeRaw
      : base.labelMode;
  return {
    levels,
    showLabels: typeof meta.showLabels === 'boolean' ? meta.showLabels : base.showLabels,
    showPrices: typeof meta.showPrices === 'boolean' ? meta.showPrices : base.showPrices,
    reverse: typeof meta.reverse === 'boolean' ? meta.reverse : base.reverse,
    extendLeft,
    extendRight,
    showZones: typeof meta.showZones === 'boolean' ? meta.showZones : base.showZones,
    labelMode,
  };
}

export function visibleFibLevels(levels: readonly FibLevel[]): FibLevel[] {
  return levels.filter((l) => l.visible && Number.isFinite(l.coeff));
}

export function formatFibCoeff(coeff: number): string {
  if (Number.isInteger(coeff)) return String(coeff);
  const s = coeff.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}
