export type OrderSide = 'buy' | 'sell';

/** Read-only mock order for chart overlay (no broker). */
export interface ChartOrder {
  id: string;
  sessionId: string;
  pair: string;
  side: OrderSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  createdAt: number;
}

export type OrderLineKind = 'entry' | 'sl' | 'tp';
