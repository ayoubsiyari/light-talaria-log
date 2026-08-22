import { useMemo, useState } from 'react';
import { specForSymbol, specSummary } from '@/logbook/catalog';
import {
  logbookDistance,
  logbookRiskAccount,
  sizeUnit,
} from '@/logbook/instrumentCalc';
import { clampLot } from '@/orders/instrumentSpec';
import { sizeFromRisk } from '@/orders/sizing';
import { deskSizing, type LogbookAccount } from '@/logbook';
import { TickerSelect } from './TickerSelect';
import { FIELD, formatMoney, formatR } from './format';

interface PositionCalculatorProps {
  account?: LogbookAccount | null;
  initialSymbol?: string;
  initialEntry?: number | null;
  initialStop?: number | null;
  onUseSize?: (symbol: string, size: number) => void;
}

export function PositionCalculator({
  account = null,
  initialSymbol = 'EURUSD',
  initialEntry = null,
  initialStop = null,
  onUseSize,
}: PositionCalculatorProps) {
  const sizing = account ? deskSizing(account) : null;
  const [symbol, setSymbol] = useState(initialSymbol);
  const [equity, setEquity] = useState(sizing?.equity ?? 10_000);
  const [riskPct, setRiskPct] = useState(sizing?.riskPct ?? 1);
  const [entry, setEntry] = useState<number | null>(initialEntry);
  const [stop, setStop] = useState<number | null>(initialStop);
  const [target, setTarget] = useState<number | null>(null);

  const spec = useMemo(() => specForSymbol(symbol), [symbol]);
  const unit = sizeUnit(symbol);
  const result = useMemo(() => {
    if (entry == null || stop == null || !(entry > 0) || !(stop > 0) || !(equity > 0)) {
      return null;
    }
    return sizeFromRisk({
      equity,
      riskPercent: riskPct / 100,
      entryPrice: entry,
      stopPrice: stop,
      spec,
      ctx: { accountCurrency: 'USD', instrumentPrice: entry },
    });
  }, [equity, riskPct, entry, stop, spec]);

  const dist = logbookDistance(symbol, entry, stop);
  const plannedR =
    entry != null && stop != null && target != null
      ? Math.abs(target - entry) / Math.abs(entry - stop)
      : null;
  const lots = result ? clampLot(result.lots, spec) : null;
  const riskAtSize =
    result && entry != null
      ? logbookRiskAccount(symbol, entry, stop, result.lots)
      : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-6 pb-6">
      <div className="space-y-5">
        <label className="space-y-2 block">
          <span className="text-xs tracking-[0.16em] uppercase text-muted">Ticker</span>
          <TickerSelect value={symbol} onChange={setSymbol} />
          <span className="block text-xs text-muted">{specSummary(spec, entry)}</span>
        </label>
        {account ? (
          <p className="jd-desk-risk">
            Sizing <b>{account.name}</b>
            {sizing ? ` · ${sizing.riskPct}% of desk` : ''}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Num label="Equity USD" value={equity} onChange={(n) => setEquity(n ?? 0)} />
          <Num label="Risk %" value={riskPct} onChange={(n) => setRiskPct(n ?? 0)} />
          <Num label="Entry" value={entry} onChange={setEntry} nullable />
          <Num label="Stop" value={stop} onChange={setStop} nullable />
        </div>
        <Num label="Target" value={target} onChange={setTarget} nullable />
      </div>

      <aside className="jd-card flex flex-col gap-4">
        {result && lots != null ? (
          <>
            <div>
              <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">
                {lots}
              </p>
              <p className="text-xs tracking-[0.16em] uppercase text-muted mt-2">{unit}</p>
            </div>
            <dl className="space-y-2 text-sm">
              <CalcRow k="Risk" v={formatMoney(riskAtSize ?? result.actualRiskAccount)} />
              <CalcRow
                k="Stop"
                v={dist ? `${dist.pips.toFixed(1)} ${dist.unit}` : '—'}
              />
              <CalcRow k="Asked" v={formatMoney(result.requestedRiskAccount)} />
              <CalcRow
                k="R"
                v={plannedR != null && Number.isFinite(plannedR) ? formatR(plannedR) : '—'}
              />
            </dl>
            {result.clamped && (
              <p className="text-xs text-muted">Clamped to this ticker’s min/max step.</p>
            )}
            {result.approximate && (
              <p className="text-xs text-muted">USD conversion is approximate on this cross.</p>
            )}
            {onUseSize && (
              <button
                type="button"
                className="mt-auto min-h-11 rounded-full bg-text-primary px-6 text-sm text-bg"
                onClick={() => onUseSize(symbol, result.lots)}
              >
                Use on ticket
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted py-8">Set entry and stop to size the position.</p>
        )}
      </aside>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  nullable = false,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  nullable?: boolean;
}) {
  return (
    <label className="space-y-1.5 block min-w-0">
      <span className="text-xs tracking-[0.16em] uppercase text-muted">{label}</span>
      <input
        type="number"
        step="any"
        className={FIELD}
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '') {
            onChange(nullable ? null : 0);
            return;
          }
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : nullable ? null : 0);
        }}
      />
    </label>
  );
}

function CalcRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-stroke pb-2">
      <dt className="text-muted">{k}</dt>
      <dd className="tabular-nums font-semibold">{v}</dd>
    </div>
  );
}
