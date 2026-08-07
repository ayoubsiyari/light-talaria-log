import { Button } from '@heroui/react';
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

/**
 * V9 Obsidian bottom trade list — shown under the chrome tabs.
 * Compact rows driven by our order engine (not window.chart.orderManager).
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
      data-v9-chrome="1"
      data-trades-dock="1"
      data-tc-body=""
      className="shrink-0 border-t border-[color:var(--line)] bg-[color:var(--surface)] max-h-[28vh] sm:max-h-[22vh] overflow-y-auto"
    >
      {state && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[11px] font-mono tabular-nums border-b border-[color:var(--line)]">
          <span>
            <span className="text-muted mr-1">Balance</span>
            {fmt(state.account.balance)}
          </span>
          <span>
            <span className="text-muted mr-1">Equity</span>
            {fmt(state.account.equity)}
          </span>
          <span>
            <span className="text-muted mr-1">Free</span>
            {fmt(state.account.freeMargin)}
          </span>
          <span>
            <span className="text-muted mr-1">Margin</span>
            {state.account.usedMargin > 0
              ? `${fmt(state.account.marginLevel, 0)}%`
              : '—'}
          </span>
        </div>
      )}

      {empty ? (
        <p className="px-3 py-3 text-[12px] text-muted">
          No {activeTab === 'pending' ? 'pending orders' : activeTab === 'open' ? 'open positions' : 'trades'} yet.
          Use <span className="text-foreground">+ Place Order</span> — SL/TP lines appear on the chart.
        </p>
      ) : (
        <table className="w-full text-[12px] text-left">
          <thead className="sticky top-0 bg-[color:var(--surface)] text-[10px] uppercase tracking-wide text-muted z-[1]">
            <tr className="border-b border-[color:var(--line)]">
              <th className="px-3 py-1.5 font-medium">Symbol</th>
              <th className="px-2 py-1.5 font-medium">Side</th>
              <th className="px-2 py-1.5 font-medium">Qty</th>
              <th className="px-2 py-1.5 font-medium">Price</th>
              <th className="px-2 py-1.5 font-medium hidden sm:table-cell">SL</th>
              <th className="px-2 py-1.5 font-medium hidden sm:table-cell">TP</th>
              <th className="px-2 py-1.5 font-medium">P&L</th>
              <th className="px-2 py-1.5 font-medium w-20" />
            </tr>
          </thead>
          <tbody>
            {showOpen &&
              positions.map((p) => {
                const sl = working.find(
                  (o) => o.positionId === p.id && o.role === 'stopLoss',
                );
                const tp = working.find(
                  (o) => o.positionId === p.id && o.role === 'takeProfit',
                );
                const upnl = unrealizedAccount(
                  p,
                  bid,
                  ask,
                  spec,
                  state?.account.currency ?? 'USD',
                );
                return (
                  <tr
                    key={p.id}
                    data-tc-status="open"
                    className="border-b border-[color:var(--line)] hover:bg-[color:var(--surface-raised)] cursor-pointer min-h-11"
                    onClick={() => onSelectPosition?.(p.id)}
                  >
                    <td className="px-3 py-2 font-mono">{p.symbol}</td>
                    <td
                      data-tc-side={p.side === 'BUY' ? 'long' : 'short'}
                      className={[
                        'px-2 py-2 font-medium',
                        p.side === 'BUY'
                          ? 'text-[color:var(--up)]'
                          : 'text-[color:var(--down)]',
                      ].join(' ')}
                    >
                      {p.side}
                    </td>
                    <td className="px-2 py-2 font-mono tabular-nums">{p.size}</td>
                    <td className="px-2 py-2 font-mono tabular-nums">
                      {fmt(p.entryPrice, digits)}
                    </td>
                    <td className="px-2 py-2 font-mono tabular-nums hidden sm:table-cell text-[color:var(--down)]">
                      {sl?.price != null ? fmt(sl.price, digits) : '—'}
                    </td>
                    <td className="px-2 py-2 font-mono tabular-nums hidden sm:table-cell text-[color:var(--up)]">
                      {tp?.price != null ? fmt(tp.price, digits) : '—'}
                    </td>
                    <td
                      className={[
                        'px-2 py-2 font-mono tabular-nums',
                        upnl >= 0
                          ? 'text-[color:var(--up)]'
                          : 'text-[color:var(--down)]',
                      ].join(' ')}
                    >
                      {fmt(upnl)}
                    </td>
                    <td className="px-2 py-1.5">
                      {onClosePosition && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11 sm:min-h-7 h-7 px-2"
                          data-brand-btn="ghost"
                          onPress={() => onClosePosition(p.id)}
                        >
                          Close
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}

            {showPending &&
              pending.map((o) => (
                <tr
                  key={o.id}
                  data-tc-status="pending"
                  className="border-b border-[color:var(--line)] hover:bg-[color:var(--surface-raised)]"
                >
                  <td className="px-3 py-2 font-mono">{o.symbol}</td>
                  <td
                    data-tc-side={o.side === 'BUY' ? 'long' : 'short'}
                    className={[
                      'px-2 py-2 font-medium',
                      o.side === 'BUY'
                        ? 'text-[color:var(--up)]'
                        : 'text-[color:var(--down)]',
                    ].join(' ')}
                  >
                    {o.side} {o.type}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums">{o.size}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">
                    {o.price != null ? fmt(o.price, digits) : 'MKT'}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums hidden sm:table-cell text-[color:var(--down)]">
                    {o.stopLoss != null ? fmt(o.stopLoss, digits) : '—'}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums hidden sm:table-cell text-[color:var(--up)]">
                    {o.takeProfit != null ? fmt(o.takeProfit, digits) : '—'}
                  </td>
                  <td className="px-2 py-2 text-muted">—</td>
                  <td className="px-2 py-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-11 sm:min-h-7 h-7 px-2"
                      data-brand-btn="ghost"
                      onPress={() => onCancel(o.id)}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}

            {showHistory &&
              history.map((o) => (
                <tr
                  key={`${o.id}-${o.filledAt}`}
                  data-tc-status="closed"
                  className="border-b border-[color:var(--line)] text-muted"
                >
                  <td className="px-3 py-2 font-mono">{o.symbol}</td>
                  <td className="px-2 py-2">{o.side}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{o.size}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">
                    {fmt(o.fillPrice ?? 0, digits)}
                  </td>
                  <td className="px-2 py-2 hidden sm:table-cell">—</td>
                  <td className="px-2 py-2 hidden sm:table-cell">—</td>
                  <td className="px-2 py-2 font-mono">
                    {o.ambiguousFill ? 'ambig.' : 'filled'}
                  </td>
                  <td />
                </tr>
              ))}
          </tbody>
        </table>
      )}
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
