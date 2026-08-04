export type OrderSide = 'buy' | 'sell';

/** Chart overlay projection of an engine position, working order, or draft ticket. */
export interface ChartOrder {
  id: string;
  sessionId: string;
  pair: string;
  side: OrderSide;
  /** null = do not draw entry (e.g. pending market waiting next bar) */
  entry: number | null;
  /** null = do not draw this level */
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: number;
  enginePositionId?: string;
  engineOrderId?: string;
  working?: boolean;
  /** Preview from open order ticket (not yet submitted). */
  draft?: boolean;
  ambiguousFill?: boolean;
  /** Open position size (lots) — used for chart P&L label. */
  size?: number;
  /** Unrealized P&L in account currency; null/undefined = pending/draft (no P&L). */
  unrealizedPnL?: number | null;
  /**
   * When true, entry line is display-only (e.g. pending market expected fill).
   * SL/TP remain draggable.
   */
  entryLocked?: boolean;
}

export type OrderLineKind = 'entry' | 'sl' | 'tp';

export interface OrderLevelHit {
  orderId: string;
  kind: OrderLineKind;
  price: number;
}
