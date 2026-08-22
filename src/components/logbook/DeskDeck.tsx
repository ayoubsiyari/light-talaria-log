import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogbookTrade } from '@/logbook/types';
import {
  DEFAULT_NEWS_FILTER,
  applyNewsFilter,
  dayBounds,
  normalizeEvents,
  normalizeHeadlines,
  parseFilter,
  type DeskNewsFilter,
  type DeskNewsItem,
  type NewsCategory,
  type NewsDay,
  type NewsImpact,
  type NewsKind,
} from '@/logbook/deskNews';
import { readScopedOrLegacy, writeScoped } from '@/sync/storageScope';
import { formatMoney } from './format';

const NOTE_KEY = 'desk.note';
const FILTER_KEY = 'desk.news.filter.v2';
const SLIDES = 3;

interface DeskDeckProps {
  trade: LogbookTrade | null;
  onOpen: (id: string) => void;
  onLog: () => void;
  onCalculator: () => void;
}

function loadNote(): string {
  const raw = readScopedOrLegacy(NOTE_KEY, []);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === 'string' ? parsed.text : '';
  } catch {
    return '';
  }
}

function loadFilter(): DeskNewsFilter {
  const raw = readScopedOrLegacy(FILTER_KEY, []);
  if (!raw) return DEFAULT_NEWS_FILTER;
  try {
    return parseFilter(JSON.parse(raw));
  } catch {
    return DEFAULT_NEWS_FILTER;
  }
}

export function DeskDeck({ trade, onOpen, onLog, onCalculator }: DeskDeckProps) {
  const [slide, setSlide] = useState(0);
  const [note, setNote] = useState(loadNote);
  const [filter, setFilter] = useState<DeskNewsFilter>(loadFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [items, setItems] = useState<DeskNewsItem[]>([]);
  const [newsStatus, setNewsStatus] = useState<'load' | 'ok' | 'no-key' | 'error'>('load');
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [dragDx, setDragDx] = useState(0);

  useEffect(() => {
    try {
      writeScoped(NOTE_KEY, JSON.stringify({ text: note, updatedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [note]);

  useEffect(() => {
    try {
      writeScoped(FILTER_KEY, JSON.stringify(filter));
    } catch {
      /* ignore */
    }
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = dayBounds(now, 'today').ymd;
    const to = dayBounds(now, 'tomorrow').ymd;
    const wantsHeadlines = filter.kinds.includes('headlines');
    const run = async () => {
      setNewsStatus('load');
      try {
        const [newsRes, calRes] = await Promise.all([
          wantsHeadlines
            ? fetch(`/api/finnhub/news?category=${encodeURIComponent(filter.category)}`)
            : Promise.resolve(null),
          fetch(`/api/finnhub/calendar?from=${from}&to=${to}`),
        ]);
        const newsJson = newsRes
          ? ((await newsRes.json()) as { ok?: boolean; items?: unknown; error?: string })
          : { ok: true, items: [] };
        const calJson = (await calRes.json()) as { ok?: boolean; items?: unknown; error?: string };
        if (cancelled) return;
        const headlines = newsJson.ok ? normalizeHeadlines(newsJson.items, now) : [];
        const events = calJson.ok ? normalizeEvents(calJson.items, now) : [];
        setItems([...headlines, ...events].sort((a, b) => a.time - b.time));
        if (events.length > 0 || headlines.length > 0 || calJson.ok) {
          setNewsStatus('ok');
          return;
        }
        if (wantsHeadlines && newsJson.error === 'missing-key') {
          setNewsStatus('no-key');
          return;
        }
        setNewsStatus('error');
      } catch {
        if (!cancelled) {
          setItems([]);
          setNewsStatus('error');
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [filter.category, filter.kinds]);

  const visible = useMemo(() => applyNewsFilter(items, filter), [items, filter]);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const go = (next: number) => {
    setFilterOpen(false);
    setSlide(((next % SLIDES) + SLIDES) % SLIDES);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest('button, a, textarea, input, label, select')) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    setGrabbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    setDragDx(e.clientX - drag.current.x);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const dx = e.clientX - drag.current.x;
    drag.current = null;
    setGrabbing(false);
    setDragDx(0);
    if (dx < -48) go(slide + 1);
    else if (dx > 48) go(slide - 1);
  };

  const shift = reduceMotion ? 0 : dragDx;
  const trackStyle = {
    transform: `translate3d(calc(${-slide * 100}% + ${shift}px), 0, 0)`,
    transition: grabbing || reduceMotion ? 'none' : 'transform 480ms var(--jd-ease)',
  };

  return (
    <article className={['jd-card jd-feat jd-deck', slide === 0 ? 'is-photo-slide' : ''].join(' ')}>
      <div
        className="jd-deck-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="jd-deck-track" style={trackStyle}>
          <PhotoSlide trade={trade} onOpen={onOpen} onLog={onLog} onCalculator={onCalculator} />
          <NoteSlide note={note} onNote={setNote} />
          <NewsSlide
            items={visible}
            status={newsStatus}
            filter={filter}
            filterOpen={filterOpen}
            onFilter={setFilter}
            onToggleFilter={() => setFilterOpen((v) => !v)}
          />
        </div>
      </div>
      <div className="jd-deck-chrome">
        <button type="button" className="jd-deck-arrow" aria-label="Previous card" onClick={() => go(slide - 1)}>
          <Chevron dir="prev" />
        </button>
        <div className="jd-deck-dots" role="tablist" aria-label="Desk cards">
          {['Photo', 'Note', 'News'].map((label, i) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={slide === i}
              aria-label={label}
              className={['jd-deck-dot', slide === i ? 'is-on' : ''].join(' ')}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button type="button" className="jd-deck-arrow" aria-label="Next card" onClick={() => go(slide + 1)}>
          <Chevron dir="next" />
        </button>
      </div>
    </article>
  );
}

function PhotoSlide({
  trade,
  onOpen,
  onLog,
  onCalculator,
}: {
  trade: LogbookTrade | null;
  onOpen: (id: string) => void;
  onLog: () => void;
  onCalculator: () => void;
}) {
  return (
    <section className="jd-deck-slide is-photo" aria-label="Last ticket">
      <img src="/journal/featured-desk.png" alt="" />
      {trade ? (
        <>
          <button type="button" className="jd-feat-scrim" onClick={() => onOpen(trade.id)}>
            <h2>{trade.symbol}</h2>
            <p>{trade.setup ?? (trade.side === 'long' ? 'Long' : 'Short')}</p>
          </button>
          <span className="jd-feat-cash">{formatMoney(trade.netPnl, 0)}</span>
        </>
      ) : (
        <div className="jd-feat-scrim">
          <h2>First ticket</h2>
          <p>Log a fill so the desk has a name on it.</p>
          <div className="jd-feat-cta">
            <button type="button" className="jd-btn jd-btn-ink" onClick={onLog}>
              Log trade
            </button>
            <button type="button" className="jd-btn jd-btn-ghost" onClick={onCalculator}>
              Calculator
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function NoteSlide({ note, onNote }: { note: string; onNote: (v: string) => void }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (
    <section className="jd-deck-slide is-note" aria-label="Reminder">
      <div className="jd-deck-copy">
        <h2>Note</h2>
        <p className="jd-muted">{today}</p>
      </div>
      <label className="jd-note-field">
        <span className="sr-only">Desk reminder</span>
        <textarea
          value={note}
          maxLength={280}
          placeholder="What to watch. A level, a session, a rule you keep breaking."
          onChange={(e) => onNote(e.target.value)}
        />
      </label>
      <div className="jd-muted jd-note-count">{note.length}/280</div>
    </section>
  );
}

function NewsSlide({
  items,
  status,
  filter,
  filterOpen,
  onFilter,
  onToggleFilter,
}: {
  items: DeskNewsItem[];
  status: 'load' | 'ok' | 'no-key' | 'error';
  filter: DeskNewsFilter;
  filterOpen: boolean;
  onFilter: (f: DeskNewsFilter) => void;
  onToggleFilter: () => void;
}) {
  return (
    <section className="jd-deck-slide is-news" aria-label="Market news">
      <div className="jd-deck-copy jd-news-head">
        <div>
          <h2>News</h2>
          <p className="jd-muted">Today · tomorrow</p>
        </div>
        <button
          type="button"
          className={['jd-news-gear', filterOpen ? 'is-on' : ''].join(' ')}
          aria-label={filterOpen ? 'Close filters' : 'News filters'}
          aria-expanded={filterOpen}
          onClick={onToggleFilter}
        >
          {filterOpen ? <CloseIcon /> : <GearIcon />}
        </button>
      </div>
      {filterOpen ? <NewsFilter filter={filter} onFilter={onFilter} /> : null}
      {status === 'load' ? (
        <p className="jd-muted jd-news-empty">Loading the tape…</p>
      ) : status === 'no-key' ? (
        <p className="jd-muted jd-news-empty">
          Add FINNHUB_API_KEY to .env and restart the app.
        </p>
      ) : status === 'error' ? (
        <p className="jd-muted jd-news-empty">Couldn’t load the calendar. Try again in a moment.</p>
      ) : items.length === 0 ? (
        <p className="jd-muted jd-news-empty">
          {filter.impact.includes('low')
            ? 'Nothing prints today or tomorrow in this filter.'
            : 'No high or medium prints today or tomorrow. Turn on Low in the filter.'}
        </p>
      ) : (
        <ul className="jd-news-tape">
          <NewsGroup day="today" items={items.filter((item) => item.day === 'today')} />
          <NewsGroup day="tomorrow" items={items.filter((item) => item.day === 'tomorrow')} />
        </ul>
      )}
    </section>
  );
}

function NewsGroup({ day, items }: { day: NewsDay; items: DeskNewsItem[] }) {
  if (items.length === 0) return null;
  return (
    <li className={['jd-news-group', day === 'tomorrow' ? 'is-next' : 'is-now'].join(' ')}>
      <p className="jd-news-day">{day === 'today' ? 'Today' : 'Tomorrow'}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.kind === 'headlines' && item.url ? (
              <a className="jd-news-row is-wire" href={item.url} target="_blank" rel="noreferrer">
                <NewsRow item={item} />
              </a>
            ) : (
              <div className={['jd-news-row', item.kind === 'calendar' ? 'is-cal' : ''].join(' ')}>
                <NewsRow item={item} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

function NewsRow({ item }: { item: DeskNewsItem }) {
  const when = new Date(item.time * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (item.kind === 'calendar') {
    return (
      <>
        <span className="jd-news-ccy" aria-hidden="true">
          {item.country.slice(0, 3)}
        </span>
        <span className="jd-news-main">
          <strong>{item.title}</strong>
          <span className="jd-news-meta">
            <i className={['jd-news-pip', `is-${item.impact}`].join(' ')} aria-label={item.impact} />
            {when} · {item.impact}
          </span>
          <span className="jd-news-vals">
            <span>
              <i>Act</i>
              <b>{item.actual}</b>
            </span>
            <span>
              <i>Fcst</i>
              <b>{item.estimate}</b>
            </span>
            <span>
              <i>Prev</i>
              <b>{item.prev}</b>
            </span>
          </span>
        </span>
      </>
    );
  }
  return (
    <>
      <span className="jd-news-flag is-source" aria-hidden="true">
        {item.source.slice(0, 1).toUpperCase()}
      </span>
      <span className="jd-news-main">
        <span className="jd-news-meta">
          {when} · {item.source}
        </span>
        <strong>{item.title}</strong>
      </span>
    </>
  );
}

function NewsFilter({
  filter,
  onFilter,
}: {
  filter: DeskNewsFilter;
  onFilter: (f: DeskNewsFilter) => void;
}) {
  const setCat = (category: NewsCategory) => onFilter({ ...filter, category });
  const toggle = <T extends string>(key: 'days' | 'kinds' | 'impact', value: T) => {
    const cur = filter[key] as T[];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    if (next.length === 0) return;
    onFilter({ ...filter, [key]: next });
  };

  return (
    <div className="jd-news-filter">
      {filter.kinds.includes('headlines') ? (
        <div className="jd-period" role="group" aria-label="Headline category">
          {(['forex', 'general', 'crypto'] as NewsCategory[]).map((c) => (
            <button key={c} type="button" data-on={filter.category === c ? '1' : '0'} onClick={() => setCat(c)}>
              {c === 'forex' ? 'Forex' : c === 'general' ? 'General' : 'Crypto'}
            </button>
          ))}
        </div>
      ) : null}
      <div className="jd-period" role="group" aria-label="Days">
        <button
          type="button"
          data-on={filter.days.includes('today') ? '1' : '0'}
          aria-pressed={filter.days.includes('today')}
          onClick={() => toggle<NewsDay>('days', 'today')}
        >
          Today
        </button>
        <button
          type="button"
          data-on={filter.days.includes('tomorrow') ? '1' : '0'}
          aria-pressed={filter.days.includes('tomorrow')}
          onClick={() => toggle<NewsDay>('days', 'tomorrow')}
        >
          Tomorrow
        </button>
      </div>
      <div className="jd-period" role="group" aria-label="Tape">
        <button
          type="button"
          data-on={filter.kinds.includes('calendar') ? '1' : '0'}
          aria-pressed={filter.kinds.includes('calendar')}
          onClick={() => toggle<NewsKind>('kinds', 'calendar')}
        >
          Calendar
        </button>
        <button
          type="button"
          data-on={filter.kinds.includes('headlines') ? '1' : '0'}
          aria-pressed={filter.kinds.includes('headlines')}
          onClick={() => toggle<NewsKind>('kinds', 'headlines')}
        >
          Headlines
        </button>
      </div>
      <div className="jd-period" role="group" aria-label="Impact">
        {(['high', 'medium', 'low'] as NewsImpact[]).map((imp) => (
          <button
            key={imp}
            type="button"
            data-on={filter.impact.includes(imp) ? '1' : '0'}
            aria-pressed={filter.impact.includes(imp)}
            onClick={() => toggle<NewsImpact>('impact', imp)}
          >
            {imp === 'high' ? 'High' : imp === 'medium' ? 'Med' : 'Low'}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d={dir === 'prev' ? 'M11 4L6 9l5 5' : 'M7 4l5 5-5 5'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
