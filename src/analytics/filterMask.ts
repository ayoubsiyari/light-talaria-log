import { FLAG_AMBIGUOUS, FLAG_APPROX } from './tradeStore';
import {
  EXIT_REASON_INDEX,
  type FilterState,
  type TradeStore,
} from './types';

/** One bit per trade packed in Uint8Array (byte = 8 trades). */
export type FilterMask = Uint8Array;

export function createMask(n: number, fill = true): FilterMask {
  const bytes = Math.ceil(n / 8);
  const m = new Uint8Array(bytes);
  if (fill) m.fill(0xff);
  // Clear unused high bits in last byte
  const rem = n % 8;
  if (rem !== 0 && bytes > 0) {
    m[bytes - 1] = (1 << rem) - 1;
  }
  return m;
}

export function maskGet(mask: FilterMask, i: number): boolean {
  return (mask[i >>> 3]! & (1 << (i & 7))) !== 0;
}

export function maskSet(mask: FilterMask, i: number, on: boolean): void {
  const b = i >>> 3;
  const bit = 1 << (i & 7);
  if (on) mask[b]! |= bit;
  else mask[b]! &= ~bit;
}

export function maskCount(mask: FilterMask, n: number): number {
  let c = 0;
  for (let i = 0; i < n; i++) if (maskGet(mask, i)) c++;
  return c;
}

/** Single pass: apply FilterState → bitset. Never copies trade data. */
export function computeFilterMask(store: TradeStore, filter: FilterState): FilterMask {
  const n = store.n;
  const mask = createMask(n, false);
  const symFilter =
    filter.symbols && filter.symbols.size > 0
      ? new Set(
          [...filter.symbols].map((s) => store.symbols.indexOf(s)).filter((i) => i >= 0),
        )
      : null;
  const tagFilter =
    filter.tags && filter.tags.size > 0
      ? [...filter.tags]
          .map((t) => store.tags.indexOf(t))
          .filter((i) => i >= 0)
      : null;
  const exitFilter =
    filter.exitReasons && filter.exitReasons.size > 0
      ? new Set([...filter.exitReasons].map((r) => EXIT_REASON_INDEX[r]))
      : null;

  for (let i = 0; i < n; i++) {
    if (!filter.sides.long && store.side[i] === 0) continue;
    if (!filter.sides.short && store.side[i] === 1) continue;
    const ct = store.closeTime[i]!;
    if (filter.fromTime != null && ct < filter.fromTime) continue;
    if (filter.toTime != null && ct > filter.toTime) continue;
    if (symFilter && !symFilter.has(store.symbolId[i]!)) continue;
    if (exitFilter && !exitFilter.has(store.exitReason[i]!)) continue;
    if (filter.hideAmbiguous && (store.flags[i]! & FLAG_AMBIGUOUS) !== 0) continue;
    if (filter.hideApproximate && (store.flags[i]! & FLAG_APPROX) !== 0) continue;
    if (tagFilter && tagFilter.length > 0) {
      const bits = store.tagBits[i]!;
      let hit = false;
      for (const b of tagFilter) {
        if (bits & (1 << b)) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
    }
    maskSet(mask, i, true);
  }
  return mask;
}

export function selectedIndices(mask: FilterMask, n: number): Uint32Array {
  const count = maskCount(mask, n);
  const out = new Uint32Array(count);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (maskGet(mask, i)) out[k++] = i;
  }
  return out;
}

/** Stable hash of filter for cache keys. */
export function hashFilter(filter: FilterState): string {
  return JSON.stringify({
    f: filter.fromTime,
    t: filter.toTime,
    L: filter.sides.long,
    S: filter.sides.short,
    sym: filter.symbols ? [...filter.symbols].sort() : null,
    tags: filter.tags ? [...filter.tags].sort() : null,
    ex: filter.exitReasons ? [...filter.exitReasons].sort() : null,
    ha: filter.hideAmbiguous,
    hp: filter.hideApproximate,
  });
}
