import type { InstrumentSpec } from '@/orders/instrumentSpec';
import { unrealizedPnL } from '@/orders/pnl';
import type { Order, OrderEngineState, Position } from '@/orders/orderTypes';
import { isTerminal } from '@/orders/orderTypes';
import type { BottomTabId } from '@/types/ui';

interface TradeDockProps {
  activeTab: BottomTabId;
  state: OrderEngineState | null;
  spec: InstrumentSpec | null;
  bid: number;
  ask: number;
  onCancel: (orderId: string) => void;
  onSelectPosition?: (positionId: string) => void;
  onClosePosition?: (positionId: string) => void;
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function fmtSym(raw: string): string {
  if (raw.includes('/')) return raw;
  if (raw.length >= 6) return `${raw.slice(0, 3)}/${raw.slice(3, 6)}`;
  return raw;
}

function fmtTime(unixSec: number | undefined): string {
  if (unixSec == null || !(unixSec > 0)) return '—';
  const d = new Date(unixSec * 1000);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} ${hh}:${mm}`;
}

function shortId(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return id.slice(0, 6);
}

/** Unrealized P&L in account currency (same math as equity / bottom-bar P&L). */
function unrealizedAccount(
  pos: Position,
  bid: number,
  ask: number,
  spec: InstrumentSpec | null,
  accountCurrency: string,
): number {
  if (!spec || bid <= 0) return 0;
  return unrealizedPnL(pos.side, pos.entryPrice, bid, ask, pos.size, spec, {
    accountCurrency,
    instrumentPrice: bid,
  }).amount;
}

const TRADES_COLS = [
  'minmax(48px,0.55fr)', // ID
  'minmax(72px,1.15fr)', // SYMBOL
  'minmax(88px,1.15fr)', // TIME
  'minmax(44px,0.5fr)', // SIDE
  'minmax(54px,0.6fr)', // STATUS
  'minmax(40px,0.5fr)', // SIZE
  'minmax(48px,0.55fr)', // TYPE
  'minmax(62px,0.75fr)', // ENTRY
  'minmax(62px,0.75fr)', // EXIT
  'minmax(62px,0.85fr)', // P&L
  'minmax(58px,0.7fr)', // ACTION
].join(' ');

const HDRS: { label: string; col: string }[] = [
  { label: 'ID', col: 'id' },
  { label: 'Symbol', col: 'sym' },
  { label: 'Time', col: 'time' },
  { label: 'Side', col: 'side' },
  { label: 'Status', col: 'status' },
  { label: 'Size', col: 'num' },
  { label: 'Type', col: 'type' },
  { label: 'Entry', col: 'num' },
  { label: 'Exit', col: 'num' },
  { label: 'P&L', col: 'pnl' },
  { label: 'Action', col: 'action' },
];

/**
 * V9 Obsidian bottom trade list — data-trades-v2 grammar, our order engine.
 */
export function TradeDock({
  activeTab,
  state,
  spec,
  bid,
  ask,
  onCancel,
  onSelectPosition,
  onClosePosition,
}: TradeDockProps) {
  if (activeTab === 'analytics') return null;

  const digits = spec?.digits ?? 5;
  const working: Order[] = state
    ? state.workingIds.map((id) => state.orders[id]!).filter(Boolean)
    : [];
  const pending = working.filter((o) => !o.role);
  const positions: Position[] = state ? Object.values(state.positions) : [];
  const history: Order[] = state
    ? Object.values(state.orders)
        .filter((o) => isTerminal(o.status) && o.status === 'FILLED' && !o.role)
        .sort((a, b) => (b.filledAt ?? 0) - (a.filledAt ?? 0))
        .slice(0, 40)
    : [];

  const showOpen = activeTab === 'all' || activeTab === 'open';
  const showPending = activeTab === 'all' || activeTab === 'pending';
  const showHistory = activeTab === 'all' || activeTab === 'history';

  const empty =
    (!showOpen || positions.length === 0) &&
    (!showPending || pending.length === 0) &&
    (!showHistory || history.length === 0);

  return (
    <div
      data-trades-dock="1"
      data-tc-body=""
      className="flex-1 min-h-0 flex flex-col tlr-scroll"
    >
      <div data-trades-table="" className="flex-1 min-h-0 overflow-auto">
        <div data-trades-hdr="" style={{ gridTemplateColumns: TRADES_COLS }}>
          {HDRS.map((h) => (
            <button type="button" key={h.label} data-col={h.col} disabled>
              <span>{h.label}</span>
            </button>
          ))}
        </div>

        {empty ? (
          <div data-trades-empty="">
            <strong>No trades here</strong>
            <em>
              {activeTab === 'pending'
                ? 'No pending orders.'
                : activeTab === 'open'
                  ? 'No open positions.'
                  : activeTab === 'history'
                    ? 'No closed trades yet.'
                    : 'Use + Place Order — SL/TP lines appear on the chart.'}
            </em>
          </div>
        ) : (
          <>
            {showOpen &&
              positions.map((p) => {
                const upnl = unrealizedAccount(
                  p,
                  bid,
                  ask,
                  spec,
                  state?.account.currency ?? 'USD',
                );
                const sideLabel = p.side === 'BUY' ? 'LONG' : 'SHORT';
                return (
                  <div
                    key={p.id}
                    data-trades-row=""
                    data-tc-status="open"
                    data-selected={undefined}
                    style={{ gridTemplateColumns: TRADES_COLS }}
                    onClick={() => onSelectPosition?.(p.id)}
                  >
                    <div data-col="id">
                      <button type="button" data-trades-id="" data-live="1">
                        {shortId(p.id)}
                      </button>
                    </div>
                    <div data-col="sym" data-cell="sym">
                      {fmtSym(p.symbol)}
                    </div>
                    <div data-col="time" data-cell="time">
                      {fmtTime(p.openedAt)}
                    </div>
                    <div data-col="side">
                      <span data-trade-side={sideLabel}>{sideLabel === 'LONG' ? 'Long' : 'Short'}</span>
                    </div>
                    <div data-col="status">
                      <span data-trade-status="open">Open</span>
                    </div>
                    <div data-col="num" data-cell="num">
                      {p.size}
                    </div>
                    <div data-col="type" data-cell="muted">
                      Market
                    </div>
                    <div data-col="num" data-cell="num">
                      {fmt(p.entryPrice, digits)}
                    </div>
                    <div data-col="num" data-cell="muted" data-empty="1">
                      —
                    </div>
                    <div
                      data-col="pnl"
                      data-cell="pnl"
                      style={{
                        color: upnl >= 0 ? 'var(--up)' : 'var(--down)',
                      }}
                    >
                      {upnl >= 0 ? '+' : ''}
                      {fmt(upnl)}
                    </div>
                    <div data-col="action" data-cell="action">
                      {onClosePosition ? (
                        <button
                          type="button"
                          data-trades-act="close"
                          className="min-h-11 sm:min-h-[22px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClosePosition(p.id);
                          }}
                        >
                          Close
                        </button>
                      ) : (
                        <em>—</em>
                      )}
                    </div>
                  </div>
                );
              })}

            {showPending &&
              pending.map((o) => {
                const sideLabel = o.side === 'BUY' ? 'LONG' : 'SHORT';
                return (
                  <div
                    key={o.id}
                    data-trades-row=""
                    data-tc-status="pending"
                    style={{ gridTemplateColumns: TRADES_COLS }}
                  >
                    <div data-col="id">
                      <button type="button" data-trades-id="">
                        {shortId(o.id)}
                      </button>
                    </div>
                    <div data-col="sym" data-cell="sym">
                      {fmtSym(o.symbol)}
                    </div>
                    <div data-col="time" data-cell="time">
                      {fmtTime(o.createdAt)}
                    </div>
                    <div data-col="side">
                      <span data-trade-side={sideLabel}>
                        {sideLabel === 'LONG' ? 'Long' : 'Short'}
                      </span>
                    </div>
                    <div data-col="status">
                      <span data-trade-status="pending">Pending</span>
                    </div>
                    <div data-col="num" data-cell="num">
                      {o.size}
                    </div>
                    <div data-col="type" data-cell="muted">
                      {o.type}
                    </div>
                    <div data-col="num" data-cell="num">
                      {o.price != null ? fmt(o.price, digits) : 'MKT'}
                    </div>
                    <div data-col="num" data-cell="muted" data-empty="1">
                      —
                    </div>
                    <div data-col="pnl" data-cell="muted" data-empty="1">
                      —
                    </div>
                    <div data-col="action" data-cell="action">
                      <button
                        type="button"
                        data-trades-act="cancel"
                        className="min-h-11 sm:min-h-[22px]"
                        onClick={() => onCancel(o.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}

            {showHistory &&
              history.map((o) => {
                const sideLabel = o.side === 'BUY' ? 'LONG' : 'SHORT';
                return (
                  <div
                    key={`${o.id}-${o.filledAt}`}
                    data-trades-row=""
                    data-tc-status="closed"
                    style={{ gridTemplateColumns: TRADES_COLS }}
                  >
                    <div data-col="id">
                      <button type="button" data-trades-id="">
                        {shortId(o.id)}
                      </button>
                    </div>
                    <div data-col="sym" data-cell="sym">
                      {fmtSym(o.symbol)}
                    </div>
                    <div data-col="time" data-cell="time">
                      {fmtTime(o.filledAt ?? o.createdAt)}
                    </div>
                    <div data-col="side">
                      <span data-trade-side={sideLabel}>
                        {sideLabel === 'LONG' ? 'Long' : 'Short'}
                      </span>
                    </div>
                    <div data-col="status">
                      <span data-trade-status="closed">Closed</span>
                    </div>
                    <div data-col="num" data-cell="num">
                      {o.size}
                    </div>
                    <div data-col="type" data-cell="muted">
                      {o.type}
                    </div>
                    <div data-col="num" data-cell="num">
                      {fmt(o.fillPrice ?? o.price ?? 0, digits)}
                    </div>
                    <div data-col="num" data-cell="num">
                      {fmt(o.fillPrice ?? 0, digits)}
                    </div>
                    <div data-col="pnl" data-cell="muted">
                      {o.ambiguousFill ? 'ambig.' : 'filled'}
                    </div>
                    <div data-col="action" data-cell="action">
                      <em>—</em>
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}

export function tradeDockCounts(state: OrderEngineState | null): {
  open: number;
  pending: number;
  history: number;
} {
  if (!state) return { open: 0, pending: 0, history: 0 };
  const pending = state.workingIds.filter((id) => {
    const o = state.orders[id];
    return o && !o.role;
  }).length;
  const history = Object.values(state.orders).filter(
    (o) => isTerminal(o.status) && o.status === 'FILLED' && !o.role,
  ).length;
  return {
    open: Object.keys(state.positions).length,
    pending,
    history,
  };
}
