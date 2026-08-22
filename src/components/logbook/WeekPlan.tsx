import type { LogbookTrade } from '@/logbook/types';

export const PLAN_HOURS = [8, 9, 10, 11, 12, 13];
export const DAY_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
}

export function hourLabel(h: number): string {
  if (h === 0) return '12:00 am';
  if (h === 12) return '12:00 pm';
  if (h > 12) return `${h - 12}:00 pm`;
  return `${h}:00 am`;
}

export function monthName(d: Date): string {
  return d.toLocaleString(undefined, { month: 'long' });
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function cellKey(d: Date, hour: number): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${hour}`;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function groupByCell(trades: LogbookTrade[]): Map<string, LogbookTrade[]> {
  const byCell = new Map<string, LogbookTrade[]>();
  for (const t of trades) {
    const d = new Date(t.openTime * 1000);
    const key = cellKey(d, d.getHours());
    const list = byCell.get(key) ?? [];
    list.push(t);
    byCell.set(key, list);
  }
  return byCell;
}

export function groupByDay(trades: LogbookTrade[]): Map<string, LogbookTrade[]> {
  const map = new Map<string, LogbookTrade[]>();
  for (const t of trades) {
    const d = new Date(t.openTime * 1000);
    const key = dayKey(d);
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.openTime - b.openTime);
  }
  return map;
}

export function hoursInRange(
  trades: LogbookTrade[],
  days: Date[],
  base: readonly number[],
): number[] {
  const set = new Set(base);
  const daySet = new Set(days.map(dayKey));
  for (const t of trades) {
    const d = new Date(t.openTime * 1000);
    if (daySet.has(dayKey(d))) set.add(d.getHours());
  }
  return [...set].sort((a, b) => a - b);
}

export function TradeChip({
  trade,
  onOpen,
  compact = false,
}: {
  trade: LogbookTrade;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={['jd-chip', trade.side === 'long' ? 'is-long' : '', compact ? 'is-compact' : ''].join(
        ' ',
      )}
      onClick={() => onOpen(trade.id)}
    >
      <b>{trade.symbol}</b>
      {compact ? null : trade.setup ?? (trade.side === 'long' ? 'Long' : 'Short')}
    </button>
  );
}

interface WeekPlanProps {
  trades: LogbookTrade[];
  now?: Date;
  weekOf?: Date;
  days?: Date[];
  hours?: number[];
  stack?: boolean;
  hideChrome?: boolean;
  withStack?: boolean;
  onOpen: (id: string) => void;
  onCalendar?: () => void;
  onShift?: (weeks: number) => void;
  onPickDay?: (d: Date) => void;
}

export function WeekPlan({
  trades,
  now = new Date(),
  weekOf,
  days: daysProp,
  hours,
  stack = false,
  hideChrome = false,
  withStack = false,
  onOpen,
  onCalendar,
  onShift,
  onPickDay,
}: WeekPlanProps) {
  const start = mondayOf(weekOf ?? now);
  const days =
    daysProp ??
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  const labelDate = weekOf ? (days[Math.min(3, days.length - 1)] ?? start) : now;
  const prev = new Date(labelDate.getFullYear(), labelDate.getMonth() - 1, 1);
  const next = new Date(labelDate.getFullYear(), labelDate.getMonth() + 1, 1);
  const byCell = groupByCell(trades);
  const byDay = groupByDay(trades);
  const rows = hours ?? PLAN_HOURS;
  const one = days.length === 1;

  const chrome = hideChrome ? null : (
    <div className="jd-plan-months">
      {onShift ? (
        <button type="button" onClick={() => onShift(-1)} aria-label="Previous week">
          {monthName(prev)}
        </button>
      ) : (
        <span>{monthName(prev)}</span>
      )}
      <strong>
        {monthName(labelDate)} {labelDate.getFullYear()}
      </strong>
      {onShift ? (
        <button type="button" onClick={() => onShift(1)} aria-label="Next week">
          {monthName(next)}
        </button>
      ) : (
        <span>{monthName(next)}</span>
      )}
    </div>
  );

  const grid = (
    <div className={['jd-plan-grid', one ? 'is-one' : '', withStack ? 'is-wide' : ''].join(' ')}>
      <div />
      {days.map((d) => {
        const today = sameDay(d, now);
        const inner = (
          <>
            {d.toLocaleString(undefined, { weekday: 'short' })}
            <b>{d.getDate()}</b>
          </>
        );
        return onPickDay ? (
          <button
            key={d.toISOString()}
            type="button"
            className={['jd-plan-dow', today ? 'is-today' : ''].join(' ')}
            onClick={() => onPickDay(d)}
          >
            {inner}
          </button>
        ) : (
          <div key={d.toISOString()} className={['jd-plan-dow', today ? 'is-today' : ''].join(' ')}>
            {inner}
          </div>
        );
      })}
      {rows.map((hour) => (
        <HourRow
          key={hour}
          hour={hour}
          days={days}
          byCell={byCell}
          stack={stack}
          onOpen={onOpen}
        />
      ))}
    </div>
  );

  const stackList = withStack ? (
    <div className="jd-plan-stack">
      {days.map((d) => {
        const list = byDay.get(dayKey(d)) ?? [];
        return (
          <section key={d.toISOString()}>
            {onPickDay ? (
              <button type="button" className="jd-plan-stack-day" onClick={() => onPickDay(d)}>
                {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </button>
            ) : (
              <h3>
                {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </h3>
            )}
            {list.length === 0 ? (
              <p className="jd-muted">No tickets</p>
            ) : (
              <ul>
                {list.map((t) => (
                  <li key={t.id}>
                    <span className="jd-hour">{hourLabel(new Date(t.openTime * 1000).getHours())}</span>
                    <TradeChip trade={t} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  ) : null;

  const full = onCalendar ? (
    <button type="button" className="jd-btn jd-btn-ghost jd-plan-full" onClick={onCalendar}>
      Full calendar
    </button>
  ) : null;

  if (hideChrome) {
    return (
      <>
        {grid}
        {stackList}
      </>
    );
  }

  return (
    <section className="jd-card jd-plan">
      {chrome}
      {grid}
      {stackList}
      {full}
    </section>
  );
}

function HourRow({
  hour,
  days,
  byCell,
  stack,
  onOpen,
}: {
  hour: number;
  days: Date[];
  byCell: Map<string, LogbookTrade[]>;
  stack: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <div className="jd-hour">{hourLabel(hour)}</div>
      {days.map((d) => {
        const list = byCell.get(cellKey(d, hour)) ?? [];
        const shown = stack ? list : list.slice(0, 1);
        return (
          <div key={cellKey(d, hour)} className="jd-slot">
            {shown.map((t) => (
              <TradeChip key={t.id} trade={t} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
    </>
  );
}
