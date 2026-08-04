import type { DrawingPoint } from './drawingStore';
import { asNumber } from './toolSettings';

export interface PositionGeometry {
  entry: number;
  stop: number;
  target: number;
  risk: number;
  reward: number;
  riskReward: number;
  /** +1 long, -1 short (from geometry when type unknown). */
  side: 1 | -1;
}

export function positionGeometry(
  points: readonly DrawingPoint[],
  type: 'longPosition' | 'shortPosition',
): PositionGeometry | null {
  const entry = points[0]?.price;
  const stop = points[1]?.price;
  const target = points[2]?.price;
  if (entry == null || stop == null || target == null) return null;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const riskReward = risk > 1e-12 ? reward / risk : 0;
  const side: 1 | -1 = type === 'longPosition' ? 1 : -1;
  return { entry, stop, target, risk, reward, riskReward, side };
}

/** Suggested position size from account risk (1 unit = 1 price-point of P&L). */
export function positionQty(
  risk: number,
  meta: Record<string, unknown> | undefined,
): number {
  const lots = asNumber(meta?.lots, 0);
  if (lots > 0) return lots;
  const account = asNumber(meta?.accountSize, 10_000);
  const riskPct = asNumber(meta?.riskPercent, 1);
  if (risk <= 1e-12) return 0;
  const riskAmt = account * (riskPct / 100);
  return riskAmt / risk;
}

export function positionPnlAtTarget(
  geo: PositionGeometry,
  qty: number,
): number {
  // Winning move to target in account units (qty × price distance).
  return geo.reward * qty;
}

export function syncRiskRewardMeta(
  type: 'longPosition' | 'shortPosition',
  points: readonly DrawingPoint[],
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const geo = positionGeometry(points, type);
  if (!geo) return meta ?? {};
  return { ...(meta ?? {}), riskReward: Number(geo.riskReward.toFixed(2)) };
}
