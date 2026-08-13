import type { ChartBar } from '@/types/bar';
import { MAX_BARS_IN_MEMORY } from '@/utils/constants';

/**
 * Merge two ascending ChartBar series by `time`.
 * Same timestamp → `incoming` wins. Cap is tip-biased (keeps the newest bars)
 * so a history left-pad cannot drop replay runway ahead of the cursor.
 */
export function mergeBarsByTime(
  existing: readonly ChartBar[],
  incoming: readonly ChartBar[],
  maxBars: number = MAX_BARS_IN_MEMORY,
): ChartBar[] {
  const cap = Math.max(1, maxBars);
  if (incoming.length === 0) {
    return tipCap(existing, cap);
  }
  if (existing.length === 0) {
    return tipCap(incoming, cap);
  }

  const ex0 = existing[0]!.time;
  const exTip = existing[existing.length - 1]!.time;
  const in0 = incoming[0]!.time;
  const inTip = incoming[incoming.length - 1]!.time;

  // Disjoint: incoming entirely older (common cold-start left-pad).
  if (inTip < ex0) {
    return tipCap([...incoming, ...existing], cap);
  }
  // Disjoint: incoming entirely newer.
  if (exTip < in0) {
    return tipCap([...existing, ...incoming], cap);
  }

  const map = new Map<number, ChartBar>();
  for (const b of existing) map.set(b.time, b);
  for (const b of incoming) map.set(b.time, b);
  const times = [...map.keys()].sort((a, b) => a - b);
  const start = Math.max(0, times.length - cap);
  const out: ChartBar[] = [];
  for (let i = start; i < times.length; i++) {
    const b = map.get(times[i]!)!;
    out.push({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    });
  }
  return out;
}

function tipCap(bars: readonly ChartBar[], cap: number): ChartBar[] {
  if (bars.length <= cap) {
    return bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
  }
  const start = bars.length - cap;
  const out: ChartBar[] = [];
  for (let i = start; i < bars.length; i++) {
    const b = bars[i]!;
    out.push({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    });
  }
  return out;
}
