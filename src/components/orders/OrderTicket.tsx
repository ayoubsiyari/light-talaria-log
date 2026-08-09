import { useEffect, useState } from 'react';
import { inferPendingType } from '@/orders/inferPendingType';
import { defaultSpecForSymbol } from '@/orders/instrumentSpec';
import { unrealizedPnL } from '@/orders/pnl';
import type { OrderSide, OrderType, TimeInForce } from '@/orders/orderTypes';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';

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

/**
 * V9 Obsidian order ticket (right rail / phone sheet).
 * Markup uses data-order-v2 so chrome-order-ticket.css styles it — engine wiring unchanged.
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

  // Seed on open / side: Market @ last price; SL/TP at default pip offsets
  // so Place Order always attaches brackets (TV-like visible risk/reward).
  useEffect(() => {
    if (!open) return;
    const seed = lastPx.toFixed(digits);
    setType('MARKET');
    setPrice(seed);
    const slOff = slPips * pipSize;
    const tpOff = tpPips * pipSize;
    const slPx =
      side === 'BUY' ? lastPx - slOff : lastPx + slOff;
    const tpPx =
      side === 'BUY' ? lastPx + tpOff : lastPx - tpOff;
    setSl(slPx.toFixed(digits));
    setTp(tpPx.toFixed(digits));
    setSlPlaced(slOn);
    setTpPlaced(tpOn);
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

  // Chart drag → ticket fields (live while dragging + mouseup)
  useEffect(() => {
    if (!open || !levelPatch) return;
    const pxNum = levelPatch.price;
    const px = pxNum.toFixed(digits);
    const distPips = (from: number, to: number) =>
      pipSize > 0
        ? Math.max(1, Math.round(Math.abs(to - from) / pipSize))
        : 1;
    if (levelPatch.kind === 'entry') {
      setType(inferPendingType(side, pxNum, bid, ask));
      setPrice(px);
      if (!slPlaced) setSl(px);
      if (!tpPlaced) setTp(px);
    } else if (levelPatch.kind === 'sl') {
      setSlOn(true);
      setSlPlaced(true);
      setSl(px);
      setSlPips(distPips(entryPx, pxNum));
    } else if (levelPatch.kind === 'tp') {
      setTpOn(true);
      setTpPlaced(true);
      setTp(px);
      setTpPips(distPips(entryPx, pxNum));
    }
    onLevelPatchConsumed?.();
  }, [
    levelPatch,
    open,
    digits,
    pipSize,
    entryPx,
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

  const effLots = lots || 0.1;
  const slN = Number(sl);
  const tpN = Number(tp);
  const slAuto =
    side === 'BUY' ? entryPx - slPips * pipSize : entryPx + slPips * pipSize;
  const tpAuto =
    side === 'BUY' ? entryPx + tpPips * pipSize : entryPx - tpPips * pipSize;
  const slPxLive =
    slOn && Number.isFinite(slN) && Math.abs(slN - entryPx) > tickSize * 0.5
      ? slN
      : slOn
        ? slAuto
        : NaN;
  const tpPxLive =
    tpOn && Number.isFinite(tpN) && Math.abs(tpN - entryPx) > tickSize * 0.5
      ? tpN
      : tpOn
        ? tpAuto
        : NaN;

  const specLike = {
    ...defaultSpecForSymbol(displaySym.replace('/', '')),
    digits,
    pipSize,
    tickSize,
    contractSize,
    baseCurrency,
    leverage,
    typicalSpread: Math.max(0, ask - bid),
  };

  const riskAmt =
    slOn && Number.isFinite(slPxLive) && entryPx > 0
      ? unrealizedPnL(side, entryPx, slPxLive, slPxLive, effLots, specLike, {
          accountCurrency,
          instrumentPrice: entryPx,
        }).amount
      : 0;
  const rewardAmt =
    tpOn && Number.isFinite(tpPxLive) && entryPx > 0
      ? unrealizedPnL(side, entryPx, tpPxLive, tpPxLive, effLots, specLike, {
          accountCurrency,
          instrumentPrice: entryPx,
        }).amount
      : 0;
  const slDistPips =
    slOn && Number.isFinite(slPxLive) && pipSize > 0
      ? Math.abs(slPxLive - entryPx) / pipSize
      : 0;
  const tpDistPips =
    tpOn && Number.isFinite(tpPxLive) && pipSize > 0
      ? Math.abs(tpPxLive - entryPx) / pipSize
      : 0;
  const absRisk = Math.abs(riskAmt);
  const absReward = Math.abs(rewardAmt);
  const rrTotal = absRisk + absReward;
  const riskPct = rrTotal > 0 ? (absRisk / rrTotal) * 100 : 50;
  const rewardPct = rrTotal > 0 ? (absReward / rrTotal) * 100 : 50;
  const marginPct = freeMargin > 0 ? (reqMargin / freeMargin) * 100 : 0;

  const placeLabel =
    lots <= 0
      ? `${side === 'BUY' ? 'Buy' : 'Sell'} — Set Position Size`
      : `${side === 'BUY' ? 'Buy' : 'Sell'} ${effLots.toFixed(2)} Lots`;

  const submitOrder = () => {
    if (lots <= 0) return;
    onSubmit({
      side,
      type,
      size: lots,
      price: type === 'MARKET' ? undefined : Number(price),
      stopLoss: Number.isFinite(slPxLive) ? slPxLive : undefined,
      takeProfit: Number.isFinite(tpPxLive) ? tpPxLive : undefined,
      tif,
    });
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-background/55 sm:hidden"
        aria-label="Close order ticket"
        onClick={onClose}
      />
      <aside
        data-v9-chrome="1"
        data-v9-order="1"
        data-order-v2="1"
        data-side={side === 'BUY' ? 'buy' : 'sell'}
        data-order-mode="dock"
        className={[
          'pointer-events-auto flex flex-col',
          'fixed inset-x-0 bottom-0 z-40 w-full max-h-[min(90dvh,640px)] rounded-t-xl border-t border-[color:var(--line)]',
          'pb-[env(safe-area-inset-bottom)]',
          'sm:relative sm:inset-auto sm:z-20 sm:shrink-0 sm:w-[300px] sm:h-full sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0',
        ].join(' ')}
        role="dialog"
        aria-label="Order ticket"
      >
        <header data-win-header="">
          <span data-win-title="">Order</span>
          <span data-order-mode-chip="">{type}</span>
          <button
            type="button"
            data-brand-icon="1"
            className="ml-auto min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <ChromeIcon n="x" s={16} />
          </button>
        </header>

        <div data-order-hero="">
          <span data-order-sym="">{displaySym}</span>
          <div data-order-asset="">
            <span>Forex</span>
            <span>·</span>
            <span>{leverage}:1</span>
          </div>
          <div data-order-metrics="">
            <span>
              Spread <b>{spreadPips.toFixed(1)}</b>
            </span>
            <span>
              Margin <b>{fmt(reqMargin)}</b>
            </span>
            <span>
              Free <b>{fmt(freeMargin)}</b>
            </span>
          </div>
        </div>

        <div data-order-stack="" className="flex-1 min-h-0 overflow-y-auto">
          <div data-order-block="" data-order-intent="">
            <div data-order-block-title="">Side</div>
            <div data-order-side="">
              <button
                type="button"
                data-side="buy"
                data-active={side === 'BUY' ? '1' : undefined}
                aria-pressed={side === 'BUY'}
                onClick={() => setSide('BUY')}
              >
                BUY
              </button>
              <button
                type="button"
                data-side="sell"
                data-active={side === 'SELL' ? '1' : undefined}
                aria-pressed={side === 'SELL'}
                onClick={() => setSide('SELL')}
              >
                SELL
              </button>
            </div>
            <div data-order-type="">
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
                  data-active={type === id ? '1' : undefined}
                  aria-pressed={type === id}
                  onClick={() => {
                    setType(id);
                    if (id !== 'MARKET') setPrice(lastPx.toFixed(digits));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div data-order-block="">
            <div data-order-block-title="">Position size</div>
            <div data-order-size-row="">
              <label data-order-size-well="">
                <span aria-hidden>#</span>
                <input
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  inputMode="decimal"
                  aria-label="Lots"
                />
              </label>
              <span data-order-size-meta="">
                {marginPct.toFixed(1)}% margin · tick {tickValue.toFixed(2)}
              </span>
            </div>
          </div>

          <div data-order-block="" data-order-levels="">
            <div data-order-block-title="">Levels</div>

            <div data-order-level="entry">
              <div data-order-level-head="">
                <span data-order-level-title="">Entry</span>
                {type === 'MARKET' ? (
                  <span data-order-level-count="">MKT</span>
                ) : null}
              </div>
              <div className="px-2.5 py-2">
                {type === 'MARKET' ? (
                  <div className="font-mono tabular-nums text-[13px] font-semibold text-[color:var(--text)]">
                    {entryPx.toFixed(digits)}
                    <span className="ml-2 text-[10px] font-medium text-[color:var(--text-faint)]">
                      {side === 'BUY' ? 'ask' : 'bid'}{' '}
                      {(side === 'BUY' ? ask : bid).toFixed(digits)}
                    </span>
                  </div>
                ) : (
                  <label data-order-size-well="">
                    <input
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
                      aria-label="Entry price"
                    />
                  </label>
                )}
              </div>
            </div>

            <div data-order-level="sl">
              <div data-order-level-head="">
                <label className="inline-flex items-center gap-2 min-h-9 cursor-default">
                  <input
                    type="checkbox"
                    checked={slOn}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setSlOn(v);
                      if (v && !slPlaced) setSl(entryPx.toFixed(digits));
                    }}
                  />
                  <span data-order-level-title="">Stop</span>
                </label>
                {slOn ? (
                  <span data-order-level-count="">{slPips}p</span>
                ) : null}
              </div>
              {slOn ? (
                <div className="px-2.5 py-2 space-y-1.5">
                  <label data-order-size-well="">
                    <input
                      value={sl}
                      onChange={(e) => {
                        setSlPlaced(true);
                        setSl(e.target.value);
                      }}
                      inputMode="decimal"
                      aria-label="Stop loss"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-semibold tabular-nums">
                    <span className="text-[color:var(--down)]">
                      LOSS {fmtMoney(riskAmt)}
                    </span>
                    <span className="text-[color:var(--text-faint)]">
                      DIST {slDistPips.toFixed(1)} pips
                    </span>
                  </div>
                  <select
                    className="w-full h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] px-2 text-[11px] text-[color:var(--text-muted)]"
                    value={slPips}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setSlPlaced(true);
                      setSlPips(n);
                      setSl(
                        round(
                          entryPx + (side === 'BUY' ? -1 : 1) * pipSize * n,
                          digits,
                        ).toFixed(digits),
                      );
                    }}
                    aria-label="Stop loss pips"
                  >
                    {[10, 15, 20, 25, 40, 50, 75, 100, 150, 200, slPips]
                      .filter((t, i, a) => a.indexOf(t) === i)
                      .sort((a, b) => a - b)
                      .map((t) => (
                        <option key={t} value={t}>
                          {t} pips
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div data-order-level="tp">
              <div data-order-level-head="">
                <label className="inline-flex items-center gap-2 min-h-9 cursor-default">
                  <input
                    type="checkbox"
                    checked={tpOn}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setTpOn(v);
                      if (v && !tpPlaced) setTp(entryPx.toFixed(digits));
                    }}
                  />
                  <span data-order-level-title="">Target</span>
                </label>
                {tpOn ? (
                  <span data-order-level-count="">{tpPips}p</span>
                ) : null}
              </div>
              {tpOn ? (
                <div className="px-2.5 py-2 space-y-1.5">
                  <label data-order-size-well="">
                    <input
                      value={tp}
                      onChange={(e) => {
                        setTpPlaced(true);
                        setTp(e.target.value);
                      }}
                      inputMode="decimal"
                      aria-label="Take profit"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-semibold tabular-nums">
                    <span className="text-[color:var(--up)]">
                      PROFIT {fmtMoney(rewardAmt)}
                    </span>
                    <span className="text-[color:var(--text-faint)]">
                      DIST {tpDistPips.toFixed(1)} pips
                    </span>
                  </div>
                  <select
                    className="w-full h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] px-2 text-[11px] text-[color:var(--text-muted)]"
                    value={tpPips}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setTpPlaced(true);
                      setTpPips(n);
                      setTp(
                        round(
                          entryPx + (side === 'BUY' ? 1 : -1) * pipSize * n,
                          digits,
                        ).toFixed(digits),
                      );
                    }}
                    aria-label="Take profit pips"
                  >
                    {[10, 15, 20, 25, 40, 50, 75, 100, 150, 200, tpPips]
                      .filter((t, i, a) => a.indexOf(t) === i)
                      .sort((a, b) => a - b)
                      .map((t) => (
                        <option key={t} value={t}>
                          {t} pips
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <div data-order-block="">
            <div data-order-block-title="">Time in force</div>
            <select
              className="w-full h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 text-[12px] text-[color:var(--text)]"
              value={tif}
              onChange={(e) => setTif(e.target.value as TimeInForce)}
            >
              <option value="GTC">GTC</option>
              <option value="DAY">Day</option>
              <option value="IOC">IOC</option>
              <option value="FOK">FOK</option>
            </select>
            <p className="mt-2 text-[10px] text-[color:var(--text-faint)] leading-snug">
              Notional {fmt(tradeValue)} {accountCurrency}
              {reqMargin > freeMargin ? ' · margin exceeds free' : ''}
            </p>
          </div>

          {msg ? (
            <p className="text-[12px] text-[color:var(--down)] px-1" role="alert">
              {msg}
            </p>
          ) : null}
        </div>

        <div data-order-rr="">
          <div data-order-rr-bar="" aria-hidden>
            <span
              style={{
                width: `${riskPct}%`,
                background: 'var(--down)',
              }}
            />
            <span
              style={{
                width: `${rewardPct}%`,
                background: 'var(--up)',
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] font-semibold tabular-nums">
            <span className="text-[color:var(--down)]">Risk {fmtMoney(riskAmt)}</span>
            <span className="text-[color:var(--up)]">Reward {fmtMoney(rewardAmt)}</span>
          </div>
        </div>

        <div data-order-foot="" className="pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            data-brand-btn="primary"
            disabled={disabled || lots <= 0}
            className="w-full disabled:opacity-40"
            onClick={submitOrder}
          >
            {placeLabel}
          </button>
        </div>
      </aside>
    </>
  );
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return n.toFixed(2);
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
