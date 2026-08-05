export type OrderSide = 'buy' | 'sell';

/** Normalize `USD/JPY` / `USDJPY` / `usdjpy` for comparisons. */
export function chartPairKey(pair: string): string {
  return pair.replace(/\//g, '').toUpperCase();
}

/** Orders that belong on a pane for the given chart pair. */
export function ordersForPair(
  orders: readonly ChartOrder[],
  pair: string,
): ChartOrder[] {
  const key = chartPairKey(pair);
  return orders.filter((o) => chartPairKey(o.pair) === key);
}

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
  /** Projected account P&L if SL / TP is hit (open positions). */
  stopLossPnL?: number | null;
  takeProfitPnL?: number | null;
  /** Short ordinal for TV-style labels (`1.`, `2.`…). */
  seqLabel?: number;
  /**
   * When true, entry line is display-only (e.g. pending market expected fill).
   * SL/TP remain draggable.
   */
  entryLocked?: boolean;
  /**
   * Closed trade from the order journal — draw entry/exit marks only
   * (no live SL/TP lines). Set when TP/SL/manual close fills.
   */
  closed?: boolean;
  /** Exit fill price (closed trades). */
  exit?: number | null;
  /** Exit bar time (unix sec). */
  exitAt?: number;
  /** TP | SL | MANUAL | STOP_OUT | TRAILING */
  exitReason?: string;
  /** Realized net P&L in account currency. */
  realizedPnL?: number | null;
}

export type OrderLineKind = 'entry' | 'sl' | 'tp';

export interface OrderLevelHit {
  orderId: string;
  kind: OrderLineKind;
  price: number;
}
