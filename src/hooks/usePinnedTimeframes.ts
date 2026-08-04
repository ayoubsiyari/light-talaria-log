import { useCallback, useState } from 'react';
import { ALL_TIMEFRAMES_ORDERED, isKnownTimeframe } from '@/data/timeframeAgg';
import type { Timeframe } from '@/types/ui';

const STORAGE_KEY = 'talaria.pinnedTimeframes.v2';
const DEFAULT_PINNED: Timeframe[] = [
  '1s',
  '5s',
  '15s',
  '30s',
  '1m',
  '5m',
  '15m',
  '1h',
];

function readPinned(): Timeframe[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PINNED];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PINNED];
    const next = parsed.filter(
      (x): x is Timeframe => typeof x === 'string' && isKnownTimeframe(x),
    );
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
    const filtered = next.filter((tf) => ALL_TIMEFRAMES_ORDERED.includes(tf));
    setPinned(filtered);
    writePinned(filtered);
  }, []);

  return { pinned, isPinned, togglePin, setPinnedOrder, defaults: DEFAULT_PINNED };
}
