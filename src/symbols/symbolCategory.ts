import {
  inferChartAssetClass,
  normalizeSymForBadge,
} from '@/v9/chartSymbolBadge.jsx';

/** UI market categories — catalog is Forex + Futures only. */
export type SymbolAssetClass = 'Forex' | 'Futures';

const CATEGORY_ORDER: SymbolAssetClass[] = ['Forex', 'Futures'];

const CATEGORY_HINT: Record<SymbolAssetClass, string> = {
  Forex: 'FX majors & metals',
  Futures: 'Index · energy · rates',
};

export function classifySymbolAsset(symbol: string): SymbolAssetClass {
  const ac = String(inferChartAssetClass(symbol) || 'Forex');
  return ac === 'Futures' ? 'Futures' : 'Forex';
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
  for (const id of CATEGORY_ORDER) {
    buckets.get(id)!.sort((a, b) =>
      formatPairDisplay(a.pair).localeCompare(formatPairDisplay(b.pair)),
    );
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

/** Normalize remote / slug symbols into a display pair id. */
export function normalizePairSymbol(symbol: string): string {
  const raw = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.includes('/')) {
    const [b, q] = raw.split('/');
    if (b && q) return `${b}/${q}`;
  }
  const compact = raw.replace(/[/\-_.]/g, '');
  if (classifySymbolAsset(compact) === 'Forex' && compact.length === 6) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }
  return compact;
}
