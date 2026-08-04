/**
 * Module-scoped order-level drag — no React setState during the gesture (§8.2).
 * Commit happens once on pointerup via the provided callback.
 */

import { distancePips, sizeFromRisk } from './sizing';
import { roundToTick, type InstrumentSpec } from './instrumentSpec';
import {
  inferPendingType,
  type PendingOrderType,
} from './inferPendingType';
import type { OrderLineKind } from '@/types/order';

/** Minimal fields needed for snap / pip / risk readout during drag. */
export type DragSpec = Pick<
  InstrumentSpec,
  | 'tickSize'
  | 'digits'
  | 'pipSize'
  | 'contractSize'
  | 'lotStep'
  | 'minLot'
  | 'maxLot'
  | 'baseCurrency'
  | 'quoteCurrency'
>;

export interface LevelDragState {
  active: boolean;
  orderId: string;
  kind: OrderLineKind;
  originPrice: number;
  currentPrice: number;
  entryPrice: number;
  side: 'buy' | 'sell';
  invalidReason: string | null;
  /** Live LIMIT/STOP while dragging entry above/below market. */
  pendingType: PendingOrderType | null;
}

/** Mutable drag slot — intentionally not React state. */
export const levelDrag: LevelDragState = {
  active: false,
  orderId: '',
  kind: 'entry',
  originPrice: 0,
  currentPrice: 0,
  entryPrice: 0,
  side: 'buy',
  invalidReason: null,
  pendingType: null,
};

let readoutEl: HTMLElement | null = null;

export function ensureDragReadout(parent: HTMLElement): HTMLElement {
  if (readoutEl && readoutEl.isConnected) return readoutEl;
  const el = document.createElement('div');
  el.id = 'order-level-drag-readout';
  el.setAttribute(
    'class',
    'pointer-events-none absolute z-40 rounded px-2 py-1 text-[11px] font-mono bg-surface/95 border border-border text-foreground shadow-sm',
  );
  el.style.display = 'none';
  parent.appendChild(el);
  readoutEl = el;
  return el;
}

export function beginLevelDrag(input: {
  orderId: string;
  kind: OrderLineKind;
  price: number;
  entryPrice: number;
  side: 'buy' | 'sell';
  bid?: number;
  ask?: number;
}): void {
  levelDrag.active = true;
  levelDrag.orderId = input.orderId;
  levelDrag.kind = input.kind;
  levelDrag.originPrice = input.price;
  levelDrag.currentPrice = input.price;
  levelDrag.entryPrice = input.entryPrice;
  levelDrag.side = input.side;
  levelDrag.invalidReason = null;
  levelDrag.pendingType =
    input.kind === 'entry' &&
    input.bid != null &&
    input.ask != null &&
    input.bid > 0
      ? inferPendingType(input.side, input.price, input.bid, input.ask)
      : null;
}

export function moveLevelDrag(
  price: number,
  spec: DragSpec,
  opts: {
    equity: number;
    riskPercent: number;
    riskLocked: boolean;
    clientX: number;
    clientY: number;
    parent: HTMLElement;
    bid?: number;
    ask?: number;
  },
): void {
  if (!levelDrag.active) return;
  const asSpec = spec as InstrumentSpec;
  const snapped = roundToTick(price, asSpec);
  levelDrag.currentPrice = snapped;
  // When dragging entry, keep protective validation relative to the new entry.
  if (levelDrag.kind === 'entry') levelDrag.entryPrice = snapped;
  levelDrag.invalidReason = validateDrag(levelDrag, snapped);

  if (
    levelDrag.kind === 'entry' &&
    opts.bid != null &&
    opts.ask != null &&
    opts.bid > 0
  ) {
    levelDrag.pendingType = inferPendingType(
      levelDrag.side,
      snapped,
      opts.bid,
      opts.ask,
    );
  } else if (levelDrag.kind !== 'entry') {
    levelDrag.pendingType = null;
  }

  const el = ensureDragReadout(opts.parent);
  const pips =
    levelDrag.kind === 'entry'
      ? distancePips(
          levelDrag.side === 'buy' ? (opts.ask ?? snapped) : (opts.bid ?? snapped),
          snapped,
          asSpec,
        )
      : distancePips(levelDrag.entryPrice, snapped, asSpec);
  let riskTxt = '';
  let lotsTxt = '';
  if (levelDrag.kind === 'sl' && opts.riskLocked) {
    const sized = sizeFromRisk({
      equity: opts.equity,
      riskPercent: opts.riskPercent,
      entryPrice: levelDrag.entryPrice,
      stopPrice: snapped,
      spec: asSpec,
      ctx: { accountCurrency: 'USD', instrumentPrice: levelDrag.entryPrice },
    });
    riskTxt = ` risk ${sized.actualRiskAccount.toFixed(2)}`;
    lotsTxt = ` lots ${sized.lots.toFixed(2)}`;
  }
  const rr =
    levelDrag.kind === 'tp' || levelDrag.kind === 'sl'
      ? computeRR(levelDrag, snapped)
      : null;

  // Direct DOM only — never React setState (§8.3)
  const typeBadge = levelDrag.pendingType;
  el.textContent = [
    typeBadge ? typeBadge : null,
    `${snapped.toFixed(spec.digits)}`,
    `${pips.toFixed(1)} pips`,
    rr != null ? `R:R ${rr}` : '',
    riskTxt,
    lotsTxt,
    levelDrag.invalidReason ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
  el.style.display = 'block';
  // LIMIT = accent-ish border; STOP = warmer — CSS tokens via inline where needed
  if (typeBadge === 'STOP') {
    el.style.borderColor = 'var(--danger)';
    el.style.color = 'var(--danger)';
  } else if (typeBadge === 'LIMIT') {
    el.style.borderColor = 'var(--accent)';
    el.style.color = 'var(--accent)';
  } else {
    el.style.borderColor = '';
    el.style.color = '';
  }
  const rect = opts.parent.getBoundingClientRect();
  el.style.left = `${Math.min(rect.width - 180, Math.max(8, opts.clientX - rect.left + 12))}px`;
  el.style.top = `${Math.min(rect.height - 40, Math.max(8, opts.clientY - rect.top - 28))}px`;
}

export function endLevelDrag(): {
  orderId: string;
  kind: OrderLineKind;
  price: number;
  originPrice: number;
  invalidReason: string | null;
} | null {
  if (!levelDrag.active) return null;
  const result = {
    orderId: levelDrag.orderId,
    kind: levelDrag.kind,
    price: levelDrag.currentPrice,
    originPrice: levelDrag.originPrice,
    invalidReason: levelDrag.invalidReason,
  };
  levelDrag.active = false;
  levelDrag.pendingType = null;
  if (readoutEl) {
    readoutEl.style.display = 'none';
    readoutEl.style.borderColor = '';
    readoutEl.style.color = '';
  }
  return result;
}

export function cancelLevelDrag(): void {
  levelDrag.active = false;
  levelDrag.currentPrice = levelDrag.originPrice;
  levelDrag.invalidReason = null;
  levelDrag.pendingType = null;
  if (readoutEl) {
    readoutEl.style.display = 'none';
    readoutEl.style.borderColor = '';
    readoutEl.style.color = '';
  }
}

function validateDrag(d: LevelDragState, price: number): string | null {
  if (d.kind === 'sl') {
    if (d.side === 'buy' && price >= d.entryPrice) return 'stop must be below entry';
    if (d.side === 'sell' && price <= d.entryPrice) return 'stop must be above entry';
  }
  if (d.kind === 'tp') {
    if (d.side === 'buy' && price <= d.entryPrice) return 'TP must be above entry';
    if (d.side === 'sell' && price >= d.entryPrice) return 'TP must be below entry';
  }
  return null;
}

function computeRR(d: LevelDragState, price: number): string {
  const risk =
    d.kind === 'sl'
      ? Math.abs(d.entryPrice - price)
      : Math.abs(d.entryPrice - d.originPrice);
  const reward =
    d.kind === 'tp'
      ? Math.abs(price - d.entryPrice)
      : Math.abs(d.entryPrice - d.originPrice);
  if (risk < 1e-12) return '—';
  return (reward / risk).toFixed(2);
}
