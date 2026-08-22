import { useMemo, useState } from 'react';
import { monthGrid, utcYmd, weeklyRecap } from '@/logbook';
import type { LogbookTrade } from '@/logbook/types';
import { formatMoney, formatPct, pnlClass } from './format';

interface CalendarPeekProps {
  trades: LogbookTrade[];
  nowSec?: number;
  onOpenCalendar: () => void;
}

export function CalendarPeek({
  trades,
  nowSec = Math.floor(Date.now() / 1000),
  onOpenCalendar,
}: CalendarPeekProps) {
  const now = new Date(nowSec * 1000);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const todayKey = utcYmd(nowSec);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      if (t.status !== 'closed' || t.closeTime == null) continue;
      const key = utcYmd(t.closeTime);
      map.set(key, (map.get(key) ?? 0) + (t.netPnl ?? 0));
    }
    return map;
  }, [trades]);

  const cells = monthGrid(year, month);
  const recap = weeklyRecap(trades, nowSec);
  const label = new Date(Date.UTC(year, month, 1)).toLocaleString('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-stroke bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight">Calendar</h2>
          {recap.closedCount === 0 ? (
            <p className="mt-1 text-sm text-muted">No closes this week.</p>
          ) : (
            <p className={`mt-1 text-sm tabular-nums ${pnlClass(recap.netPnl)}`}>
              {formatMoney(recap.netPnl)} · {formatPct(recap.winRate)} · {recap.closedCount} closed
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenCalendar}
          className="min-h-11 shrink-0 rounded-full px-3 text-sm text-muted hover:text-text-primary"
        >
          Full
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          className="min-h-11 rounded-full px-3 text-sm text-muted hover:text-text-primary"
          onClick={() => shift(-1)}
        >
          Prev
        </button>
        <p className="text-sm font-medium tabular-nums">{label}</p>
        <button
          type="button"
          className="min-h-11 rounded-full px-3 text-sm text-muted hover:text-text-primary"
          onClick={() => shift(1)}
        >
          Next
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid flex-1 grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={`e-${i}`} />;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const pnl = byDay.get(key);
          const isToday = key === todayKey;
          const tone =
            pnl == null
              ? 'text-muted'
              : pnl > 0
                ? 'text-success'
                : pnl < 0
                  ? 'text-danger'
                  : 'text-text-primary';
          return (
            <button
              key={key}
              type="button"
              onClick={onOpenCalendar}
              className={[
                'min-h-11 rounded-lg text-sm tabular-nums',
                isToday ? 'bg-accent/25 font-semibold text-[color:var(--brand)]' : tone,
              ].join(' ')}
            >
              {d}
            </button>
          );
        })}
      </div>
    </section>
  );
}
