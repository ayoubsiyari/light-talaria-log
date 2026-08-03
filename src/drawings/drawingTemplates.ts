/**
 * Per-tool drawing style(+meta) defaults — TradingView-like template menu.
 * Keyed by drawing tool id in localStorage.
 */
import type { DrawingStyle } from '@/drawings/drawingStyle';
import { cloneStyle } from '@/drawings/drawingStyle';
import type { DrawingToolId } from '@/drawings/toolRegistry';
import { defaultStyleFor } from '@/drawings/toolRegistry';
import { defaultMetaFor, resolveMeta } from '@/drawings/toolSettings';

const STORAGE_KEY = 'talaria.drawingTemplates.v1';

export interface DrawingTemplate {
  style: DrawingStyle;
  meta: Record<string, unknown>;
}

type TemplateMap = Partial<Record<DrawingToolId, DrawingTemplate>>;

function readAll(): TemplateMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TemplateMap;
  } catch {
    return {};
  }
}

function writeAll(map: TemplateMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[drawingTemplates] persist failed', err);
  }
}

export function getDrawingTemplate(type: DrawingToolId): DrawingTemplate | null {
  const t = readAll()[type];
  if (!t || !t.style) return null;
  return {
    style: cloneStyle(t.style),
    meta: resolveMeta(type, t.meta ?? {}),
  };
}

/** Saved template, or registry defaults when none saved. */
export function resolveDrawingTemplate(type: DrawingToolId): DrawingTemplate {
  const saved = getDrawingTemplate(type);
  if (saved) return saved;
  return {
    style: cloneStyle(defaultStyleFor(type)),
    meta: defaultMetaFor(type),
  };
}

export function saveDrawingTemplate(
  type: DrawingToolId,
  style: DrawingStyle,
  meta: Record<string, unknown>,
): void {
  const map = readAll();
  map[type] = {
    style: cloneStyle(style),
    meta: resolveMeta(type, meta),
  };
  writeAll(map);
}

export function clearDrawingTemplate(type: DrawingToolId): void {
  const map = readAll();
  delete map[type];
  writeAll(map);
}

export function hasDrawingTemplate(type: DrawingToolId): boolean {
  return getDrawingTemplate(type) != null;
}
