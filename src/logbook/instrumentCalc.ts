import type { InstrumentSpec } from '@/orders/instrumentSpec';
import { distanceUnitLabel, quantityUnitLabel } from '@/orders/instrumentSpec';
import { grossPnL, pipValueAccount, quoteToAccountRate } from '@/orders/pnl';
import { distancePips } from '@/orders/sizing';
import type { LogbookSide } from './types';
import { specForSymbol } from './catalog';

const ACCOUNT = 'USD';

function fxCtx(price: number) {
  return { accountCurrency: ACCOUNT, instrumentPrice: price };
}

export function logbookGrossPnl(
  symbol: string,
  side: LogbookSide,
  entry: number,
  exit: number,
  size: number,
  commission: number,
): number | null {
  if (!(entry > 0) || !(exit > 0) || !(size > 0)) return null;
  const spec = specForSymbol(symbol);
  const g = grossPnL(
    side === 'long' ? 'BUY' : 'SELL',
    entry,
    exit,
    size,
    spec,
    fxCtx(exit),
  );
  return g.grossAccount.amount - commission;
}

export function logbookRiskAccount(
  symbol: string,
  entry: number,
  stop: number | null,
  size: number,
): number | null {
  if (stop == null || !(entry > 0) || !(size > 0)) return null;
  const spec = specForSymbol(symbol);
  const dist = Math.abs(entry - stop);
  if (dist < spec.tickSize * 0.5) return null;
  const conv = quoteToAccountRate(spec, fxCtx(entry));
  return dist * size * spec.contractSize * conv.rate;
}

export function logbookDistance(
  symbol: string,
  a: number | null,
  b: number | null,
): { pips: number; unit: string } | null {
  if (a == null || b == null) return null;
  const spec = specForSymbol(symbol);
  return {
    pips: distancePips(a, b, spec),
    unit: distanceUnitLabel(spec),
  };
}

export function sizeUnit(symbol: string): string {
  if (!symbol.trim()) return 'Size';
  return quantityUnitLabel(specForSymbol(symbol));
}

export function pipValueUsd(symbol: string, size: number, price: number): number | null {
  if (!(size > 0)) return null;
  const spec = specForSymbol(symbol);
  return pipValueAccount(size, spec, fxCtx(price > 0 ? price : 1)).amount;
}

export function specMeta(symbol: string): InstrumentSpec | null {
  if (!symbol.trim()) return null;
  return specForSymbol(symbol);
}
