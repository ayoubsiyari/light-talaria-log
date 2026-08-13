import { useCallback, useState } from 'react';
import type { Timeframe } from '@/types/ui';

const STORAGE_KEY = 'talaria.pinnedTimeframes.v1';
const DEFAULT_PINNED: string[] = ['1m', '5m', '15m', '1H', '4H', '1D'];

function normalizePin(id: string): string {
  if (id === '1h') return '1H';
  if (id === '4h') return '4H';
  return id;
}

function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PINNED];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PINNED];
    const next = parsed
      .filter((x): x is string => typeof x === 'string')
      .map(normalizePin);
    return next.length > 0 ? next : [...DEFAULT_PINNED];
  } catch {
    return [...DEFAULT_PINNED];
  }
}

function writePinned(list: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(normalizePin)));
}

/** TradingView-style favorite/pinned intervals for the top toolbar. */
export function usePinnedTimeframes() {
  const [pinned, setPinned] = useState<string[]>(() => readPinned());

  const isPinned = useCallback(
    (tf: string | Timeframe) => {
      const n = normalizePin(tf);
      return pinned.some((p) => normalizePin(p) === n);
    },
    [pinned],
  );

  const togglePin = useCallback((tf: string | Timeframe) => {
    const n = normalizePin(tf);
    setPinned((prev) => {
      const has = prev.some((p) => normalizePin(p) === n);
      const next = has
        ? prev.filter((x) => normalizePin(x) !== n)
        : [...prev, n];
      writePinned(next);
      return next;
    });
  }, []);

  const setPinnedOrder = useCallback((next: string[]) => {
    const norm = next.map(normalizePin);
    setPinned(norm);
    writePinned(norm);
  }, []);

  return { pinned, isPinned, togglePin, setPinnedOrder, defaults: DEFAULT_PINNED };
}
