import { Button } from '@heroui/react';
import { useState } from 'react';
import type { OrderSide, OrderType, TimeInForce } from '@/orders/orderTypes';

const REJECT_MESSAGES: Record<string, string> = {
  LIMIT_WRONG_SIDE: 'Limit is on the wrong side of the market (would fill instantly).',
  STOP_WRONG_SIDE: 'Stop is on the wrong side of the market.',
  PROTECTIVE_WRONG_SIDE: 'Stop/TP is on the wrong side of entry.',
  TOO_CLOSE_TO_MARKET: 'Level is too close to the market (stop level).',
  SIZE_OUT_OF_RANGE: 'Size is outside the allowed lot range.',
  SIZE_STEP: 'Size must be a multiple of the lot step.',
  INSUFFICIENT_MARGIN: 'Not enough free margin for this order.',
  VALIDATION: 'Order failed validation.',
};

export function rejectMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REJECT_MESSAGES[reason] ?? reason;
}

export interface OrderTicketSubmit {
  side: OrderSide;
  type: OrderType;
  size: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  tif: TimeInForce;
}

interface OrderTicketProps {
  bid: number;
  ask: number;
  digits: number;
  lastReject?: string | null;
  disabled?: boolean;
  onSubmit: (order: OrderTicketSubmit) => void;
}

/** Compact order ticket — mobile-friendly (≥44px controls). */
export function OrderTicket({
  bid,
  ask,
  digits,
  lastReject,
  disabled,
  onSubmit,
}: OrderTicketProps) {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('MARKET');
  const [size, setSize] = useState('0.10');
  const [price, setPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');

  const mid = (bid + ask) / 2;
  const msg = rejectMessage(lastReject);

  return (
    <div className="flex flex-col gap-2 p-2 border-t border-border bg-surface/80">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted font-mono">
        <span>
          Bid {bid.toFixed(digits)} · Ask {ask.toFixed(digits)}
        </span>
        <span className="text-foreground/70">fills at next bar</span>
      </div>

      <div className="flex gap-1">
        <Button
          size="sm"
          className="min-h-11 flex-1"
          variant={side === 'BUY' ? 'primary' : 'secondary'}
          onPress={() => setSide('BUY')}
        >
          Buy
        </Button>
        <Button
          size="sm"
          className="min-h-11 flex-1"
          variant={side === 'SELL' ? 'primary' : 'secondary'}
          onPress={() => setSide('SELL')}
        >
          Sell
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(['MARKET', 'LIMIT', 'STOP'] as OrderType[]).map((t) => (
          <Button
            key={t}
            size="sm"
            className="min-h-11"
            variant={type === t ? 'primary' : 'ghost'}
            onPress={() => {
              setType(t);
              if (t !== 'MARKET' && !price) setPrice(mid.toFixed(digits));
            }}
          >
            {t}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Lots
          <input
            className="min-h-11 rounded border border-border bg-background px-2 text-sm text-foreground"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            inputMode="decimal"
          />
        </label>
        {type !== 'MARKET' && (
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Price
            <input
              className="min-h-11 rounded border border-border bg-background px-2 text-sm text-foreground"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          SL
          <input
            className="min-h-11 rounded border border-border bg-background px-2 text-sm text-foreground"
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            inputMode="decimal"
            placeholder="optional"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          TP
          <input
            className="min-h-11 rounded border border-border bg-background px-2 text-sm text-foreground"
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            inputMode="decimal"
            placeholder="optional"
          />
        </label>
      </div>

      {msg && (
        <p className="text-[12px] text-danger" role="alert">
          {msg}
        </p>
      )}

      <Button
        className="min-h-11 w-full"
        variant="primary"
        isDisabled={disabled}
        onPress={() => {
          const lots = Number(size);
          if (!Number.isFinite(lots) || lots <= 0) return;
          onSubmit({
            side,
            type,
            size: lots,
            price: type === 'MARKET' ? undefined : Number(price),
            stopLoss: sl ? Number(sl) : undefined,
            takeProfit: tp ? Number(tp) : undefined,
            tif: 'GTC',
          });
        }}
      >
        Place {side} {type}
      </Button>
    </div>
  );
}
