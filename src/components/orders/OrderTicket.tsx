import { useEffect, useMemo, useState } from 'react';
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
  baseCurrency: string;
  leverage: number;
  freeMargin: number;
  accountCurrency: string;
  lastReject?: string | null;
  disabled?: boolean;
  levelPatch?: OrderLevelPatch | null;
  onLevelPatchConsumed?: () => void;
  onSubmit: (order: OrderTicketSubmit) => void;
  onDraftChange?: (draft: OrderTicketDraft | null) => void;
}

type SizeMode = '#' | '$' | '%';

const PRE_TAG_DEFS = ['Setup A', 'Setup B', 'News', 'FOMO'];

function Stepper({
  onUp,
  onDown,
  tone,
}: {
  onUp: () => void;
  onDown: () => void;
  tone?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        flexShrink: 0,
        color: tone || 'var(--text-muted)',
      }}
    >
      <button
        type="button"
        aria-label="Increase"
        onClick={onUp}
        className="w-3 h-[11px] inline-flex items-center justify-center"
      >
        <svg width={8} height={5} viewBox="0 0 8 5" fill="none" aria-hidden>
          <polyline
            points="1,4 4,1 7,4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Decrease"
        onClick={onDown}
        className="w-3 h-[11px] inline-flex items-center justify-center"
      >
        <svg width={8} height={5} viewBox="0 0 8 5" fill="none" aria-hidden>
          <polyline
            points="1,1 4,4 7,1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function LevelChk({
  checked,
  tone,
  onChange,
}: {
  checked: boolean;
  tone: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="w-3 h-3 inline-flex items-center justify-center shrink-0"
      style={{ color: checked ? tone : 'var(--text-faint)' }}
    >
      <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden>
        <rect
          x="0.75"
          y="0.75"
          width="8.5"
          height="8.5"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        {checked ? (
          <path
            d="M2.2 5.1 L4.2 7 L7.8 3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </button>
  );
}

function MultiToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-order-multi=""
      data-on={on ? '1' : undefined}
      aria-pressed={on}
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 h-5 px-1.5 rounded text-[10px] font-semibold"
      style={{
        color: on ? 'var(--accent)' : 'var(--text-faint)',
        border: `1px solid ${on ? 'var(--line-strong)' : 'var(--line)'}`,
        background: on ? 'var(--accent-quiet)' : 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 10,
          borderRadius: 999,
          background: on ? 'var(--accent)' : 'var(--surface-raised)',
          border: '1px solid var(--line)',
          position: 'relative',
          display: 'inline-block',
        }}
      >
        <i
          style={{
            position: 'absolute',
            top: 1,
            left: on ? 8 : 1,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: on ? '#fff' : 'var(--text-muted)',
            transition: 'left 0.12s',
          }}
        />
      </span>
      Multi
    </button>
  );
}

/**
 * V9 Obsidian order ticket — Live data-order-v2 grammar; our engine wiring.
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
  const [sizeMode, setSizeMode] = useState<SizeMode>('#');
  const [sizeModeOpen, setSizeModeOpen] = useState(false);
  const [riskVal, setRiskVal] = useState('0.10');
  const [price, setPrice] = useState('');
  const [tpOn, setTpOn] = useState(true);
  const [slOn, setSlOn] = useState(true);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [tif] = useState<TimeInForce>('GTC');
  const [tpPips, setTpPips] = useState(40);
  const [slPips, setSlPips] = useState(20);
  const [slPlaced, setSlPlaced] = useState(false);
  const [tpPlaced, setTpPlaced] = useState(false);
  const [entryMulti, setEntryMulti] = useState(false);
  const [tpMulti, setTpMulti] = useState(false);
  const [autoBe, setAutoBe] = useState(false);
  const [beTriggerR, setBeTriggerR] = useState('1.5');
  const [beOffsetPips, setBeOffsetPips] = useState('0');
  const [journalOpen, setJournalOpen] = useState(false);
  const [preTags, setPreTags] = useState<string[]>([]);

  const spreadPips = pipSize > 0 ? (ask - bid) / pipSize : 0;
  const lastPx = bid > 0 ? bid : ask;
  const entryPx = type === 'MARKET' ? lastPx : Number(price) || lastPx;

  const displaySym = symbol.includes('/')
    ? symbol
    : symbol.length >= 6
      ? `${symbol.slice(0, 3)}/${symbol.slice(3, 6)}`
      : symbol;

  const specLike = useMemo(
    () => ({
      ...defaultSpecForSymbol(displaySym.replace('/', '')),
      digits,
      pipSize,
      tickSize,
      contractSize,
      baseCurrency,
      leverage,
      typicalSpread: Math.max(0, ask - bid),
    }),
    [
      displaySym,
      digits,
      pipSize,
      tickSize,
      contractSize,
      baseCurrency,
      leverage,
      ask,
      bid,
    ],
  );

  const slAuto =
    side === 'BUY' ? entryPx - slPips * pipSize : entryPx + slPips * pipSize;
  const tpAuto =
    side === 'BUY' ? entryPx + tpPips * pipSize : entryPx - tpPips * pipSize;
  const slN = Number(sl);
  const tpN = Number(tp);
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

  /** Risk $ per 1.0 lot at current SL distance. */
  const riskPerLot =
    slOn && Number.isFinite(slPxLive) && entryPx > 0
      ? Math.abs(
          unrealizedPnL(side, entryPx, slPxLive, slPxLive, 1, specLike, {
            accountCurrency,
            instrumentPrice: entryPx,
          }).amount,
        )
      : 0;

  const lots = (() => {
    const v = Number(riskVal) || 0;
    if (sizeMode === '#') return v;
    if (sizeMode === '$') {
      if (!(riskPerLot > 0)) return 0;
      return Math.max(0, v / riskPerLot);
    }
    // % of free margin as risk dollars
    const riskUsd = (Math.max(0, Math.min(100, v)) / 100) * freeMargin;
    if (!(riskPerLot > 0)) return 0;
    return Math.max(0, riskUsd / riskPerLot);
  })();

  const baseIsAccount =
    baseCurrency.toUpperCase() === accountCurrency.toUpperCase();
  const fillPx = type === 'MARKET' ? (side === 'BUY' ? ask : bid) : entryPx;
  const notionalAccount = lots * contractSize * (baseIsAccount ? 1 : fillPx);
  const reqMargin = leverage > 0 ? notionalAccount / leverage : 0;
  const marginLevelPct =
    reqMargin > 0 ? (freeMargin / reqMargin) * 100 : 999;

  useEffect(() => {
    if (!open) return;
    const seed = lastPx.toFixed(digits);
    setType('MARKET');
    setPrice(seed);
    const slOff = slPips * pipSize;
    const tpOff = tpPips * pipSize;
    const slPx = side === 'BUY' ? lastPx - slOff : lastPx + slOff;
    const tpPx = side === 'BUY' ? lastPx + tpOff : lastPx - tpOff;
    setSl(slPx.toFixed(digits));
    setTp(tpPx.toFixed(digits));
    setSlPlaced(slOn);
    setTpPlaced(tpOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side]);

  useEffect(() => {
    if (!open || type !== 'MARKET') return;
    const seed = lastPx.toFixed(digits);
    setPrice(seed);
    if (!slPlaced) setSl(seed);
    if (!tpPlaced) setTp(seed);
  }, [open, type, lastPx, digits, slPlaced, tpPlaced]);

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
    onDraftChange?.({
      side,
      type,
      entry: entryPx,
      stopLoss: slOn && Number.isFinite(slPx) ? slPx : null,
      takeProfit: tpOn && Number.isFinite(tpPx) ? tpPx : null,
      size: lots > 0 ? lots : 0.1,
    });
  }, [
    open,
    side,
    type,
    riskVal,
    sizeMode,
    price,
    sl,
    tp,
    slOn,
    tpOn,
    entryPx,
    lots,
    onDraftChange,
  ]);

  useEffect(() => {
    if (!sizeModeOpen) return;
    const onPtr = () => setSizeModeOpen(false);
    window.addEventListener('pointerdown', onPtr);
    return () => window.removeEventListener('pointerdown', onPtr);
  }, [sizeModeOpen]);

  if (!open) return null;

  const stopLevelPips = pipSize > 0 ? 1 : undefined;
  const msg = rejectMessage(lastReject, { stopLevelPips });
  const effLots = lots > 0 ? lots : 0;

  const riskAmt =
    slOn && Number.isFinite(slPxLive) && entryPx > 0 && effLots > 0
      ? unrealizedPnL(side, entryPx, slPxLive, slPxLive, effLots, specLike, {
          accountCurrency,
          instrumentPrice: entryPx,
        }).amount
      : 0;
  const rewardAmt =
    tpOn && Number.isFinite(tpPxLive) && entryPx > 0 && effLots > 0
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
  const riskPctBar = rrTotal > 0 ? (absRisk / rrTotal) * 100 : 50;
  const rewardPctBar = rrTotal > 0 ? (absReward / rrTotal) * 100 : 50;
  const rrRatio =
    absRisk > 0 && absReward > 0 ? (absReward / absRisk).toFixed(2) : '—';

  const placeLabel =
    effLots <= 0
      ? `${side === 'BUY' ? 'Buy' : 'Sell'} 0.00 Lots · Set Position Size`
      : `${side === 'BUY' ? 'Buy' : 'Sell'} ${effLots.toFixed(2)} Lots`;

  const stepPrice = (raw: string, dir: number) => {
    const n = Number(raw);
    const base = Number.isFinite(n) ? n : entryPx;
    const step = tickSize > 0 ? tickSize : pipSize || 0.0001;
    return round(base + dir * step, digits).toFixed(digits);
  };

  const stepSize = (dir: number) => {
    const n = Number(riskVal) || 0;
    if (sizeMode === '#') {
      setRiskVal(Math.max(0, round(n + dir * 0.01, 2)).toFixed(2));
      return;
    }
    if (sizeMode === '$') {
      setRiskVal(String(Math.max(0, Math.round(n + dir * 10))));
      return;
    }
    setRiskVal(String(Math.max(0, Math.min(100, round(n + dir * 0.25, 2)))));
  };

  const sizeMetaTop =
    sizeMode === '$'
      ? `${freeMargin > 0 ? ((Number(riskVal) / freeMargin) * 100).toFixed(2) : '0.00'}%`
      : `${effLots.toFixed(2)} lots`;
  const sizeMetaBottom =
    sizeMode === '#'
      ? `${((reqMargin / Math.max(freeMargin, 1)) * 100).toFixed(2)}% · $${fmt(reqMargin)}`
      : sizeMode === '%'
        ? `$${fmt((Number(riskVal) / 100) * freeMargin)} · ${effLots.toFixed(2)} lots`
        : `${effLots.toFixed(2)} lots`;

  const submitOrder = () => {
    if (effLots <= 0) return;
    onSubmit({
      side,
      type,
      size: Number(effLots.toFixed(3)),
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
          'fixed inset-x-0 bottom-0 z-40 w-full max-h-[min(92dvh,720px)] rounded-t-xl border-t border-[color:var(--line)]',
          'pb-[env(safe-area-inset-bottom)]',
          'sm:relative sm:inset-auto sm:z-20 sm:shrink-0 sm:w-[300px] sm:h-full sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0',
        ].join(' ')}
        role="dialog"
        aria-label="Order ticket"
      >
        <header data-win-header="">
          <div data-win-icon="">
            <ChromeIcon n="longPos" s={16} cl="var(--accent)" />
          </div>
          <span data-win-title="" style={{ flex: '0 1 auto' }}>
            Order
          </span>
          <div className="relative" data-nodrag="1">
            <button
              type="button"
              data-order-mode-chip=""
              aria-haspopup="listbox"
              aria-expanded={sizeModeOpen}
              onClick={(e) => {
                e.stopPropagation();
                setSizeModeOpen((o) => !o);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1"
            >
              {sizeMode}
              <ChromeIcon n="chevDown" s={8} />
            </button>
            {sizeModeOpen ? (
              <div
                data-sdrop="1"
                role="listbox"
                className="absolute top-full left-0 mt-1 z-50 min-w-[72px] rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] overflow-hidden"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {(['#', '$', '%'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={sizeMode === m}
                    className="w-full px-2.5 py-1.5 text-left text-[11px] font-bold"
                    style={{
                      color:
                        sizeMode === m ? 'var(--accent)' : 'var(--text-muted)',
                      background:
                        sizeMode === m
                          ? 'var(--accent-quiet)'
                          : 'transparent',
                    }}
                    onClick={() => {
                      setSizeMode(m);
                      setRiskVal(
                        m === '#' ? '0.10' : m === '$' ? '100' : '1.00',
                      );
                      setSizeModeOpen(false);
                    }}
                  >
                    {m === '#' ? '# lots' : m === '$' ? '$ risk' : '% risk'}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-brand-icon="1"
            data-nodrag="1"
            className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <ChromeIcon n="x" s={16} />
          </button>
        </header>

        <div data-order-hero="">
          <div data-order-sym="">
            <span>{displaySym}</span>
            <ChromeIcon n="chevDown" s={10} />
          </div>
          <div data-order-asset="">
            <span>Forex</span>
            <span aria-hidden style={{ opacity: 0.35 }}>
              ·
            </span>
            <span style={{ textTransform: 'capitalize' }}>
              {type.toLowerCase()}
            </span>
          </div>
          <div data-order-metrics="">
            <span>
              Spread <b>{spreadPips.toFixed(1)}</b>
            </span>
            <span>
              Comm <b>0.00</b>
            </span>
            <span>
              Margin <b>{marginLevelPct >= 999 ? '—' : `${marginLevelPct.toFixed(0)}%`}</b>
            </span>
          </div>
        </div>

        <div data-order-stack="" className="flex-1 min-h-0 overflow-y-auto tlr-scroll">
          <div data-order-block="">
            <div data-order-intent="">
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
              <div data-order-type="" role="tablist" aria-label="Order type">
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
                    role="tab"
                    aria-selected={type === id}
                    data-active={type === id ? '1' : undefined}
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
          </div>

          <div data-order-block="">
            <div data-order-block-title="">Size</div>
            <div data-order-size-row="">
              <div data-order-size-well="">
                {sizeMode === '$' ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    $
                  </span>
                ) : null}
                {sizeMode === '%' ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    %
                  </span>
                ) : null}
                {sizeMode === '#' ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 650,
                      color: 'var(--text-faint)',
                      flexShrink: 0,
                    }}
                  >
                    lots
                  </span>
                ) : null}
                <input
                  value={riskVal}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setRiskVal(v);
                  }}
                  inputMode="decimal"
                  aria-label="Position size"
                />
                <Stepper onUp={() => stepSize(1)} onDown={() => stepSize(-1)} />
              </div>
              <div
                data-order-size-meta=""
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  alignItems: 'flex-end',
                }}
              >
                <span>{sizeMetaTop}</span>
                <span style={{ color: 'var(--text-faint)' }}>
                  {sizeMetaBottom}
                </span>
              </div>
            </div>
          </div>

          <div
            data-order-block=""
            data-order-levels=""
            style={{ padding: 0, overflow: 'hidden' }}
          >
            <div data-order-block-title="">Levels</div>

            {/* ENTRY */}
            <div data-order-level="entry">
              <div data-order-level-head="">
                <span data-order-level-title="">Entry</span>
                {type === 'MARKET' ? (
                  <span data-order-level-count="">MKT</span>
                ) : null}
                <div style={{ flex: 1 }} />
                <MultiToggle
                  on={entryMulti}
                  onToggle={() => setEntryMulti((v) => !v)}
                />
              </div>
              <div style={{ padding: '6px 8px 8px 10px' }}>
                <div data-order-size-well="">
                  <input
                    value={
                      type === 'MARKET' ? entryPx.toFixed(digits) : price
                    }
                    disabled={type === 'MARKET'}
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
                  <Stepper
                    tone="var(--accent)"
                    onUp={() => {
                      if (type === 'MARKET') setType('LIMIT');
                      setPrice(stepPrice(price || entryPx.toFixed(digits), 1));
                    }}
                    onDown={() => {
                      if (type === 'MARKET') setType('LIMIT');
                      setPrice(
                        stepPrice(price || entryPx.toFixed(digits), -1),
                      );
                    }}
                  />
                </div>
                {entryMulti ? (
                  <p className="mt-1.5 text-[9px] text-[color:var(--text-faint)]">
                    Multi-entry levels — drag brackets on chart to scale in.
                  </p>
                ) : null}
              </div>
            </div>

            {/* STOP */}
            <div data-order-level="sl">
              <div data-order-level-head="">
                <LevelChk
                  checked={slOn}
                  tone="var(--down)"
                  onChange={(v) => {
                    setSlOn(v);
                    if (v && !slPlaced) setSl(entryPx.toFixed(digits));
                  }}
                />
                <span data-order-level-title="">Stop</span>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  data-order-be=""
                  data-on={autoBe ? '1' : undefined}
                  onClick={() => setAutoBe((v) => !v)}
                  className="h-5 px-1.5 rounded text-[9px] font-extrabold tracking-wide"
                  style={{
                    color: autoBe ? '#e0b040' : 'var(--text-faint)',
                    background: autoBe
                      ? 'rgba(224,176,64,0.12)'
                      : 'transparent',
                    border: `1px solid ${
                      autoBe
                        ? 'rgba(224,176,64,0.45)'
                        : 'color-mix(in oklab, var(--down) 35%, transparent)'
                    }`,
                  }}
                >
                  Auto BE
                </button>
              </div>
              {slOn ? (
                <div style={{ padding: '4px 8px 6px 10px' }}>
                  <div data-order-size-well="">
                    <input
                      value={sl}
                      onChange={(e) => {
                        setSlPlaced(true);
                        setSl(e.target.value);
                      }}
                      inputMode="decimal"
                      aria-label="Stop loss"
                      style={{ color: 'var(--down)' }}
                    />
                    <Stepper
                      tone="var(--down)"
                      onUp={() => {
                        setSlPlaced(true);
                        setSl(stepPrice(sl || entryPx.toFixed(digits), 1));
                      }}
                      onDown={() => {
                        setSlPlaced(true);
                        setSl(stepPrice(sl || entryPx.toFixed(digits), -1));
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      fontSize: 9,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <span style={{ color: 'var(--down)' }}>
                      LOSS {fmtMoney(riskAmt)}
                    </span>
                    <span style={{ color: 'var(--text-faint)' }}>
                      DIST {slDistPips.toFixed(1)} pips
                    </span>
                  </div>
                  {autoBe ? (
                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop:
                          '1px solid color-mix(in oklab, var(--down) 18%, transparent)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-[color:var(--text-muted)]">
                          Trigger
                        </span>
                        <div
                          data-order-size-well=""
                          style={{ flex: '0 0 auto', width: 64 }}
                        >
                          <input
                            value={beTriggerR}
                            onChange={(e) => {
                              if (
                                e.target.value === '' ||
                                /^\d*\.?\d*$/.test(e.target.value)
                              ) {
                                setBeTriggerR(e.target.value);
                              }
                            }}
                            inputMode="decimal"
                            aria-label="BE trigger R"
                          />
                        </div>
                        <span className="text-[10px] font-bold text-[color:var(--text-muted)]">
                          R
                        </span>
                        <span className="text-[10px] text-[color:var(--text-muted)] ml-1">
                          Offset
                        </span>
                        <div
                          data-order-size-well=""
                          style={{ flex: '0 0 auto', width: 56 }}
                        >
                          <input
                            value={beOffsetPips}
                            onChange={(e) => {
                              if (
                                e.target.value === '' ||
                                /^\d*\.?\d*$/.test(e.target.value)
                              ) {
                                setBeOffsetPips(e.target.value);
                              }
                            }}
                            inputMode="decimal"
                            aria-label="BE offset pips"
                          />
                        </div>
                        <span className="text-[10px] text-[color:var(--text-faint)]">
                          pips
                        </span>
                      </div>
                      <p className="text-[9px] text-[color:var(--text-faint)] leading-snug">
                        Moves SL to entry when trigger hits
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* TARGET */}
            <div data-order-level="tp">
              <div data-order-level-head="">
                <LevelChk
                  checked={tpOn}
                  tone="var(--up)"
                  onChange={(v) => {
                    setTpOn(v);
                    if (v && !tpPlaced) setTp(entryPx.toFixed(digits));
                  }}
                />
                <span data-order-level-title="">Target</span>
                <div style={{ flex: 1 }} />
                <MultiToggle on={tpMulti} onToggle={() => setTpMulti((v) => !v)} />
              </div>
              {tpOn ? (
                <div style={{ padding: '4px 8px 6px 10px' }}>
                  <div data-order-size-well="">
                    <input
                      value={tp}
                      onChange={(e) => {
                        setTpPlaced(true);
                        setTp(e.target.value);
                      }}
                      inputMode="decimal"
                      aria-label="Take profit"
                      style={{ color: 'var(--up)' }}
                    />
                    <Stepper
                      tone="var(--up)"
                      onUp={() => {
                        setTpPlaced(true);
                        setTp(stepPrice(tp || entryPx.toFixed(digits), 1));
                      }}
                      onDown={() => {
                        setTpPlaced(true);
                        setTp(stepPrice(tp || entryPx.toFixed(digits), -1));
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      fontSize: 9,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <span style={{ color: 'var(--up)' }}>
                      PROFIT {fmtMoney(rewardAmt)}
                    </span>
                    <span style={{ color: 'var(--text-faint)' }}>
                      DIST {tpDistPips.toFixed(1)} pips
                    </span>
                  </div>
                  {tpMulti ? (
                    <p className="mt-1.5 text-[9px] text-[color:var(--text-faint)]">
                      Multi-target — scale out across TP rungs on the chart.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* JOURNAL */}
          <div data-order-block="" data-order-journal="1">
            <button
              type="button"
              className="w-full flex items-center gap-2 text-left"
              onClick={() => setJournalOpen((v) => !v)}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: '#e0b040',
                }}
              >
                JOURNAL
              </span>
              <span className="text-[10px] text-[color:var(--text-faint)]">
                › {preTags.length} tags
              </span>
              <span className="ml-auto">
                <ChromeIcon n="chevDown" s={10} />
              </span>
            </button>
            {journalOpen ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRE_TAG_DEFS.map((t) => {
                  const on = preTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      data-trades-tag=""
                      data-kind="pre"
                      data-on={on ? '1' : undefined}
                      onClick={() =>
                        setPreTags((prev) =>
                          on ? prev.filter((x) => x !== t) : [...prev, t],
                        )
                      }
                    >
                      <span>{t}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="mt-2 min-h-[44px] rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)]"
                aria-hidden
              />
            )}
          </div>

          {msg ? (
            <p
              className="text-[12px] text-[color:var(--down)] px-1"
              role="alert"
            >
              {msg}
            </p>
          ) : null}
        </div>

        <div data-order-rr="">
          <div data-order-rr-bar="" aria-hidden>
            <span
              style={{ width: `${riskPctBar}%`, background: 'var(--down)' }}
            />
            <span
              style={{ width: `${rewardPctBar}%`, background: 'var(--up)' }}
            />
          </div>
          <div
            className="mt-1.5 grid grid-cols-3 items-center text-[10px] font-semibold tabular-nums"
          >
            <span className="text-[color:var(--down)] justify-self-start">
              Risk {fmtMoney(riskAmt)}
            </span>
            <span className="text-[color:var(--text-muted)] justify-self-center">
              1 : {rrRatio}
            </span>
            <span className="text-[color:var(--up)] justify-self-end">
              Reward {fmtMoney(rewardAmt)}
            </span>
          </div>
        </div>

        <div
          data-order-foot=""
          className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <button
            type="button"
            data-brand-btn="primary"
            data-order-submit=""
            disabled={disabled || effLots <= 0}
            className="w-full disabled:opacity-40"
            onClick={submitOrder}
            style={
              side === 'BUY'
                ? {
                    background:
                      'color-mix(in oklab, var(--up) 16%, var(--surface))',
                    color: 'var(--up)',
                    border: '1px solid color-mix(in oklab, var(--up) 55%, transparent)',
                  }
                : {
                    background:
                      'color-mix(in oklab, var(--down) 16%, var(--surface))',
                    color: 'var(--down)',
                    border:
                      '1px solid color-mix(in oklab, var(--down) 55%, transparent)',
                  }
            }
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
