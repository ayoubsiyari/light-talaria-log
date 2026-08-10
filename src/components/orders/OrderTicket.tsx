import { useEffect, useMemo, useState } from 'react';
import { inferPendingType } from '@/orders/inferPendingType';
import {
  defaultSpecForSymbol,
  distanceUnitLabel,
  quantityUnitLabel,
} from '@/orders/instrumentSpec';
import { unrealizedPnL } from '@/orders/pnl';
import type { OrderSide, OrderType, TimeInForce } from '@/orders/orderTypes';
import { classifySymbolAsset } from '@/symbols/symbolCategory';
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
  const assetClassUi = classifySymbolAsset(symbol);
  const isFutures = assetClassUi === 'Futures';
  const [price, setPrice] = useState('');
  // Off until the user checks Stop/Target (or drags a level) — do not paint
  // auto SL/TP on the chart just because Place Order opened.
  const [tpOn, setTpOn] = useState(false);
  const [slOn, setSlOn] = useState(false);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [tif] = useState<TimeInForce>('GTC');
  const [tpPips, setTpPips] = useState(40);
  const [slPips, setSlPips] = useState(20);
  const [slPlaced, setSlPlaced] = useState(false);
  const [tpPlaced, setTpPlaced] = useState(false);
  const [entryMulti, setEntryMulti] = useState(false);
  const [tpMulti, setTpMulti] = useState(false);
  const [entryRows, setEntryRows] = useState<string[]>(['', '']);
  const [tpRows, setTpRows] = useState<{ price: string; qty: string }[]>([
    { price: '', qty: '50' },
    { price: '', qty: '50' },
  ]);
  const [autoBe, setAutoBe] = useState(false);
  const [stopMode, setStopMode] = useState<'off' | 'be' | 'tsl'>('off');
  const [stopMenuOpen, setStopMenuOpen] = useState(false);
  const [tslDist, setTslDist] = useState('10');
  const [beTriggerR, setBeTriggerR] = useState('1.5');
  const [beOffsetPips, setBeOffsetPips] = useState('0');
  const [journalOpen, setJournalOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [shots, setShots] = useState<string[]>([]);
  const [advOn, setAdvOn] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
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
  const qtyLabel = quantityUnitLabel(specLike);
  const qtyLabelLower = qtyLabel.toLowerCase();
  const distLabel = distanceUnitLabel(specLike);

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

  const reseedLevels = (
    px: number,
    which: 'both' | 'sl' | 'tp' = 'both',
  ) => {
    if (!(px > 0) || !(pipSize > 0)) return;
    const slOff = slPips * pipSize;
    const tpOff = tpPips * pipSize;
    if (which === 'both' || which === 'sl') {
      const slPx = side === 'BUY' ? px - slOff : px + slOff;
      setSl(slPx.toFixed(digits));
    }
    if (which === 'both' || which === 'tp') {
      const tpPx = side === 'BUY' ? px + tpOff : px - tpOff;
      setTp(tpPx.toFixed(digits));
    }
  };

  // Open / side flip — seed MARKET entry in *this* symbol's price space.
  // SL/TP stay off until the user enables them (check) or drags a level.
  useEffect(() => {
    if (!open) return;
    const seed = lastPx.toFixed(digits);
    setType('MARKET');
    setPrice(seed);
    reseedLevels(lastPx);
    setSlOn(false);
    setTpOn(false);
    setSlPlaced(false);
    setTpPlaced(false);
    setSizeMode('#');
    setRiskVal(isFutures ? '1' : '0.10');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side]);

  // Active pane / symbol change — reset size unit defaults (lots vs contracts).
  useEffect(() => {
    if (!open || !(lastPx > 0)) return;
    setType('MARKET');
    setPrice(lastPx.toFixed(digits));
    reseedLevels(lastPx);
    setSlOn(false);
    setTpOn(false);
    setSlPlaced(false);
    setTpPlaced(false);
    setSizeMode('#');
    setRiskVal(isFutures ? '1' : '0.10');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (!open || type !== 'MARKET') return;
    const seed = lastPx.toFixed(digits);
    setPrice(seed);
    // Only track pip distance for levels the user has enabled.
    if (slOn && !slPlaced) reseedLevels(lastPx, 'sl');
    if (tpOn && !tpPlaced) reseedLevels(lastPx, 'tp');
  }, [
    open,
    type,
    lastPx,
    digits,
    slOn,
    tpOn,
    slPlaced,
    tpPlaced,
    side,
    slPips,
    tpPips,
    pipSize,
  ]);

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
    // Entry always while ticket open; SL/TP only when the user turned them on
    // (checkbox or chart drag) — never auto-bracket on Place Order.
    onDraftChange?.({
      side,
      type,
      entry: entryPx,
      stopLoss: slOn && Number.isFinite(slPxLive) ? slPxLive : null,
      takeProfit: tpOn && Number.isFinite(tpPxLive) ? tpPxLive : null,
      size: lots > 0 ? lots : isFutures ? 1 : 0.1,
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
    slPxLive,
    tpPxLive,
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

  const sizeDigits = isFutures ? 0 : 2;
  const sizeFmt = (n: number) => n.toFixed(sizeDigits);
  const placeLabel =
    effLots <= 0
      ? `${side === 'BUY' ? 'Buy' : 'Sell'} ${sizeFmt(0)} ${qtyLabel} · Set Position Size`
      : `${side === 'BUY' ? 'Buy' : 'Sell'} ${sizeFmt(effLots)} ${quantityUnitLabel(specLike, effLots)}`;

  const stepPrice = (raw: string, dir: number) => {
    const n = Number(raw);
    const base = Number.isFinite(n) ? n : entryPx;
    const step = tickSize > 0 ? tickSize : pipSize || 0.0001;
    return round(base + dir * step, digits).toFixed(digits);
  };

  const stepSize = (dir: number) => {
    const n = Number(riskVal) || 0;
    if (sizeMode === '#') {
      const step = isFutures ? 1 : 0.01;
      const next = Math.max(0, round(n + dir * step, isFutures ? 0 : 2));
      setRiskVal(isFutures ? String(next) : next.toFixed(2));
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
      : `${sizeFmt(effLots)} ${qtyLabelLower}`;
  const sizeMetaBottom =
    sizeMode === '#'
      ? `${((reqMargin / Math.max(freeMargin, 1)) * 100).toFixed(2)}% · $${fmt(reqMargin)}`
      : sizeMode === '%'
        ? `$${fmt((Number(riskVal) / 100) * freeMargin)} · ${sizeFmt(effLots)} ${qtyLabelLower}`
        : `${sizeFmt(effLots)} ${qtyLabelLower}`;

  const submitOrder = () => {
    if (effLots <= 0) return;
    onSubmit({
      side,
      type,
      size: Number(effLots.toFixed(isFutures ? 0 : 3)),
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
          <button
            type="button"
            data-order-adv=""
            data-on={advOn ? '1' : undefined}
            data-nodrag="1"
            className="min-h-11 sm:min-h-7 px-2 rounded text-[10px] font-extrabold"
            style={{
              color: advOn ? 'var(--accent)' : 'var(--text-faint)',
              background: advOn ? 'var(--accent-quiet)' : 'transparent',
              border: `1px solid ${advOn ? 'var(--accent)' : 'var(--line)'}`,
            }}
            onClick={() => setAdvOn((v) => !v)}
          >
            Adv
          </button>
          <div className="relative" data-nodrag="1">
            <button
              type="button"
              data-order-mode-chip=""
              aria-haspopup="listbox"
              aria-expanded={sizeModeOpen}
              onClick={(e) => {
                e.stopPropagation();
                setSizeModeOpen((o) => !o);
                setTemplatesOpen(false);
                setHeaderMenuOpen(false);
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
                    className="w-full px-2.5 py-1.5 text-left text-[11px] font-bold min-h-11 sm:min-h-8"
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
                    {m === '#'
                      ? `# ${qtyLabelLower}`
                      : m === '$'
                        ? '$ risk'
                        : '% risk'}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1 }} />
          <div className="relative" data-nodrag="1">
            <button
              type="button"
              data-brand-icon="1"
              className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
              aria-label="Templates"
              title="Order templates"
              onClick={() => {
                setTemplatesOpen((o) => !o);
                setHeaderMenuOpen(false);
                setSizeModeOpen(false);
              }}
            >
              <ChromeIcon n="layout" s={14} />
            </button>
            {templatesOpen ? (
              <div
                data-sdrop="1"
                className="absolute top-full right-0 mt-1 z-50 w-40 rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] py-1 overflow-hidden"
              >
                {['Scalp 1:2', 'Swing default', 'Breakout'].map((name) => (
                  <button
                    key={name}
                    type="button"
                    data-menu-row=""
                    className="w-full px-2.5 min-h-11 sm:min-h-8 text-left text-[12px]"
                    onClick={() => setTemplatesOpen(false)}
                  >
                    {name}
                  </button>
                ))}
                <p className="px-2.5 py-1 text-[9px] text-[color:var(--text-faint)]">
                  Stub — not saved yet
                </p>
              </div>
            ) : null}
          </div>
          <div className="relative" data-nodrag="1">
            <button
              type="button"
              data-brand-icon="1"
              className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
              aria-label="Order menu"
              onClick={() => {
                setHeaderMenuOpen((o) => !o);
                setTemplatesOpen(false);
                setSizeModeOpen(false);
              }}
            >
              <ChromeIcon n="settings" s={14} />
            </button>
            {headerMenuOpen ? (
              <div
                data-sdrop="1"
                className="absolute top-full right-0 mt-1 z-50 w-40 rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] py-1"
              >
                <button
                  type="button"
                  data-menu-row=""
                  className="w-full px-2.5 min-h-11 sm:min-h-8 text-left text-[12px]"
                  onClick={() => setHeaderMenuOpen(false)}
                >
                  Detach (stub)
                </button>
                <button
                  type="button"
                  data-menu-row=""
                  className="w-full px-2.5 min-h-11 sm:min-h-8 text-left text-[12px]"
                  onClick={() => setHeaderMenuOpen(false)}
                >
                  Float (stub)
                </button>
              </div>
            ) : null}
          </div>
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
            <span>{assetClassUi}</span>
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
                    {qtyLabelLower}
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
                  <div data-order-multi-rows="" className="mt-2 space-y-1.5">
                    {entryRows.map((row, i) => (
                      <div key={i} data-order-size-well="" className="gap-1">
                        <span className="text-[9px] text-[color:var(--text-faint)] w-4">
                          {i + 1}
                        </span>
                        <input
                          value={row || (i === 0 ? (type === 'MARKET' ? entryPx.toFixed(digits) : price) : '')}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEntryRows((prev) =>
                              prev.map((x, j) => (j === i ? v : x)),
                            );
                          }}
                          inputMode="decimal"
                          aria-label={`Entry ${i + 1}`}
                        />
                        <button
                          type="button"
                          className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7 text-[color:var(--text-faint)]"
                          aria-label="Remove entry row"
                          disabled={entryRows.length <= 1}
                          onClick={() =>
                            setEntryRows((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          <ChromeIcon n="x" s={10} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        className="min-h-11 sm:min-h-7 px-2 text-[10px] font-bold rounded border border-[color:var(--line)]"
                        onClick={() => setEntryRows((p) => [...p, ''])}
                      >
                        + Add
                      </button>
                      <button
                        type="button"
                        className="min-h-11 sm:min-h-7 px-2 text-[10px] font-bold rounded border border-[color:var(--line)]"
                        onClick={() => {
                          const base = entryPx;
                          setEntryRows((p) =>
                            p.map((_, i) =>
                              (base + (i - (p.length - 1) / 2) * tickSize * 10).toFixed(
                                digits,
                              ),
                            ),
                          );
                        }}
                      >
                        Equalize
                      </button>
                      <button
                        type="button"
                        className="min-h-11 sm:min-h-7 px-2 text-[10px] font-bold rounded border border-[color:var(--line)]"
                        onClick={() => setEntryRows([''])}
                      >
                        Clear
                      </button>
                    </div>
                    <p className="text-[9px] text-[color:var(--text-faint)]">
                      Avg{' '}
                      {(() => {
                        const nums = entryRows
                          .map((r) => Number(r))
                          .filter((n) => Number.isFinite(n) && n > 0);
                        if (nums.length === 0) return '—';
                        return (
                          nums.reduce((a, b) => a + b, 0) / nums.length
                        ).toFixed(digits);
                      })()}{' '}
                      · stub until scale-in wiring
                    </p>
                  </div>
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
                    if (v) {
                      // Seed at pip distance (not entry) so the line is
                      // visible + draggable like TradingView.
                      reseedLevels(entryPx > 0 ? entryPx : lastPx, 'sl');
                      setSlPlaced(true);
                    }
                  }}
                />
                <span data-order-level-title="">Stop</span>
                <div style={{ flex: 1 }} />
                <div className="relative">
                  <button
                    type="button"
                    data-order-be=""
                    data-on={stopMode !== 'off' ? '1' : undefined}
                    onClick={() => setStopMenuOpen((o) => !o)}
                    className="h-5 px-1.5 rounded text-[9px] font-extrabold tracking-wide inline-flex items-center gap-0.5"
                    style={{
                      color:
                        stopMode !== 'off' ? '#e0b040' : 'var(--text-faint)',
                      background:
                        stopMode !== 'off'
                          ? 'rgba(224,176,64,0.12)'
                          : 'transparent',
                      border: `1px solid ${
                        stopMode !== 'off'
                          ? 'rgba(224,176,64,0.45)'
                          : 'color-mix(in oklab, var(--down) 35%, transparent)'
                      }`,
                    }}
                  >
                    {stopMode === 'tsl' ? 'TSL' : 'Auto BE'}
                    <ChromeIcon n="chevDown" s={8} />
                  </button>
                  {stopMenuOpen ? (
                    <div
                      data-sdrop="1"
                      className="absolute top-full right-0 mt-1 z-40 w-28 rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] py-1"
                    >
                      <button
                        type="button"
                        className="w-full px-2 min-h-11 sm:min-h-8 text-left text-[11px] font-bold"
                        onClick={() => {
                          setAutoBe(true);
                          setStopMode('be');
                          setStopMenuOpen(false);
                        }}
                      >
                        Auto BE
                      </button>
                      <button
                        type="button"
                        className="w-full px-2 min-h-11 sm:min-h-8 text-left text-[11px] font-bold"
                        onClick={() => {
                          setAutoBe(false);
                          setStopMode('tsl');
                          setStopMenuOpen(false);
                        }}
                      >
                        Trailing SL
                      </button>
                      <button
                        type="button"
                        className="w-full px-2 min-h-11 sm:min-h-8 text-left text-[11px]"
                        onClick={() => {
                          setAutoBe(false);
                          setStopMode('off');
                          setStopMenuOpen(false);
                        }}
                      >
                        Off
                      </button>
                    </div>
                  ) : null}
                </div>
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
                      DIST {slDistPips.toFixed(1)} {distLabel}
                    </span>
                  </div>
                  {stopMode === 'be' || autoBe ? (
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
                        Moves SL to entry when trigger hits (stub)
                      </p>
                    </div>
                  ) : null}
                  {stopMode === 'tsl' ? (
                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop:
                          '1px solid color-mix(in oklab, var(--down) 18%, transparent)',
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-[color:var(--text-muted)]">
                          Trail
                        </span>
                        <div
                          data-order-size-well=""
                          style={{ flex: '0 0 auto', width: 64 }}
                        >
                          <input
                            value={tslDist}
                            onChange={(e) => {
                              if (
                                e.target.value === '' ||
                                /^\d*\.?\d*$/.test(e.target.value)
                              ) {
                                setTslDist(e.target.value);
                              }
                            }}
                            inputMode="decimal"
                            aria-label="Trailing distance pips"
                          />
                        </div>
                        <span className="text-[10px] text-[color:var(--text-faint)]">
                          pips
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] text-[color:var(--text-faint)]">
                        Trailing stop — stub until engine support
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
                    if (v) {
                      reseedLevels(entryPx > 0 ? entryPx : lastPx, 'tp');
                      setTpPlaced(true);
                    }
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
                      DIST {tpDistPips.toFixed(1)} {distLabel}
                    </span>
                  </div>
                  {tpMulti ? (
                    <div data-order-multi-rows="" className="mt-2 space-y-1.5">
                      {tpRows.map((row, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div data-order-size-well="" className="flex-1">
                            <span className="text-[9px] text-[color:var(--text-faint)]">
                              TP{i + 1}
                            </span>
                            <input
                              value={row.price}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTpRows((prev) =>
                                  prev.map((x, j) =>
                                    j === i ? { ...x, price: v } : x,
                                  ),
                                );
                              }}
                              inputMode="decimal"
                              aria-label={`Target ${i + 1}`}
                              style={{ color: 'var(--up)' }}
                            />
                          </div>
                          <div data-order-size-well="" style={{ width: 56 }}>
                            <input
                              value={row.qty}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || /^\d*\.?\d*$/.test(v)) {
                                  setTpRows((prev) =>
                                    prev.map((x, j) =>
                                      j === i ? { ...x, qty: v } : x,
                                    ),
                                  );
                                }
                              }}
                              inputMode="decimal"
                              aria-label={`TP${i + 1} qty %`}
                            />
                          </div>
                          <span className="text-[9px] text-[color:var(--text-faint)]">
                            %
                          </span>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="min-h-11 sm:min-h-7 px-2 text-[10px] font-bold rounded border border-[color:var(--line)]"
                        onClick={() =>
                          setTpRows((p) => [...p, { price: '', qty: '0' }])
                        }
                      >
                        + Target
                      </button>
                      <p className="text-[9px] text-[color:var(--text-faint)]">
                        Multi-target stub — scale-out not wired
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* PRE-TRADE TAGS */}
          <div data-order-block="" data-order-journal="1">
            <button
              type="button"
              className="w-full flex items-center gap-2 text-left min-h-11"
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
                PRE-TRADE TAGS
              </span>
              <span className="text-[10px] text-[color:var(--text-faint)]">
                › {preTags.length}
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
                      className="min-h-11 sm:min-h-8"
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
            ) : null}
          </div>

          {/* SCREENSHOTS */}
          <div data-order-block="" data-order-shots="">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                }}
              >
                SCREENSHOTS
              </span>
              <span className="text-[10px] text-[color:var(--text-faint)]">
                {shots.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {shots.map((s, i) => (
                <div
                  key={s}
                  className="relative h-14 w-14 rounded-md border border-[color:var(--line)] overflow-hidden bg-[color:var(--surface-sunken)]"
                >
                  <img src={s} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-0 right-0 min-h-8 min-w-8 flex items-center justify-center bg-black/50 text-white"
                    aria-label="Remove screenshot"
                    onClick={() =>
                      setShots((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <ChromeIcon n="x" s={10} />
                  </button>
                </div>
              ))}
              <label className="h-14 w-14 min-h-11 min-w-11 rounded-md border border-dashed border-[color:var(--line)] inline-flex items-center justify-center cursor-pointer text-[color:var(--text-muted)]">
                <ChromeIcon n="plus" s={16} />
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = URL.createObjectURL(f);
                    setShots((prev) => [...prev, url]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {/* NOTES */}
          <div data-order-block="" data-order-notes="">
            <button
              type="button"
              className="w-full flex items-center gap-2 text-left min-h-11"
              onClick={() => setNotesOpen((v) => !v)}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                }}
              >
                NOTES
              </span>
              <span className="ml-auto">
                <ChromeIcon n="chevDown" s={10} />
              </span>
            </button>
            {notesOpen ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Pre-trade notes (local stub)"
                className="mt-1.5 w-full min-h-[88px] rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 py-1.5 text-[12px] text-[color:var(--text)] outline-none resize-y"
              />
            ) : null}
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
