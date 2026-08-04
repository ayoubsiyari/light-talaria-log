/**
 * Order / position types and state-machine statuses for the replay engine.
 * Plain serializable shapes only — must survive structuredClone / JSON.
 */

export type OrderId = string;
export type PositionId = string;

export type OrderSide = 'BUY' | 'SELL';

export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP'
  | 'STOP_LIMIT'
  | 'TRAILING_STOP';

export type OrderStatus =
  | 'PENDING_NEW'
  | 'WORKING'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'PARTIALLY_FILLED';

export type TimeInForce = 'GTC' | 'DAY' | 'GTD' | 'IOC' | 'FOK';

export type PositionMode = 'netting' | 'hedging';

export type RejectReason =
  | 'LIMIT_WRONG_SIDE'
  | 'STOP_WRONG_SIDE'
  | 'PROTECTIVE_WRONG_SIDE'
  | 'TOO_CLOSE_TO_MARKET'
  | 'SIZE_OUT_OF_RANGE'
  | 'SIZE_STEP'
  | 'INSUFFICIENT_MARGIN'
  | 'VALIDATION'
  | 'STOP_OUT';

export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'FILLED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
]);

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface Order {
  id: OrderId;
  parentId?: OrderId;
  ocoGroupId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  /** Lots, always positive. */
  size: number;
  price?: number;
  stopPrice?: number;
  trailDistance?: number;
  trailHighWater?: number;
  trailLowWater?: number;
  tif: TimeInForce;
  expiresAt?: number;
  status: OrderStatus;
  revision: number;
  /** cursorTime — never wall clock. */
  createdAt: number;
  updatedAt: number;
  filledAt?: number;
  fillPrice?: number;
  rejectReason?: RejectReason | string;
  ambiguousFill?: boolean;
  /** Protective linked levels (bracket children may also be separate orders). */
  stopLoss?: number;
  takeProfit?: number;
  /** Position this working order protects / reduces. */
  positionId?: PositionId;
  /** True for protective SL/TP attached to a position. */
  role?: 'entry' | 'stopLoss' | 'takeProfit' | 'stop';
  /** Optional setup labels — schema only until ticket UI ships. */
  tags?: string[];
}

/** Why a position fully closed — persisted on POSITION_CLOSED for analytics. */
export type TradeExitReason = 'TP' | 'SL' | 'MANUAL' | 'STOP_OUT' | 'TRAILING';

export interface Position {
  id: PositionId;
  symbol: string;
  side: OrderSide;
  size: number;
  entryPrice: number;
  /** Frozen at first entry for R-multiples (§5.5). */
  initialStopPrice: number | null;
  /** Frozen at first entry from takeProfit — never updated. */
  initialTargetPrice: number | null;
  openedAt: number;
  updatedAt: number;
  swapAccruedAccount: number;
  realizedPnLAccount: number;
  /** Commission already paid on remaining size (entry side). */
  entryCommissionAccount: number;
  ambiguousFill?: boolean;
  pnlApproximate?: boolean;
  /**
   * Max favorable / adverse excursion prices while open.
   * Init = entry; updated each bar in stepEngine.
   */
  mfePrice: number;
  maePrice: number;
  /** Risk as fraction of equity at open (null if no stop). */
  riskPct: number | null;
  /** Setup labels (may be empty). */
  tags: string[];
  /** Fill-bar extremes for entry-efficiency metric; null if unknown. */
  entryBarHigh: number | null;
  entryBarLow: number | null;
}

export interface AccountState {
  currency: string;
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
}

export interface OrderEngineState {
  orders: Record<OrderId, Order>;
  positions: Record<PositionId, Position>;
  /** Working-order id index for O(working) scans without full table walk growth. */
  workingIds: OrderId[];
  account: AccountState;
  seq: number;
  rngState: number;
  mode: PositionMode;
  /** Last bar time handed to stepEngine (for gap / monotonic asserts). */
  lastBarTime: number | null;
  /**
   * UTC day index (Math.floor(unixSec/86400)) of last swap accrual, or null.
   * Prevents double-accrual within the same session day.
   */
  lastSwapUtcDay: number | null;
  symbol: string;
}

export type EngineEventType =
  | 'ORDER_ACCEPTED'
  | 'ORDER_REJECTED'
  | 'ORDER_WORKING'
  | 'ORDER_FILLED'
  | 'ORDER_CANCELLED'
  | 'ORDER_EXPIRED'
  | 'ORDER_MODIFIED'
  | 'POSITION_OPENED'
  | 'POSITION_MODIFIED'
  | 'POSITION_CLOSED'
  | 'SWAP_ACCRUED'
  | 'MARGIN_CALL'
  | 'STOP_OUT'
  | 'AMBIGUOUS_FILL';

export interface EngineEvent {
  seq: number;
  cursorTime: number;
  type: EngineEventType;
  payload: Record<string, unknown>;
}

export interface MarketContext {
  spread: number;
  accountCurrency: string;
  /** Optional cross-conversion rate into account currency. */
  conversionRateToAccount?: number;
  /** ATR (price units) for slippage; 0 if unknown. */
  atr?: number;
  /** True when market is open for swap accrual (not weekend). */
  marketOpen?: boolean;
  volatilityFactor?: number;
}

/** User / system intents into the pure reducer. */
export type EngineCommand =
  | {
      type: 'SUBMIT';
      order: Omit<
        Order,
        'status' | 'revision' | 'updatedAt' | 'filledAt' | 'fillPrice' | 'rejectReason'
      >;
      cursorTime: number;
      bid: number;
      ask: number;
    }
  | {
      type: 'CANCEL';
      orderId: OrderId;
      cursorTime: number;
    }
  | {
      type: 'MODIFY';
      orderId: OrderId;
      cursorTime: number;
      price?: number;
      stopPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      size?: number;
      trailDistance?: number;
      bid: number;
      ask: number;
    };
