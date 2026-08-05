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
