import {
  EXIT_REASON_INDEX,
  type ClosedTrade,
  type TradeStore,
} from './types';

const FLAG_AMBIGUOUS = 1;
const FLAG_APPROX = 2;

function tagBit(tags: string[], name: string): number {
  let i = tags.indexOf(name);
  if (i < 0) {
    if (tags.length >= 32) return -1;
    i = tags.length;
    tags.push(name);
  }
  return i;
}

function symbolId(symbols: string[], name: string): number {
  let i = symbols.indexOf(name);
  if (i < 0) {
    i = symbols.length;
    symbols.push(name);
  }
  return i;
}

/** Build columnar store from closed trades (one-shot). */
export function buildTradeStore(
  trades: readonly ClosedTrade[],
  opts?: { accountCurrency?: string; initialBalance?: number },
): TradeStore {
  const n = trades.length;
  const openTime = new Float64Array(n);
  const closeTime = new Float64Array(n);
  const entryPrice = new Float32Array(n);
  const exitPrice = new Float32Array(n);
  const initialStop = new Float32Array(n);
  const netPnl = new Float64Array(n);
  const grossPnl = new Float64Array(n);
  const commission = new Float64Array(n);
  const swap = new Float64Array(n);
  const rMultiple = new Float64Array(n);
  const mfe = new Float32Array(n);
  const mae = new Float32Array(n);
  const balanceAfter = new Float64Array(n);
  const riskPct = new Float32Array(n);
  const entryBarHigh = new Float32Array(n);
  const entryBarLow = new Float32Array(n);
  const side = new Uint8Array(n);
  const exitReason = new Uint8Array(n);
  const flags = new Uint8Array(n);
  const symbolIdArr = new Uint16Array(n);
  const tagBits = new Uint32Array(n);
  const ids: string[] = new Array(n);
  const symbols: string[] = [];
  const tags: string[] = [];

  for (let i = 0; i < n; i++) {
    const t = trades[i]!;
    openTime[i] = t.openTime;
    closeTime[i] = t.closeTime;
    entryPrice[i] = t.entryPrice;
    exitPrice[i] = t.exitPrice;
    initialStop[i] =
      t.initialStopPrice == null ? Number.NaN : t.initialStopPrice;
    netPnl[i] = t.netPnl;
    grossPnl[i] = t.grossPnl;
    commission[i] = t.commission;
    swap[i] = t.swap;
    rMultiple[i] = t.rMultiple == null ? Number.NaN : t.rMultiple;
    mfe[i] = t.mfePrice;
    mae[i] = t.maePrice;
    balanceAfter[i] = t.balanceAfter;
    riskPct[i] = t.riskPct == null ? Number.NaN : t.riskPct;
    entryBarHigh[i] = t.entryBarHigh == null ? Number.NaN : t.entryBarHigh;
    entryBarLow[i] = t.entryBarLow == null ? Number.NaN : t.entryBarLow;
    side[i] = t.side === 'SHORT' ? 1 : 0;
    exitReason[i] = EXIT_REASON_INDEX[t.exitReason] ?? 2;
    let f = 0;
    if (t.ambiguousFill) f |= FLAG_AMBIGUOUS;
    if (t.pnlApproximate) f |= FLAG_APPROX;
    flags[i] = f;
    symbolIdArr[i] = symbolId(symbols, t.symbol);
    let bits = 0;
    for (const tag of t.tags) {
      const b = tagBit(tags, tag);
      if (b >= 0) bits |= 1 << b;
    }
    tagBits[i] = bits >>> 0;
    ids[i] = t.id;
  }

  return {
    n,
    openTime,
    closeTime,
    entryPrice,
    exitPrice,
    initialStop,
    netPnl,
    grossPnl,
    commission,
    swap,
    rMultiple,
    mfe,
    mae,
    balanceAfter,
    riskPct,
    entryBarHigh,
    entryBarLow,
    side,
    exitReason,
    flags,
    symbolId: symbolIdArr,
    tagBits,
    ids,
    symbols,
    tags,
    accountCurrency: opts?.accountCurrency ?? 'USD',
    initialBalance: opts?.initialBalance ?? 10_000,
    version: 1,
  };
}

/** Append one trade by growing arrays (O(n) copy — rare vs full rebuild). */
export function appendTrade(store: TradeStore, t: ClosedTrade): TradeStore {
  const next = buildTradeStore(
    [...storeToClosedTrades(store), t],
    {
      accountCurrency: store.accountCurrency,
      initialBalance: store.initialBalance,
    },
  );
  next.version = store.version + 1;
  return next;
}

/** Materialize ClosedTrade[] only for export / append — not for metrics. */
export function storeToClosedTrades(store: TradeStore): ClosedTrade[] {
  const out: ClosedTrade[] = new Array(store.n);
  const reasons = ['TP', 'SL', 'MANUAL', 'STOP_OUT', 'TRAILING'] as const;
  for (let i = 0; i < store.n; i++) {
    const tagList: string[] = [];
    const bits = store.tagBits[i]!;
    for (let b = 0; b < store.tags.length; b++) {
      if (bits & (1 << b)) tagList.push(store.tags[b]!);
    }
    const r = store.rMultiple[i]!;
    const rp = store.riskPct[i]!;
    const eh = store.entryBarHigh[i]!;
    const el = store.entryBarLow[i]!;
    out[i] = {
      id: store.ids[i]!,
      symbol: store.symbols[store.symbolId[i]!] ?? '?',
      side: store.side[i] === 1 ? 'SHORT' : 'LONG',
      openTime: store.openTime[i]!,
      closeTime: store.closeTime[i]!,
      entryPrice: store.entryPrice[i]!,
      exitPrice: store.exitPrice[i]!,
      size: 0.1,
      initialStopPrice: Number.isFinite(store.initialStop[i]!)
        ? store.initialStop[i]!
        : null,
      initialTargetPrice: null,
      grossPnl: store.grossPnl[i]!,
      commission: store.commission[i]!,
      swap: store.swap[i]!,
      netPnl: store.netPnl[i]!,
      rMultiple: Number.isFinite(r) ? r : null,
      mfePrice: store.mfe[i]!,
      maePrice: store.mae[i]!,
      exitReason: reasons[store.exitReason[i]!] ?? 'MANUAL',
      ambiguousFill: (store.flags[i]! & FLAG_AMBIGUOUS) !== 0,
      pnlApproximate: (store.flags[i]! & FLAG_APPROX) !== 0,
      tags: tagList,
      balanceAfter: store.balanceAfter[i]!,
      riskPct: Number.isFinite(rp) ? rp : null,
      entryBarHigh: Number.isFinite(eh) ? eh : null,
      entryBarLow: Number.isFinite(el) ? el : null,
    };
  }
  return out;
}

/**
 * Heap bytes of typed columnar arrays (ids[] excluded).
 * Layout: 8×f64 + 8×f32 + 3×u8 + u16 + u32 = 105 B/trade → ~10.5 MB @ 100k.
 */
export function estimateStoreBytes(store: TradeStore): number {
  const n = store.n;
  return n * (8 * 8 + 8 * 4 + 3 + 2 + 4) + store.symbols.length * 16 + store.tags.length * 16;
}

export { FLAG_AMBIGUOUS, FLAG_APPROX };
