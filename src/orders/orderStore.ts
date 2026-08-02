import type { ChartOrder, OrderSide } from '@/types/order';
import { newId } from '@/utils/uuid';

const STORAGE_KEY = 'talaria.orders.v1';

function readAll(): ChartOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChartOrder[];
  } catch {
    return [];
  }
}

function writeAll(orders: ChartOrder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function listOrdersForSession(sessionId: string): ChartOrder[] {
  return readAll().filter((o) => o.sessionId === sessionId);
}

export function saveOrdersForSession(sessionId: string, orders: ChartOrder[]): void {
  const others = readAll().filter((o) => o.sessionId !== sessionId);
  writeAll([...others, ...orders]);
}

/** Rough pip size for FX / XAU mock SL-TP offsets. */
export function pipSizeForPair(pair: string): number {
  if (pair.includes('JPY')) return 0.01;
  if (pair.startsWith('XAU')) return 0.1;
  return 0.0001;
}

export function createMockOrder(input: {
  sessionId: string;
  pair: string;
  side: OrderSide;
  entry: number;
}): ChartOrder {
  const pip = pipSizeForPair(input.pair);
  const risk = pip * 20;
  const reward = pip * 40;
  const dir = input.side === 'buy' ? 1 : -1;
  return {
    id: newId(),
    sessionId: input.sessionId,
    pair: input.pair,
    side: input.side,
    entry: input.entry,
    stopLoss: input.entry - dir * risk,
    takeProfit: input.entry + dir * reward,
    createdAt: Date.now(),
  };
}
