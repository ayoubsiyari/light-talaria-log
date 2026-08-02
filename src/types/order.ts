export type OrderSide = 'buy' | 'sell';

/** Chart overlay projection of an engine position or working order. */
export interface ChartOrder {
  id: string;
  sessionId: string;
  pair: string;
  side: OrderSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  createdAt: number;
  /** Engine position id when backed by a live position. */
  enginePositionId?: string;
  /** Engine order id when backed by a working entry order. */
  engineOrderId?: string;
  working?: boolean;
  ambiguousFill?: boolean;
}

export type OrderLineKind = 'entry' | 'sl' | 'tp';

export interface OrderLevelHit {
  orderId: string;
  kind: OrderLineKind;
  price: number;
}
