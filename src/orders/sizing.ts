/**
 * Risk-based position sizing — pure functions.
 */

import { clampLot, type InstrumentSpec } from './instrumentSpec';
import { quoteToAccountRate, type FxRateContext } from './pnl';

export interface RiskSizingInput {
  equity: number;
  riskPercent: number;
  entryPrice: number;
  stopPrice: number;
  spec: InstrumentSpec;
  ctx: FxRateContext;
}

export interface RiskSizingResult {
  lots: number;
  /** Risk that was requested: equity * riskPercent. */
  requestedRiskAccount: number;
  /** Actual risk after lot step/min/max clamp. */
  actualRiskAccount: number;
  /** True when clamp changed the effective risk. */
  clamped: boolean;
  /** Stop distance in price units. */
  stopDistance: number;
  approximate: boolean;
}

/**
 * lots = riskAccount / (stopDistance * valuePerPricePerLotAccount)
 * then clamp to lotStep / min / max.
 */
export function sizeFromRisk(input: RiskSizingInput): RiskSizingResult {
  const { equity, riskPercent, entryPrice, stopPrice, spec, ctx } = input;
  const requestedRiskAccount = Math.max(0, equity * riskPercent);
  const stopDistance = Math.abs(entryPrice - stopPrice);

  if (stopDistance < spec.tickSize * 0.5 || requestedRiskAccount <= 0) {
    return {
      lots: spec.minLot,
      requestedRiskAccount,
      actualRiskAccount: 0,
      clamped: true,
      stopDistance,
      approximate: false,
    };
  }

  const conv = quoteToAccountRate(spec, {
    ...ctx,
    instrumentPrice: ctx.instrumentPrice || entryPrice,
  });
  // Value of 1.0 price unit move per 1.0 lot, in account currency.
  const valuePerPricePerLotAccount = spec.contractSize * conv.rate;
  const rawLots = requestedRiskAccount / (stopDistance * valuePerPricePerLotAccount);
  const lots = clampLot(rawLots, spec);
  const actualRiskAccount = stopDistance * lots * valuePerPricePerLotAccount;
  const clamped = Math.abs(lots - rawLots) > spec.lotStep * 0.25
    || Math.abs(actualRiskAccount - requestedRiskAccount) > requestedRiskAccount * 0.01;

  return {
    lots,
    requestedRiskAccount,
    actualRiskAccount,
    clamped,
    stopDistance,
    approximate: conv.approximate,
  };
}

/** Distance in pips between two prices. */
export function distancePips(a: number, b: number, spec: InstrumentSpec): number {
  if (spec.pipSize <= 0) return 0;
  return Math.abs(a - b) / spec.pipSize;
}
