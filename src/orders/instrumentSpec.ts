/**
 * Instrument contract specs for the replay order engine.
 * Pure data + helpers — no React, no IDB, no wall clock.
 */

import { matchFuturesRoot } from './futuresSpec';

export type CommissionMode = 'perLot' | 'percent';
/** Market family — drives size unit (lots vs contracts) and defaults. */
export type InstrumentAssetClass = 'forex' | 'futures';
/** Order size unit shown in the ticket / dock. */
export type QuantityUnit = 'lot' | 'contract';

/**
 * Temporary gate: keep spread / commission / slippage code paths, but force
 * them to zero in the live engine until Place Order UX is validated.
 * Unit tests that set explicit spreads on SPEC_* fixtures are unaffected.
 * Flip to `true` later to restore broker-like costs.
 */
export const ORDER_COSTS_ENABLED = false;

/** Zero cost fields when {@link ORDER_COSTS_ENABLED} is false. */
export function applyCostPolicy(spec: InstrumentSpec): InstrumentSpec {
  if (ORDER_COSTS_ENABLED) return spec;
  return {
    ...spec,
    typicalSpread: 0,
    baseSlippage: 0,
    slippagePerAtr: 0,
    commissionPerLot: 0,
    commissionPercent: 0,
  };
}

export interface InstrumentSpec {
  symbol: string;
  assetClass: InstrumentAssetClass;
  /** `lot` for FX/metals spot; `contract` for futures. */
  quantityUnit: QuantityUnit;
  /** ISO currency of the pair base (e.g. EUR in EURUSD). */
  baseCurrency: string;
  /** ISO currency of the pair quote (e.g. USD in EURUSD). */
  quoteCurrency: string;
  /**
   * FX: units per 1.0 lot (typically 100_000).
   * Futures: $ (quote) per 1.0 price point × 1 contract (CME multiplier).
   */
  contractSize: number;
  /** Minimum price increment. */
  tickSize: number;
  /** Display / stored price decimal places. */
  digits: number;
  /** FX pip / futures point size (UI distance + pip-value helpers). */
  pipSize: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  /** Minimum distance from market for stops/limits (price units). */
  stopLevel: number;
  /** Fallback spread in price units when bars have no spread column. */
  typicalSpread: number;
  /** Fixed slip component (price units) on market/stop fills. */
  baseSlippage: number;
  /** Extra slip per ATR unit (price units). */
  slippagePerAtr: number;
  leverage: number;
  marginCallLevel: number;
  stopOutLevel: number;
  commissionMode: CommissionMode;
  /** Charged per lot per side when mode is perLot. */
  commissionPerLot: number;
  /** Fraction of notional when mode is percent (e.g. 0.0002 = 0.02%). */
  commissionPercent: number;
  /** Swap points per lot per night (often negative both sides). */
  swapLong: number;
  swapShort: number;
  /**
   * Seconds past midnight UTC when daily rollover accrues.
   * TODO: share session-close helper with pipeline once it exists
   * (DATA_PIPELINE_REPORT deferred anchoring finding).
   */
  swapTimeUtc: number;
  /** 0=Sun … 6=Sat; triple swap typically Wednesday (3). */
  tripleSwapWeekday: number;
  /**
   * Seconds past midnight UTC for DAY TIF expiry.
   * TODO: same session-close helper as swapTimeUtc.
   */
  sessionCloseUtc: number;
}

export interface InstrumentDefaults {
  accountCurrency: string;
  initialBalance: number;
}

/** Round a price to instrument tick/digits. Never reject for tick — round. */
export function roundToTick(price: number, spec: InstrumentSpec): number {
  if (!Number.isFinite(price) || spec.tickSize <= 0) return price;
  const ticks = Math.round(price / spec.tickSize);
  const rounded = ticks * spec.tickSize;
  const f = 10 ** spec.digits;
  return Math.round(rounded * f) / f;
}

/** Prices equal within half a tick. Never use === for price compares. */
export function pricesEqual(a: number, b: number, spec: InstrumentSpec): boolean {
  const eps = spec.tickSize * 0.5;
  return Math.abs(a - b) <= eps;
}

export function clampLot(lots: number, spec: InstrumentSpec): number {
  if (!Number.isFinite(lots)) return spec.minLot;
  const stepped = Math.round(lots / spec.lotStep) * spec.lotStep;
  const f = Math.round(1 / spec.lotStep);
  const clean = Math.round(stepped * f) / f;
  return Math.min(spec.maxLot, Math.max(spec.minLot, clean));
}

export function isValidLot(lots: number, spec: InstrumentSpec): boolean {
  if (!Number.isFinite(lots)) return false;
  if (lots < spec.minLot - 1e-12 || lots > spec.maxLot + 1e-12) return false;
  const steps = lots / spec.lotStep;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** Parse "EUR/USD" or "EURUSD" into base/quote. */
export function parseSymbolCurrencies(symbol: string): {
  baseCurrency: string;
  quoteCurrency: string;
} {
  const cleaned = symbol.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleaned.length >= 6) {
    return { baseCurrency: cleaned.slice(0, 3), quoteCurrency: cleaned.slice(3, 6) };
  }
  const parts = symbol.split(/[/\-_]/);
  if (parts.length >= 2) {
    return {
      baseCurrency: parts[0]!.toUpperCase(),
      quoteCurrency: parts[1]!.toUpperCase(),
    };
  }
  return { baseCurrency: 'XXX', quoteCurrency: 'XXX' };
}

/** Normalize `USD/JPY` / `USDJPY` / `usdjpy` for engine maps. */
export function instrumentSymbolKey(symbol: string): string {
  return symbol.replace(/\//g, '').toUpperCase();
}

/** Singular/plural size label for ticket + dock. */
export function quantityUnitLabel(
  spec: Pick<InstrumentSpec, 'quantityUnit'>,
  count?: number,
): string {
  if (spec.quantityUnit === 'contract') {
    if (count == null) return 'Contracts';
    return Math.abs(count) === 1 ? 'Contract' : 'Contracts';
  }
  if (count == null) return 'Lots';
  return Math.abs(count) === 1 ? 'Lot' : 'Lots';
}

/** Short distance unit: pips (FX) vs pts (futures). */
export function distanceUnitLabel(
  spec: Pick<InstrumentSpec, 'assetClass'>,
): string {
  return spec.assetClass === 'futures' ? 'pts' : 'pips';
}

export function defaultSpecForSymbol(symbol: string): InstrumentSpec {
  const key = instrumentSymbolKey(symbol);
  const fut = matchFuturesRoot(symbol);
  if (fut) {
    return applyCostPolicy({
      symbol: key,
      assetClass: 'futures',
      quantityUnit: 'contract',
      baseCurrency: fut.root,
      quoteCurrency: fut.quoteCurrency,
      contractSize: fut.contractSize,
      tickSize: fut.tickSize,
      digits: fut.digits,
      pipSize: fut.pointSize,
      minLot: 1,
      maxLot: 500,
      lotStep: 1,
      stopLevel: fut.tickSize,
      typicalSpread: fut.tickSize,
      baseSlippage: 0,
      slippagePerAtr: 0,
      // Approx until SPAN/initial-margin table — keeps 1 contract placeable on $10k.
      leverage: 40,
      marginCallLevel: 100,
      stopOutLevel: 50,
      commissionMode: 'perLot',
      commissionPerLot: 0,
      commissionPercent: 0,
      swapLong: 0,
      swapShort: 0,
      swapTimeUtc: 21 * 3600,
      tripleSwapWeekday: 3,
      sessionCloseUtc: 21 * 3600,
    });
  }

  const { baseCurrency, quoteCurrency } = parseSymbolCurrencies(symbol);
  const jpy = quoteCurrency === 'JPY' || baseCurrency === 'JPY';
  const xau = baseCurrency === 'XAU' || symbol.toUpperCase().includes('XAU');
  const tickSize = xau ? 0.01 : jpy ? 0.001 : 0.00001;
  const pipSize = xau ? 0.1 : jpy ? 0.01 : 0.0001;
  const digits = xau ? 2 : jpy ? 3 : 5;
  return applyCostPolicy({
    symbol: key.slice(0, 6) || key,
    assetClass: 'forex',
    quantityUnit: 'lot',
    baseCurrency,
    quoteCurrency,
    contractSize: xau ? 100 : 100_000,
    tickSize,
    digits,
    pipSize,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
    /** Min distance from bid/ask for pending limits/stops (1 pip — TV-like, placeable on last price). */
    stopLevel: pipSize,
    // Nominal broker-like values — zeroed by applyCostPolicy while costs are off.
    typicalSpread: jpy ? 0.02 : xau ? 0.3 : 0.00015,
    baseSlippage: 0,
    slippagePerAtr: 0,
    leverage: 100,
    marginCallLevel: 100,
    stopOutLevel: 50,
    commissionMode: 'perLot',
    commissionPerLot: 0,
    commissionPercent: 0,
    swapLong: -0.5,
    swapShort: -0.3,
    swapTimeUtc: 21 * 3600,
    tripleSwapWeekday: 3,
    sessionCloseUtc: 21 * 3600,
  });
}

/** Well-known fixtures used by unit tests (hand-tuned, not live broker). */
export const SPEC_EURUSD: InstrumentSpec = {
  ...defaultSpecForSymbol('EURUSD'),
  symbol: 'EURUSD',
  assetClass: 'forex',
  quantityUnit: 'lot',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  contractSize: 100_000,
  tickSize: 0.00001,
  digits: 5,
  pipSize: 0.0001,
  typicalSpread: 0.00015,
};

export const SPEC_USDJPY: InstrumentSpec = {
  ...defaultSpecForSymbol('USDJPY'),
  symbol: 'USDJPY',
  assetClass: 'forex',
  quantityUnit: 'lot',
  baseCurrency: 'USD',
  quoteCurrency: 'JPY',
  contractSize: 100_000,
  tickSize: 0.001,
  digits: 3,
  pipSize: 0.01,
  typicalSpread: 0.02,
};

export const SPEC_EURGBP: InstrumentSpec = {
  ...defaultSpecForSymbol('EURGBP'),
  symbol: 'EURGBP',
  assetClass: 'forex',
  quantityUnit: 'lot',
  baseCurrency: 'EUR',
  quoteCurrency: 'GBP',
  contractSize: 100_000,
  tickSize: 0.00001,
  digits: 5,
  pipSize: 0.0001,
  typicalSpread: 0.0002,
};

export const SPEC_ES: InstrumentSpec = {
  ...defaultSpecForSymbol('ES'),
  symbol: 'ES',
  assetClass: 'futures',
  quantityUnit: 'contract',
};
