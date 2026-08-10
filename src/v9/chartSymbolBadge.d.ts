import type { ReactNode } from 'react';

export declare const currencyCountry: Record<string, string>;

export declare function FlagSvg(props: {
  code: string;
  w?: number;
  h?: number;
}): ReactNode;

export declare function normalizeBadgeAsset(
  a: string | undefined | null,
): string | undefined;

export declare function inferChartAssetClass(ticker: string): string;

export declare function normalizeSymForBadge(symbol: string): string;

export declare function displayChartSessionSymbol(sym: string): string;

export declare function chartAssetFromSymbolObj(s: {
  badgeAsset?: string;
  assetClass?: string;
  asset_class?: string;
  type?: string;
  id?: string;
} | null): string;

export declare function resolveSessionChartSymbol(
  symbol: string,
  allSymbols: { id: string }[],
): {
  id: string;
  name: string;
  type: string;
  base?: string;
  quote?: string;
};

export declare function ChartSymbolBadge(props: {
  sym: string;
  asset?: string;
  w?: number;
  h?: number;
  fontFamily?: string;
}): ReactNode;
