import {
  inferChartAssetClass,
  normalizeSymForBadge,
} from '@/v9/chartSymbolBadge.jsx';

/** UI market categories for ticker lists (TV-style). */
export type SymbolAssetClass = 'Forex' | 'Futures' | 'Crypto' | 'Stocks';

const CATEGORY_ORDER: SymbolAssetClass[] = [
  'Forex',
  'Futures',
  'Crypto',
  'Stocks',
];

const CATEGORY_HINT: Record<SymbolAssetClass, string> = {
  Forex: 'FX majors & metals',
  Futures: 'Index · energy · rates',
  Crypto: 'Digital assets',
  Stocks: 'Equities',
};

export function classifySymbolAsset(symbol: string): SymbolAssetClass {
  const ac = String(inferChartAssetClass(symbol) || 'Forex');
  if (ac === 'Futures' || ac === 'Crypto' || ac === 'Stocks') return ac;
  return 'Forex';
}

export function formatPairDisplay(symbol: string): string {
  const raw = String(symbol || '').trim();
  if (!raw) return '';
  if (raw.includes('/')) return raw.toUpperCase();
  const flat = normalizeSymForBadge(raw);
  if (classifySymbolAsset(flat) === 'Forex' && flat.length === 6) {
    return `${flat.slice(0, 3)}/${flat.slice(3)}`;
  }
  return raw.toUpperCase();
}

export function symbolSubtitle(symbol: string): string {
  const ac = classifySymbolAsset(symbol);
  const display = formatPairDisplay(symbol);
  if (ac === 'Forex' && display.includes('/')) {
    const [b, q] = display.split('/');
    if (b === 'XAU') return 'Gold · spot';
    if (b === 'XAG') return 'Silver · spot';
    return `${b} / ${q}`;
  }
  if (ac === 'Futures') return 'Futures contract';
  return ac;
}

export function groupSymbolsByAsset<T extends { pair: string }>(
  items: readonly T[],
): { id: SymbolAssetClass; label: string; hint: string; items: T[] }[] {
  const buckets = new Map<SymbolAssetClass, T[]>();
  for (const id of CATEGORY_ORDER) buckets.set(id, []);
  for (const item of items) {
    const ac = classifySymbolAsset(item.pair);
    buckets.get(ac)!.push(item);
  }
  return CATEGORY_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map(
    (id) => ({
      id,
      label: id,
      hint: CATEGORY_HINT[id],
      items: buckets.get(id)!,
    }),
  );
}
