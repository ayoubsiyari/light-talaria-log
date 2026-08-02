import { Button } from '@heroui/react';
import { rMultiple } from '@/orders/pnl';
import type { InstrumentSpec } from '@/orders/instrumentSpec';
import type { Order, OrderEngineState, Position } from '@/orders/orderTypes';
import { isTerminal } from '@/orders/orderTypes';
import { OrderTicket, type OrderTicketSubmit } from './OrderTicket';

interface OrderPanelProps {
  state: OrderEngineState | null;
  spec: InstrumentSpec | null;
  bid: number;
  ask: number;
  lastReject?: string | null;
  disabled?: boolean;
  onSubmit: (order: OrderTicketSubmit) => void;
  onCancel: (orderId: string) => void;
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

export function OrderPanel({
  state,
  spec,
  bid,
  ask,
  lastReject,
  disabled,
  onSubmit,
  onCancel,
}: OrderPanelProps) {
  const working: Order[] = state
    ? state.workingIds.map((id) => state.orders[id]!).filter(Boolean)
    : [];
  const positions: Position[] = state ? Object.values(state.positions) : [];
  const history: Order[] = state
    ? Object.values(state.orders).filter((o) => isTerminal(o.status) && o.status === 'FILLED')
    : [];

  return (
    <div className="flex flex-col max-h-[40vh] sm:max-h-none border-t border-border bg-surface overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-3 text-[12px]">
        {state && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-muted">
            <span>Bal {fmt(state.account.balance)}</span>
            <span>Eq {fmt(state.account.equity)}</span>
            <span>Free {fmt(state.account.freeMargin)}</span>
            <span>
              ML{' '}
              {state.account.usedMargin > 0
                ? `${fmt(state.account.marginLevel, 0)}%`
                : '∞'}
            </span>
          </div>
        )}

        <section>
          <h3 className="text-[11px] uppercase tracking-wide text-muted mb-1">
            Open positions ({positions.length})
          </h3>
          {positions.length === 0 ? (
            <p className="text-muted">None</p>
          ) : (
            <ul className="space-y-1">
              {positions.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2 py-1.5 min-h-11"
                >
                  <span className="font-mono">
                    {p.side} {p.size} @ {fmt(p.entryPrice, spec?.digits ?? 5)}
                    {p.ambiguousFill ? ' · ambiguous' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[11px] uppercase tracking-wide text-muted mb-1">
            Working ({working.length})
          </h3>
          {working.length === 0 ? (
            <p className="text-muted">None</p>
          ) : (
            <ul className="space-y-1">
              {working.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2 py-1.5 min-h-11"
                >
                  <span className="font-mono">
                    {o.side} {o.type} {o.size}
                    {o.price != null ? ` @ ${fmt(o.price, spec?.digits ?? 5)}` : ''}
                    {o.role ? ` · ${o.role}` : ''}
                  </span>
                  {!o.role && (
                    <Button size="sm" variant="ghost" className="min-h-11" onPress={() => onCancel(o.id)}>
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[11px] uppercase tracking-wide text-muted mb-1">
            History ({history.length})
          </h3>
          {history.length === 0 ? (
            <p className="text-muted">None</p>
          ) : (
            <ul className="space-y-1">
              {history
                .slice()
                .reverse()
                .slice(0, 20)
                .map((o) => {
                  const r =
                    spec && o.fillPrice != null
                      ? rMultiple(
                          0,
                          o.side,
                          o.fillPrice,
                          o.stopLoss ?? null,
                          o.size,
                          spec,
                          {
                            accountCurrency: state!.account.currency,
                            instrumentPrice: o.fillPrice,
                          },
                        )
                      : null;
                  return (
                    <li
                      key={`${o.id}-${o.filledAt}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5 text-muted"
                    >
                      <span className="font-mono">
                        {o.side} {o.size} @ {fmt(o.fillPrice ?? 0, spec?.digits ?? 5)}
                        {o.ambiguousFill ? ' · ambiguous' : ''}
                      </span>
                      <span className="font-mono">
                        {r == null ? 'R n/a' : `${r.toFixed(2)}R`}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </div>

      <OrderTicket
        bid={bid}
        ask={ask}
        digits={spec?.digits ?? 5}
        lastReject={lastReject}
        disabled={disabled}
        onSubmit={onSubmit}
      />
    </div>
  );
}
