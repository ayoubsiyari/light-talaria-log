import { EXIT_REASON_LABEL, type TradeStore } from './types';
import { FLAG_AMBIGUOUS, FLAG_APPROX } from './tradeStore';

/**
 * Stream filtered trades to a CSV download in chunks — never one giant string (§5).
 */
export async function exportFilteredCsv(
  store: TradeStore,
  indices: Uint32Array,
  filename = 'trades.csv',
): Promise<void> {
  const header =
    'id,symbol,side,openTime,closeTime,entry,exit,netPnl,commission,swap,rMultiple,exitReason,ambiguous,pnlApproximate,tags\n';
  const parts: BlobPart[] = [header];
  const chunkSize = 2_000;
  let buf = '';
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]!;
    const tags: string[] = [];
    const bits = store.tagBits[i]!;
    for (let b = 0; b < store.tags.length; b++) {
      if (bits & (1 << b)) tags.push(store.tags[b]!);
    }
    const r = store.rMultiple[i]!;
    buf +=
      [
        store.ids[i],
        store.symbols[store.symbolId[i]!] ?? '',
        store.side[i] === 1 ? 'SHORT' : 'LONG',
        store.openTime[i],
        store.closeTime[i],
        store.entryPrice[i],
        store.exitPrice[i],
        store.netPnl[i],
        store.commission[i],
        store.swap[i],
        Number.isFinite(r) ? r : '',
        EXIT_REASON_LABEL[store.exitReason[i]!] ?? 'MANUAL',
        (store.flags[i]! & FLAG_AMBIGUOUS) !== 0 ? 1 : 0,
        (store.flags[i]! & FLAG_APPROX) !== 0 ? 1 : 0,
        `"${tags.join(';')}"`,
      ].join(',') + '\n';
    if ((k + 1) % chunkSize === 0) {
      parts.push(buf);
      buf = '';
      await Promise.resolve(); // yield to keep UI responsive
    }
  }
  if (buf) parts.push(buf);
  const blob = new Blob(parts, { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
