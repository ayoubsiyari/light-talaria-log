import { newId } from '@/utils/uuid';
import { TOOLS, defaultStyleFor, type DrawingToolId } from './toolRegistry';
import { cloneStyle, type DrawingStyle } from './drawingStyle';
import { getDrawingTemplate } from './drawingTemplates';
import { defaultMetaFor, resolveMeta } from './toolSettings';
import {
  normalizeVisibleOnTfs,
  type DrawingVisibleOnTfs,
} from './visibility';

export type { DrawingToolId } from './toolRegistry';
export type { DrawingVisibleOnTfs } from './visibility';
/** @deprecated use DrawingToolId — kept for migration */
export type DrawingType = DrawingToolId;

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingToolId;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;
  /** Custom display name in settings header (defaults to tool label). */
  name?: string;
  /** Per-object lock (TV padlock on floating toolbar). */
  locked?: boolean;
  /** When false, object is hidden but kept in store. */
  visible?: boolean;
  /**
   * Per-timeframe visibility (TV Visibility tab).
   * `'all'` / undefined = every TF; otherwise only listed TFs.
   */
  visibleOnTfs?: DrawingVisibleOnTfs;
  meta?: Record<string, unknown>;
}

const STORAGE_PREFIX = 'fast-chart.drawings.v2:';
const LEGACY_PREFIX = 'fast-chart.drawings.v1:';

const LEGACY_TYPE_MAP: Record<string, DrawingToolId> = {
  trendLine: 'trendLine',
  hline: 'hline',
  fib: 'fibRetracement',
};

function migrateLegacy(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const legacyType = typeof o.type === 'string' ? o.type : '';
    const type = LEGACY_TYPE_MAP[legacyType];
    if (!type) continue;
    const points = Array.isArray(o.points) ? (o.points as DrawingPoint[]) : [];
    out.push({
      id: typeof o.id === 'string' ? o.id : newId(),
      type,
      points,
      style: defaultStyleFor(type),
    });
  }
  return out;
}

function normalizeDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== 'string' || !Array.isArray(o.points)) return null;
  const type = o.type as DrawingToolId;
  if (!(type in TOOLS)) return null;
  return {
    id: typeof o.id === 'string' ? o.id : newId(),
    type,
    points: o.points as DrawingPoint[],
    style: cloneStyle(o.style as Partial<DrawingStyle> | undefined),
    text: typeof o.text === 'string' ? o.text : undefined,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : undefined,
    locked: o.locked === true,
    visible: o.visible === false ? false : true,
    visibleOnTfs: normalizeVisibleOnTfs(o.visibleOnTfs),
    meta: resolveMeta(
      type,
      o.meta && typeof o.meta === 'object'
        ? (o.meta as Record<string, unknown>)
        : undefined,
    ),
  };
}

export function loadDrawings(sessionKey: string): Drawing[] {
  try {
    const v2 = localStorage.getItem(STORAGE_PREFIX + sessionKey);
    if (v2) {
      const parsed: unknown = JSON.parse(v2);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeDrawing).filter((d): d is Drawing => d != null);
    }
    const v1 = localStorage.getItem(LEGACY_PREFIX + sessionKey);
    if (v1) {
      const migrated = migrateLegacy(JSON.parse(v1));
      if (migrated.length > 0) saveDrawings(sessionKey, migrated);
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveDrawings(sessionKey: string, drawings: Drawing[]): void {
  localStorage.setItem(STORAGE_PREFIX + sessionKey, JSON.stringify(drawings));
}

export function createDrawing(
  type: DrawingToolId,
  points: DrawingPoint[],
  extras?: {
    text?: string;
    name?: string;
    style?: Partial<DrawingStyle>;
    meta?: Record<string, unknown>;
    locked?: boolean;
    visible?: boolean;
    visibleOnTfs?: DrawingVisibleOnTfs;
  },
): Drawing {
  const tmpl = getDrawingTemplate(type);
  return {
    id: newId(),
    type,
    points,
    style: cloneStyle({
      ...defaultStyleFor(type),
      ...tmpl?.style,
      ...extras?.style,
    }),
    text: extras?.text,
    name: extras?.name,
    locked: extras?.locked ?? false,
    visible: extras?.visible ?? true,
    visibleOnTfs: extras?.visibleOnTfs ?? 'all',
    meta: resolveMeta(
      type,
      extras?.meta ?? tmpl?.meta ?? defaultMetaFor(type),
    ),
  };
}

/** In-progress preview — stable id, no persistence, softer opacity. */
export function createDraftDrawing(
  type: DrawingToolId,
  points: DrawingPoint[],
): Drawing {
  const base = defaultStyleFor(type);
  return {
    id: 'draft',
    type,
    points,
    style: cloneStyle({
      ...base,
      opacity: Math.min(base.opacity, 0.85),
    }),
    meta: defaultMetaFor(type),
    locked: false,
    visible: true,
  };
}

export { pointsNeeded } from './toolRegistry';
