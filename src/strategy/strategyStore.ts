/**
 * Local strategy bank (V8b myStrategies parity) — persisted, not mock demo pool.
 */
import type { Edge, Node } from 'reactflow';
import { newId } from '@/utils/uuid';

const STORAGE_KEY = 'talaria.strategies.v1';

export interface StrategyRecord {
  id: string;
  name: string;
  desc: string;
  markets: string[];
  timeframes: string[];
  tags: string[];
  variables: { id: string; name: string; kind: 'pre' | 'post' }[];
  nodes: Node[];
  edges: Edge[];
  createdAt: number;
  updatedAt: number;
}

function readAll(): StrategyRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is StrategyRecord =>
        !!s && typeof s === 'object' && typeof (s as StrategyRecord).id === 'string',
    );
  } catch {
    return [];
  }
}

function writeAll(list: StrategyRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[strategies] persist failed', err);
  }
}

export function listStrategies(): StrategyRecord[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getStrategy(id: string): StrategyRecord | null {
  return readAll().find((s) => s.id === id) ?? null;
}

export function saveStrategy(
  input: Omit<StrategyRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  },
): StrategyRecord {
  const all = readAll();
  const now = Date.now();
  if (input.id) {
    const idx = all.findIndex((s) => s.id === input.id);
    if (idx >= 0) {
      const next: StrategyRecord = {
        ...all[idx]!,
        ...input,
        id: input.id,
        updatedAt: now,
      };
      all[idx] = next;
      writeAll(all);
      return next;
    }
  }
  const created: StrategyRecord = {
    id: input.id ?? newId(),
    name: input.name,
    desc: input.desc,
    markets: input.markets,
    timeframes: input.timeframes,
    tags: input.tags,
    variables: input.variables,
    nodes: input.nodes,
    edges: input.edges,
    createdAt: now,
    updatedAt: now,
  };
  writeAll([created, ...all]);
  return created;
}

export function deleteStrategy(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id));
}

const TEMPLATE_VERSION = 1 as const;

export interface StrategyTemplateFile {
  version: typeof TEMPLATE_VERSION;
  exportedAt: number;
  strategies: StrategyRecord[];
}

/** Export one or more strategies as portable JSON (local share/import). */
export function exportStrategiesJson(ids?: string[]): string {
  const all = readAll();
  const strategies =
    ids && ids.length > 0
      ? all.filter((s) => ids.includes(s.id))
      : all;
  const payload: StrategyTemplateFile = {
    version: TEMPLATE_VERSION,
    exportedAt: Date.now(),
    strategies,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportStrategiesResult {
  imported: number;
  skipped: number;
  error?: string;
}

/** Import template JSON — new ids so local copies never collide. */
export function importStrategiesJson(raw: string): ImportStrategiesResult {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { imported: 0, skipped: 0, error: 'Invalid JSON' };
    }
    const bag = parsed as Partial<StrategyTemplateFile> & {
      strategies?: unknown;
    };
    const list = Array.isArray(bag.strategies)
      ? bag.strategies
      : Array.isArray(parsed)
        ? (parsed as unknown[])
        : null;
    if (!list) {
      return { imported: 0, skipped: 0, error: 'No strategies array' };
    }
    let imported = 0;
    let skipped = 0;
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        skipped += 1;
        continue;
      }
      const s = item as Partial<StrategyRecord>;
      if (typeof s.name !== 'string' || !Array.isArray(s.nodes)) {
        skipped += 1;
        continue;
      }
      saveStrategy({
        name: s.name.endsWith(' (import)')
          ? s.name
          : `${s.name} (import)`,
        desc: typeof s.desc === 'string' ? s.desc : '',
        markets: Array.isArray(s.markets) ? s.markets.map(String) : [],
        timeframes: Array.isArray(s.timeframes)
          ? s.timeframes.map(String)
          : [],
        tags: Array.isArray(s.tags) ? s.tags.map(String) : ['import'],
        variables: Array.isArray(s.variables) ? s.variables : [],
        nodes: s.nodes,
        edges: Array.isArray(s.edges) ? s.edges : [],
      });
      imported += 1;
    }
    return { imported, skipped };
  } catch (err) {
    return {
      imported: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : 'Parse failed',
    };
  }
}

export function emptyCanvas(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      {
        id: 'entry',
        type: 'section',
        position: { x: 80, y: 160 },
        data: { label: 'Entry', kind: 'entry' },
      },
      {
        id: 'exit',
        type: 'section',
        position: { x: 560, y: 160 },
        data: { label: 'Exit', kind: 'exit' },
      },
    ],
    edges: [],
  };
}
