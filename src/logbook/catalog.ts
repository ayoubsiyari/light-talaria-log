/**
 * Journal ticker universe — FX majors/minors/crosses/metals + CME roots.
 * Specs come from defaultSpecForSymbol / FUTURES_ROOT_SPECS (tick, pip, multiplier).
 */
import { FUTURES_ROOT_SPECS } from '@/orders/futuresSpec';
import {
  defaultSpecForSymbol,
  instrumentSymbolKey,
  type InstrumentSpec,
} from '@/orders/instrumentSpec';
import { pipValueAccount } from '@/orders/pnl';

function fxDisplay(symbol: string): string {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('/')) return raw;
  const key = instrumentSymbolKey(raw);
  if (key.length === 6) return `${key.slice(0, 3)}/${key.slice(3)}`;
  return key;
}

function cryptoDisplay(symbol: string): string {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('/')) return raw;
  const key = instrumentSymbolKey(raw);
  for (const quote of ['USDT', 'USD', 'EUR'] as const) {
    if (key.endsWith(quote) && key.length > quote.length) {
      return `${key.slice(0, -quote.length)}/${quote}`;
    }
  }
  return key;
}

const FX_TICKERS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'USD/CHF',
  'AUD/USD',
  'USD/CAD',
  'NZD/USD',
  'EUR/JPY',
  'GBP/JPY',
  'AUD/JPY',
  'CAD/JPY',
  'CHF/JPY',
  'NZD/JPY',
  'EUR/GBP',
  'EUR/AUD',
  'EUR/CAD',
  'EUR/CHF',
  'EUR/NZD',
  'GBP/AUD',
  'GBP/CAD',
  'GBP/CHF',
  'GBP/NZD',
  'AUD/CAD',
  'AUD/CHF',
  'AUD/NZD',
  'CAD/CHF',
  'NZD/CAD',
  'NZD/CHF',
  'USD/SGD',
  'USD/HKD',
  'USD/MXN',
  'USD/ZAR',
  'USD/TRY',
  'USD/NOK',
  'USD/SEK',
  'USD/DKK',
  'USD/PLN',
  'EUR/NOK',
  'EUR/SEK',
  'EUR/TRY',
  'EUR/PLN',
  'XAU/USD',
  'XAG/USD',
] as const;

const CRYPTO_TICKERS = [
  'BTC/USD',
  'ETH/USD',
  'SOL/USD',
  'XRP/USD',
  'BNB/USD',
  'ADA/USD',
  'DOGE/USD',
  'LTC/USD',
  'AVAX/USD',
  'LINK/USD',
  'DOT/USD',
  'UNI/USD',
] as const;

export type CatalogGroup = 'Forex' | 'Futures' | 'Crypto';
export type TickerMarketTab = 'favorites' | 'fx' | 'futures' | 'crypto' | 'all';

export interface CatalogTicker {
  id: string;
  display: string;
  group: CatalogGroup;
  spec: InstrumentSpec;
}

function tickerFromSymbol(symbol: string, group: CatalogGroup): CatalogTicker {
  const spec = defaultSpecForSymbol(symbol);
  return {
    id: instrumentSymbolKey(symbol),
    display:
      group === 'Futures' ? spec.symbol : group === 'Crypto' ? cryptoDisplay(symbol) : fxDisplay(symbol),
    group,
    spec,
  };
}

export const LOGBOOK_TICKERS: readonly CatalogTicker[] = [
  ...FX_TICKERS.map((s) => tickerFromSymbol(s, 'Forex')),
  ...FUTURES_ROOT_SPECS.map((row) => tickerFromSymbol(row.root, 'Futures')),
  ...CRYPTO_TICKERS.map((s) => tickerFromSymbol(s, 'Crypto')),
];

const BY_ID = new Map(LOGBOOK_TICKERS.map((t) => [t.id, t]));

export function findTicker(symbol: string): CatalogTicker | null {
  if (!symbol.trim()) return null;
  const key = instrumentSymbolKey(symbol);
  const hit = BY_ID.get(key);
  if (hit) return hit;
  const spec = defaultSpecForSymbol(symbol);
  const group: CatalogGroup = spec.assetClass === 'futures' ? 'Futures' : 'Forex';
  return {
    id: spec.symbol,
    display:
      group === 'Futures' ? spec.symbol : group === 'Crypto' ? cryptoDisplay(symbol) : fxDisplay(symbol),
    group,
    spec,
  };
}

export function specForSymbol(symbol: string): InstrumentSpec {
  return findTicker(symbol)?.spec ?? defaultSpecForSymbol(symbol);
}

export function filterTickers(query: string): CatalogTicker[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return [...LOGBOOK_TICKERS];
  return LOGBOOK_TICKERS.filter((t) => {
    const id = t.id.toLowerCase();
    const display = t.display.toLowerCase().replace(/\s+/g, '');
    return id.includes(q) || display.includes(q);
  });
}

export function splitFavoriteTickers(
  list: readonly CatalogTicker[],
  favIds: readonly string[],
): { favorites: CatalogTicker[]; rest: CatalogTicker[] } {
  const seen = new Set<string>();
  const favorites: CatalogTicker[] = [];
  for (const raw of favIds) {
    const id = instrumentSymbolKey(raw);
    if (seen.has(id)) continue;
    const hit = list.find((t) => t.id === id);
    if (!hit) continue;
    seen.add(id);
    favorites.push(hit);
  }
  const rest = list.filter((t) => !seen.has(t.id));
  return { favorites, rest };
}

export function tickersForTab(
  query: string,
  tab: TickerMarketTab,
  favIds: readonly string[],
): CatalogTicker[] {
  const filtered = filterTickers(query);
  if (tab === 'favorites') return splitFavoriteTickers(filtered, favIds).favorites;
  if (tab === 'fx') return filtered.filter((t) => t.group === 'Forex');
  if (tab === 'futures') return filtered.filter((t) => t.group === 'Futures');
  if (tab === 'crypto') return filtered.filter((t) => t.group === 'Crypto');
  const { favorites, rest } = splitFavoriteTickers(filtered, favIds);
  return [...favorites, ...rest];
}

export function groupedTickers(list: readonly CatalogTicker[]): {
  group: CatalogGroup;
  items: CatalogTicker[];
}[] {
  const fx = list.filter((t) => t.group === 'Forex');
  const fut = list.filter((t) => t.group === 'Futures');
  const crypto = list.filter((t) => t.group === 'Crypto');
  const out: { group: CatalogGroup; items: CatalogTicker[] }[] = [];
  if (fx.length) out.push({ group: 'Forex', items: fx });
  if (fut.length) out.push({ group: 'Futures', items: fut });
  if (crypto.length) out.push({ group: 'Crypto', items: crypto });
  return out;
}

export function formatTick(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1) return String(n);
  return n
    .toFixed(8)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

/** One-line contract facts for the selected ticker. */
export function specSummary(
  spec: InstrumentSpec,
  entryPrice?: number | null,
): string {
  const pipVal = pipValueAccount(1, spec, {
    accountCurrency: 'USD',
    instrumentPrice: entryPrice && entryPrice > 0 ? entryPrice : 1,
  });
  if (spec.assetClass === 'futures') {
    const tickVal = spec.tickSize * spec.contractSize;
    return `Futures · pt ${formatTick(spec.pipSize)} · tick ${formatTick(spec.tickSize)} · $${tickVal.toFixed(2)}/tick per contract`;
  }
  return `FX · pip ${formatTick(spec.pipSize)} · tick ${formatTick(spec.tickSize)} · $${pipVal.amount.toFixed(2)}/pip per lot`;
}
