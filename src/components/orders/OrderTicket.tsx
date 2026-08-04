import { useEffect, useState, type ReactNode } from 'react';
import { inferPendingType } from '@/orders/inferPendingType';
import type { OrderSide, OrderType, TimeInForce } from '@/orders/orderTypes';

const REJECT_MESSAGES: Record<string, string> = {
  LIMIT_WRONG_SIDE: 'Limit is on the wrong side of the market.',
  STOP_WRONG_SIDE: 'Stop is on the wrong side of the market.',
  PROTECTIVE_WRONG_SIDE: 'Stop/TP is on the wrong side of entry.',
  TOO_CLOSE_TO_MARKET:
    'Too close to market — move the entry further from the bid/ask (broker freeze / stop level).',
  SIZE_OUT_OF_RANGE: 'Size is outside the allowed lot range.',
  SIZE_STEP: 'Size must be a multiple of the lot step.',
  INSUFFICIENT_MARGIN: 'Not enough free margin.',
  VALIDATION: 'Order failed validation.',
};

export function rejectMessage(
  reason: string | null | undefined,
  opts?: { stopLevelPips?: number },
): string | null {
  if (!reason) return null;
  if (reason === 'TOO_CLOSE_TO_MARKET' && opts?.stopLevelPips != null) {
    const p = opts.stopLevelPips;
    return `Too close to market — pending Limit/Stop need ≥ ${p} pip${p === 1 ? '' : 's'} from the ask (buy) or bid (sell).`;
  }
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

export interface OrderTicketDraft {
  side: OrderSide;
  type: OrderType;
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number;
}

export interface OrderLevelPatch {
  kind: 'entry' | 'sl' | 'tp';
  price: number;
}

interface OrderTicketProps {
  open: boolean;
  onClose: () => void;
  symbol: string;
  bid: number;
  ask: number;
  digits: number;
  pipSize: number;
  tickSize: number;
  contractSize: number;
  /** Instrument base currency — needed for correct margin (e.g. USDJPY). */
  baseCurrency: string;
  leverage: number;
  freeMargin: number;
  accountCurrency: string;
  lastReject?: string | null;
  disabled?: boolean;
  /** Chart → ticket sync after dragging a draft level (mouseup). */
  levelPatch?: OrderLevelPatch | null;
  onLevelPatchConsumed?: () => void;
  onSubmit: (order: OrderTicketSubmit) => void;
  onDraftChange?: (draft: OrderTicketDraft | null) => void;
}

const inputCls =
  'w-full min-h-11 rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground tabular-nums outline-none focus:border-accent';

/**
 * TradingView-style order ticket (right drawer).
 * Sell/Buy quote buttons · type tabs · TP/SL toggles · margin summary · chart draft levels.
 */
export function OrderTicket({
  open,
  onClose,
  symbol,
  bid,
  ask,
  digits,
  pipSize,
  tickSize,
  contractSize,
  baseCurrency,
  leverage,
  freeMargin,
  accountCurrency,
  lastReject,
  disabled,
  levelPatch,
  onLevelPatchConsumed,
  onSubmit,
  onDraftChange,
}: OrderTicketProps) {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('MARKET');
  const [size, setSize] = useState('0.10');
  const [price, setPrice] = useState('');
  const [tpOn, setTpOn] = useState(true);
  const [slOn, setSlOn] = useState(true);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [tif, setTif] = useState<TimeInForce>('GTC');
  /** Pip presets apply only after the user picks them (TV: SL/TP stay on entry until set). */
  const [tpPips, setTpPips] = useState(40);
  const [slPips, setSlPips] = useState(20);
  /** False = SL/TP sit on the entry line until drag / pip / manual edit. */
  const [slPlaced, setSlPlaced] = useState(false);
  const [tpPlaced, setTpPlaced] = useState(false);

  const spreadPips = pipSize > 0 ? (ask - bid) / pipSize : 0;
  // Chart last-price line is bid — default entry there (TV-style), not ask.
  const lastPx = bid > 0 ? bid : ask;
  const entryPx =
    type === 'MARKET' ? lastPx : Number(price) || lastPx;

  const lots = Number(size) || 0;
  // Notional in account: base==account → lots*contract; else ≈ lots*contract*price (quote=account).
  const baseIsAccount =
    baseCurrency.toUpperCase() === accountCurrency.toUpperCase();
  const fillPx = type === 'MARKET' ? (side === 'BUY' ? ask : bid) : entryPx;
  const notionalAccount = lots * contractSize * (baseIsAccount ? 1 : fillPx);
  const reqMargin = leverage > 0 ? notionalAccount / leverage : 0;
  const tradeValue = notionalAccount;
  const tickValue = baseIsAccount
    ? (tickSize * contractSize * lots) / (fillPx > 0 ? fillPx : 1)
    : tickSize * contractSize * lots;

  // Seed on open / side: Market @ last price; SL/TP on the entry until dragged.
  useEffect(() => {
    if (!open) return;
    const seed = lastPx.toFixed(digits);
    setType('MARKET');
    setPrice(seed);
    setSl(seed);
    setTp(seed);
    setSlPlaced(false);
    setTpPlaced(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side]);

  // Keep Market entry on the live last-price line; unplaced brackets follow entry.
  useEffect(() => {
    if (!open || type !== 'MARKET') return;
    const seed = lastPx.toFixed(digits);
    setPrice(seed);
    if (!slPlaced) setSl(seed);
    if (!tpPlaced) setTp(seed);
  }, [open, type, lastPx, digits, slPlaced, tpPlaced]);

  // Chart drag → ticket fields (mouseup)
  useEffect(() => {
    if (!open || !levelPatch) return;
    const pxNum = levelPatch.price;
    const px = pxNum.toFixed(digits);
    if (levelPatch.kind === 'entry') {
      setType(inferPendingType(side, pxNum, bid, ask));
      setPrice(px);
      if (!slPlaced) setSl(px);
      if (!tpPlaced) setTp(px);
    } else if (levelPatch.kind === 'sl') {
      setSlOn(true);
      setSlPlaced(true);
      setSl(px);
    } else if (levelPatch.kind === 'tp') {
      setTpOn(true);
      setTpPlaced(true);
      setTp(px);
    }
    onLevelPatchConsumed?.();
  }, [
    levelPatch,
    open,
    digits,
    onLevelPatchConsumed,
    side,
    bid,
    ask,
    slPlaced,
    tpPlaced,
  ]);

  useEffect(() => {
    if (!open) {
      onDraftChange?.(null);
      return;
    }
    const slPx = slOn ? Number(sl) : NaN;
    const tpPx = tpOn ? Number(tp) : NaN;
    // Keep SL/TP on the entry line (TV) so they can be dragged off; submit omits until placed.
    onDraftChange?.({
      side,
      type,
      entry: entryPx,
      stopLoss: slOn && Number.isFinite(slPx) ? slPx : null,
      takeProfit: tpOn && Number.isFinite(tpPx) ? tpPx : null,
      size: lots || 0.1,
    });
  }, [
    open,
    side,
    type,
    size,
    price,
    sl,
    tp,
    slOn,
    tpOn,
    entryPx,
    lots,
    onDraftChange,
  ]);

  if (!open) return null;

  const stopLevelPips = pipSize > 0 ? 1 : undefined;
  const msg = rejectMessage(lastReject, { stopLevelPips });
  const displaySym = symbol.includes('/')
    ? symbol
    : symbol.length >= 6
      ? `${symbol.slice(0, 3)}/${symbol.slice(3, 6)}`
      : symbol;

  const placeLabel = [
    side === 'BUY' ? 'Buy' : 'Sell',
    '/',
    lots || 0.1,
    displaySym.replace('/', ''),
    '@',
    entryPx.toFixed(digits),
    type === 'MARKET' ? 'MARKET' : type === 'LIMIT' ? 'LIMIT' : 'STOP',
  ].join(' ');

  return (
    <>
      {/* Phone dimmer — dismiss sheet */}
      <button
        type="button"
        className="fixed inset-0 z-30 bg-background/55 sm:hidden"
        aria-label="Close order ticket"
        onClick={onClose}
      />
      <aside
        className={[
          'pointer-events-auto flex flex-col bg-background border-border',
          // Phone: bottom sheet so the chart keeps full width
          'fixed inset-x-0 bottom-0 z-40 w-full max-h-[min(90dvh,640px)] rounded-t-xl border-t shadow-xl',
          'pb-[env(safe-area-inset-bottom)]',
          // Desktop / tablet+: side dock
          'sm:relative sm:inset-auto sm:z-20 sm:shrink-0 sm:w-[300px] sm:h-full sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-none sm:pb-0',
        ].join(' ')}
        role="dialog"
        aria-label="Order ticket"
      >
      {/* Header: symbol + Order tab */}
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-border">
        <span className="text-[13px] font-semibold text-foreground tracking-wide">
          {displaySym}
        </span>
        <div className="flex items-center gap-3 ml-2 text-[12px]">
          <span className="text-foreground border-b-2 border-accent pb-2.5 pt-2.5 font-medium">
            Order
          </span>
          <span className="text-muted pb-2.5 pt-2.5 cursor-default" title="Not available in replay">
            Depth
          </span>
        </div>
        <button
          type="button"
          className="ml-auto min-h-11 min-w-11 rounded text-muted hover:text-foreground hover:bg-surface"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {/* Sell / Buy quote buttons with spread badge */}
        <div className="relative grid grid-cols-2 gap-0 rounded-lg overflow-hidden border border-border">
          <button
            type="button"
            className={[
              'min-h-[52px] flex flex-col items-center justify-center gap-0.5 transition-colors',
              side === 'SELL'
                ? 'bg-danger text-danger-foreground'
                : 'bg-surface text-muted hover:text-foreground',
            ].join(' ')}
            onClick={() => setSide('SELL')}
          >
            <span className="text-[11px] opacity-80">Sell</span>
            <span className="text-[15px] font-semibold tabular-nums">{bid.toFixed(digits)}</span>
          </button>
          <button
            type="button"
            className={[
              'min-h-[52px] flex flex-col items-center justify-center gap-0.5 transition-colors',
              side === 'BUY'
                ? 'bg-accent text-accent-foreground'
                : 'bg-surface text-muted hover:text-foreground',
            ].join(' ')}
            onClick={() => setSide('BUY')}
          >
            <span className="text-[11px] opacity-80">Buy</span>
            <span className="text-[15px] font-semibold tabular-nums">{ask.toFixed(digits)}</span>
          </button>
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 rounded px-1.5 py-0.5 text-[10px] font-mono tabular-nums bg-background border border-border text-foreground">
            {spreadPips.toFixed(1)}
          </span>
        </div>

        {/* Market / Limit / Stop */}
        <div className="flex items-center gap-4 border-b border-border">
          {(
            [
              ['MARKET', 'Market'],
              ['LIMIT', 'Limit'],
              ['STOP', 'Stop'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={[
                'min-h-11 text-[13px] pb-2 -mb-px border-b-2 transition-colors',
                type === id
                  ? 'border-accent text-foreground font-medium'
                  : 'border-transparent text-muted hover:text-foreground',
              ].join(' ')}
              onClick={() => {
                setType(id);
                if (id !== 'MARKET') {
                  // Limit/Stop default on the visible last-price line (bid).
                  setPrice(lastPx.toFixed(digits));
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Price (limit/stop) */}
        {type !== 'MARKET' && (
          <Field label="Price">
            <div className="relative">
              <input
                className={inputCls}
                value={price}
                onChange={(e) => {
                  const v = e.target.value;
                  setPrice(v);
                  const n = Number(v);
                  if (Number.isFinite(n)) {
                    setType(inferPendingType(side, n, bid, ask));
                  }
                }}
                inputMode="decimal"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">
                {type === 'STOP' ? 'Stop' : side === 'BUY' ? 'Ask' : 'Bid'}
              </span>
            </div>
          </Field>
        )}

        {/* Lots */}
        <Field label={`Lots · margin ${accountCurrency}`}>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              inputMode="decimal"
            />
            <span className="shrink-0 min-h-11 px-3 rounded-md border border-border bg-surface text-[12px] text-muted flex items-center">
              lots
            </span>
          </div>
        </Field>

        {/* Take profit */}
        <BracketRow
          label="Take profit, price"
          on={tpOn}
          onToggle={(v) => {
            setTpOn(v);
            if (v && !tpPlaced) setTp(entryPx.toFixed(digits));
          }}
          price={tp}
          onPrice={(v) => {
            setTpPlaced(true);
            setTp(v);
          }}
          pips={tpPips}
          onPips={(n) => {
            setTpPlaced(true);
            setTpPips(n);
            setTp(
              round(
                entryPx + (side === 'BUY' ? 1 : -1) * pipSize * n,
                digits,
              ).toFixed(digits),
            );
          }}
          accent="success"
          hint={!tpPlaced ? 'On entry — drag on chart or pick pips' : undefined}
        />

        {/* Stop loss */}
        <BracketRow
          label="Stop loss, price"
          on={slOn}
          onToggle={(v) => {
            setSlOn(v);
            if (v && !slPlaced) setSl(entryPx.toFixed(digits));
          }}
          price={sl}
          onPrice={(v) => {
            setSlPlaced(true);
            setSl(v);
          }}
          pips={slPips}
          onPips={(n) => {
            setSlPlaced(true);
            setSlPips(n);
            setSl(
              round(
                entryPx + (side === 'BUY' ? -1 : 1) * pipSize * n,
                digits,
              ).toFixed(digits),
            );
          }}
          accent="danger"
          hint={!slPlaced ? 'On entry — drag on chart or pick pips' : undefined}
        />

        {/* TIF */}
        <Field label="Time in force">
          <select
            className={inputCls}
            value={tif}
            onChange={(e) => setTif(e.target.value as TimeInForce)}
          >
            <option value="GTC">GTC (Good til canceled)</option>
            <option value="DAY">Day</option>
            <option value="IOC">IOC</option>
            <option value="FOK">FOK</option>
          </select>
        </Field>

        {/* Order info */}
        <section className="rounded-lg border border-border bg-surface/60 p-3 space-y-2.5">
          <h3 className="text-[11px] font-medium text-muted uppercase tracking-wide">
            Order info
          </h3>
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted">Margin</span>
              <span className="font-mono tabular-nums text-foreground">
                {fmt(reqMargin)} / {fmt(freeMargin)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-background overflow-hidden">
              <div
                className={[
                  'h-full rounded-full transition-[width]',
                  reqMargin > freeMargin ? 'bg-danger' : 'bg-accent',
                ].join(' ')}
                style={{
                  width: `${Math.min(100, freeMargin > 0 ? (reqMargin / freeMargin) * 100 : 0)}%`,
                }}
              />
            </div>
            {reqMargin > freeMargin && (
              <p className="text-[10px] text-danger mt-1">
                Required margin exceeds free margin — reduce lots or close the ticket.
              </p>
            )}
          </div>
          <InfoRow label="Leverage" value={`${leverage}:1`} />
          <InfoRow
            label="Tick value"
            value={`${tickValue.toFixed(2)} ${accountCurrency}`}
          />
          <InfoRow
            label="Notional"
            value={`${fmt(tradeValue)} ${accountCurrency}`}
          />
          <p className="text-[10px] text-muted leading-snug pt-1">
            Entry defaults on the last price · drag SL/TP off the entry (or pick pips) ·
            market fills at next bar open
          </p>
        </section>

        {msg && (
          <p className="text-[12px] text-danger" role="alert">
            {msg}
          </p>
        )}
      </div>

      {/* Primary CTA */}
      <div className="shrink-0 p-3 border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={disabled || lots <= 0}
          className={[
            'w-full min-h-12 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-40',
            side === 'BUY'
              ? 'bg-accent text-accent-foreground hover:opacity-90'
              : 'bg-danger text-danger-foreground hover:opacity-90',
          ].join(' ')}
          onClick={() => {
            if (lots <= 0) return;
            const slN = Number(sl);
            const tpN = Number(tp);
            const slReady =
              slOn &&
              slPlaced &&
              Number.isFinite(slN) &&
              Math.abs(slN - entryPx) > tickSize * 0.5;
            const tpReady =
              tpOn &&
              tpPlaced &&
              Number.isFinite(tpN) &&
              Math.abs(tpN - entryPx) > tickSize * 0.5;
            onSubmit({
              side,
              type,
              size: lots,
              price: type === 'MARKET' ? undefined : Number(price),
              stopLoss: slReady ? slN : undefined,
              takeProfit: tpReady ? tpN : undefined,
              tif,
            });
          }}
        >
          {placeLabel}
        </button>
      </div>
    </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[11px] text-muted">
      {label}
      {children}
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-muted">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function BracketRow({
  label,
  on,
  onToggle,
  price,
  onPrice,
  pips,
  onPips,
  accent,
  hint,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  price: string;
  onPrice: (v: string) => void;
  pips: number;
  onPips: (n: number) => void;
  accent: 'success' | 'danger';
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={[
            'relative w-10 h-6 rounded-full transition-colors min-h-11 sm:min-h-6 flex items-center',
            on
              ? accent === 'success'
                ? 'bg-success'
                : 'bg-danger'
              : 'bg-border',
          ].join(' ')}
          onClick={() => onToggle(!on)}
        >
          <span
            className={[
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-foreground transition-transform',
              on ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>
      {on && (
        <>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={price}
              onChange={(e) => onPrice(e.target.value)}
              inputMode="decimal"
            />
            <select
              className="shrink-0 min-h-11 w-[7.5rem] rounded-md border border-border bg-surface px-2 text-[11px] text-muted"
              value={pips}
              onChange={(e) => onPips(Number(e.target.value))}
            >
              {[10, 15, 20, 25, 40, 50, 75, 100, 150, 200].map((t) => (
                <option key={t} value={t}>
                  {t} pips
                </option>
              ))}
            </select>
          </div>
          {hint && <p className="text-[10px] text-muted">{hint}</p>}
        </>
      )}
    </div>
  );
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(2);
}
