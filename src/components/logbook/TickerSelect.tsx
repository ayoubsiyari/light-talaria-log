import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  findTicker,
  tickersForTab,
  type CatalogTicker,
  type TickerMarketTab,
} from '@/logbook/catalog';
import { readScopedOrLegacy, writeScoped } from '@/sync/storageScope';

const FAV_KEY = 'desk.tickers.favs';

const TABS: { id: TickerMarketTab; label: string; name: string }[] = [
  { id: 'favorites', label: 'Fav', name: 'Favorites' },
  { id: 'fx', label: 'FX', name: 'FX' },
  { id: 'futures', label: 'Fut', name: 'Futures' },
  { id: 'crypto', label: 'Crypto', name: 'Crypto' },
  { id: 'all', label: 'All', name: 'All markets' },
];

interface TickerSelectProps {
  value: string;
  onChange: (symbol: string) => void;
}

function loadFavs(): string[] {
  const raw = readScopedOrLegacy(FAV_KEY, []);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function TickerSelect({ value, onChange }: TickerSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TickerMarketTab>('all');
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(
    null,
  );
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const items = useMemo(() => tickersForTab(query, tab, favs), [query, tab, favs]);
  const selected = value.trim() ? findTicker(value) : null;
  const favSet = useMemo(() => new Set(favs), [favs]);
  const empty =
    tab === 'favorites' && !query.trim()
      ? 'Star a ticker to pin it here.'
      : 'No ticker matches.';

  useEffect(() => {
    try {
      writeScoped(FAV_KEY, JSON.stringify(favs));
    } catch {
      /* ignore */
    }
  }, [favs]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const maxH = Math.min(220, Math.max(132, openUp ? spaceAbove : spaceBelow));
      setPos({
        top: openUp ? Math.max(8, r.top - maxH - 4) : r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, 280),
        maxH,
      });
    };
    place();
    searchRef.current?.focus();
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const pick = (t: CatalogTicker) => {
    onChange(t.id);
    setQuery('');
    setOpen(false);
  };

  const toggleFav = (id: string) => {
    setFavs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        className="jd-field w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() =>
          setOpen((v) => {
            const next = !v;
            if (next) setQuery('');
            return next;
          })
        }
      >
        <span className={value ? 'font-display font-semibold tracking-tight' : 'jd-muted'}>
          {selected ? selected.display : value || 'Choose ticker'}
        </span>
        <span className="jd-tickers-caret" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d={open ? 'M3 7.5 6 4.5 9 7.5' : 'M3 4.5 6 7.5 9 4.5'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            className="desk-overlay jd-tickers"
            role="listbox"
            aria-label="Tickers"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 100030,
            }}
          >
            <div className="jd-period jd-tickers-tabs" role="tablist" aria-label="Market">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-label={t.name}
                  aria-selected={tab === t.id}
                  data-on={tab === t.id ? '1' : '0'}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              ref={searchRef}
              className="jd-tickers-search"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="jd-tickers-scroller" style={{ maxHeight: pos.maxH }}>
              {items.length === 0 ? (
                <p className="jd-tickers-empty">{empty}</p>
              ) : (
                <ul className="jd-tickers-list">
                  {items.map((t) => {
                    const on = t.id === value;
                    const starred = favSet.has(t.id);
                    return (
                      <li key={t.id} className={['jd-tickers-row', on ? 'is-on' : ''].join(' ')}>
                        <button type="button" className="jd-tickers-pick" onClick={() => pick(t)}>
                          {t.display}
                        </button>
                        <button
                          type="button"
                          className={['jd-tickers-star', starred ? 'is-on' : ''].join(' ')}
                          aria-label={starred ? `Unpin ${t.display}` : `Pin ${t.display}`}
                          aria-pressed={starred}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFav(t.id);
                          }}
                        >
                          <StarIcon filled={starred} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path
        d="M7 1.6 8.4 5h3.6L9.6 7.4 10.9 11 7 8.9 3.1 11l1.3-3.6L1.9 5h3.7L7 1.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
