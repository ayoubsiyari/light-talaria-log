import { useCallback, useState } from 'react';
import type { Timeframe } from '@/types/ui';

const STORAGE_KEY = 'talaria.pinnedTimeframes.v1';
const DEFAULT_PINNED: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

function readPinned(): Timeframe[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PINNED];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PINNED];
    const next = parsed.filter((x): x is Timeframe => typeof x === 'string');
    return next.length > 0 ? next : [...DEFAULT_PINNED];
  } catch {
    return [...DEFAULT_PINNED];
  }
}

function writePinned(list: Timeframe[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** TradingView-style favorite/pinned intervals for the top toolbar. */
export function usePinnedTimeframes() {
  const [pinned, setPinned] = useState<Timeframe[]>(() => readPinned());

  const isPinned = useCallback((tf: Timeframe) => pinned.includes(tf), [pinned]);

  const togglePin = useCallback((tf: Timeframe) => {
    setPinned((prev) => {
      const next = prev.includes(tf) ? prev.filter((x) => x !== tf) : [...prev, tf];
      writePinned(next);
      return next;
    });
  }, []);

  const setPinnedOrder = useCallback((next: Timeframe[]) => {
    setPinned(next);
    writePinned(next);
  }, []);

  return { pinned, isPinned, togglePin, setPinnedOrder, defaults: DEFAULT_PINNED };
}
