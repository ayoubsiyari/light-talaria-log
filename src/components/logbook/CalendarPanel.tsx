import { useEffect, useMemo, useState } from 'react';
import { localMonthGrid } from '@/logbook';
import type { LogbookTrade } from '@/logbook/types';
import { readScopedOrLegacy, writeScoped } from '@/sync/storageScope';
import {
  DAY_HOURS,
  PLAN_HOURS,
  TradeChip,
  WeekPlan,
  dayKey,
  groupByDay,
  hoursInRange,
  mondayOf,
  monthName,
  sameDay,
  startOfDay,
} from './WeekPlan';

type CalSpan = 'day' | 'week' | 'month';

const SPAN_KEY = 'desk.calendar.span';
const SPANS: CalSpan[] = ['day', 'week', 'month'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_CHIP_CAP = 2;

interface CalendarPanelProps {
  trades: LogbookTrade[];
  nowSec?: number;
  onOpen: (id: string) => void;
}

function loadSpan(): CalSpan {
  const raw = readScopedOrLegacy(SPAN_KEY, []);
  if (raw === 'day' || raw === 'week' || raw === 'month') return raw;
  return 'month';
}

export function CalendarPanel({
  trades,
  nowSec = Math.floor(Date.now() / 1000),
  onOpen,
}: CalendarPanelProps) {
  const now = new Date(nowSec * 1000);
  const [span, setSpan] = useState<CalSpan>(loadSpan);
  const [cursor, setCursor] = useState(() => startOfDay(now));

  useEffect(() => {
    try {
      writeScoped(SPAN_KEY, span);
    } catch {
      /* ignore quota */
    }
  }, [span]);

  const shift = (delta: number) => {
    setCursor((cur) => {
      const next = new Date(cur);
      if (span === 'day') next.setDate(next.getDate() + delta);
      else if (span === 'week') next.setDate(next.getDate() + delta * 7);
      else next.setMonth(next.getMonth() + delta);
      return startOfDay(next);
    });
  };

  const pickDay = (d: Date) => {
    setCursor(startOfDay(d));
    setSpan('day');
  };

  const nav = navCopy(span, cursor);

  const weekDays = useMemo(() => {
    const start = mondayOf(cursor);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const weekHours = useMemo(
    () => hoursInRange(trades, weekDays, PLAN_HOURS),
    [trades, weekDays],
  );
  const dayHours = useMemo(
    () => hoursInRange(trades, [cursor], DAY_HOURS),
    [trades, cursor],
  );

  return (
    <div className="jd-cal-page">
      <section className="jd-card jd-plan">
        <div className="jd-cal-bar">
          <div className="jd-plan-months">
            <button type="button" onClick={() => shift(-1)} aria-label={nav.prevAria}>
              {nav.prev}
            </button>
            <strong>{nav.title}</strong>
            <button type="button" onClick={() => shift(1)} aria-label={nav.nextAria}>
              {nav.next}
            </button>
          </div>
          <div className="jd-period" role="group" aria-label="Calendar view">
            {SPANS.map((s) => (
              <button
                key={s}
                type="button"
                data-on={span === s ? '1' : '0'}
                onClick={() => setSpan(s)}
              >
                {s === 'day' ? 'Day' : s === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>
        {span === 'month' ? (
          <MonthBoard trades={trades} cursor={cursor} now={now} onOpen={onOpen} onPickDay={pickDay} />
        ) : (
          <WeekPlan
            trades={trades}
            now={now}
            weekOf={cursor}
            days={span === 'day' ? [cursor] : weekDays}
            hours={span === 'day' ? dayHours : weekHours}
            stack
            hideChrome
            withStack={span === 'week'}
            onOpen={onOpen}
            onPickDay={span === 'week' ? pickDay : undefined}
          />
        )}
      </section>
    </div>
  );
}

function navCopy(span: CalSpan, cursor: Date): {
  prev: string;
  next: string;
  title: string;
  prevAria: string;
  nextAria: string;
} {
  if (span === 'day') {
    const prev = new Date(cursor);
    prev.setDate(prev.getDate() - 1);
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    return {
      prev: prev.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
      next: next.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
      title: cursor.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      prevAria: 'Previous day',
      nextAria: 'Next day',
    };
  }
  const label = span === 'week' ? thursdayOf(cursor) : cursor;
  const prevM = new Date(label.getFullYear(), label.getMonth() - 1, 1);
  const nextM = new Date(label.getFullYear(), label.getMonth() + 1, 1);
  return {
    prev: monthName(prevM),
    next: monthName(nextM),
    title: `${monthName(label)} ${label.getFullYear()}`,
    prevAria: span === 'week' ? 'Previous week' : 'Previous month',
    nextAria: span === 'week' ? 'Next week' : 'Next month',
  };
}

function thursdayOf(d: Date): Date {
  const start = mondayOf(d);
  const thu = new Date(start);
  thu.setDate(start.getDate() + 3);
  return thu;
}

function MonthBoard({
  trades,
  cursor,
  now,
  onOpen,
  onPickDay,
}: {
  trades: LogbookTrade[];
  cursor: Date;
  now: Date;
  onOpen: (id: string) => void;
  onPickDay: (d: Date) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = localMonthGrid(year, month);
  const byDay = groupByDay(trades);

  return (
    <div className="jd-plan-month-wrap">
      <div className="jd-plan-dows" aria-hidden="true">
        {DOW.map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="jd-plan-month">
        {cells.map((d, i) => {
          if (d == null) return <div key={`e-${i}`} className="jd-mday is-pad" />;
          const date = new Date(year, month, d);
          const list = byDay.get(dayKey(date)) ?? [];
          const today = sameDay(date, now);
          const extra = Math.max(0, list.length - MONTH_CHIP_CAP);
          const shown = list.slice(0, MONTH_CHIP_CAP);
          const label = date.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });
          return (
            <div key={dayKey(date)} className={['jd-mday', today ? 'is-today' : ''].join(' ')}>
              <button
                type="button"
                className="jd-mday-num"
                onClick={() => onPickDay(date)}
                aria-label={`View ${label}`}
                aria-current={today ? 'date' : undefined}
              >
                <b>{d}</b>
              </button>
              {list.length > 0 ? (
                <span className="jd-mday-count">{list.length}</span>
              ) : null}
              <div className="jd-mday-chips">
                {shown.map((t) => (
                  <TradeChip key={t.id} trade={t} onOpen={onOpen} compact />
                ))}
                {extra > 0 ? (
                  <button
                    type="button"
                    className="jd-mday-more"
                    onClick={() => onPickDay(date)}
                  >
                    +{extra}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
