import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import { getChartColors } from '@/chart/chartTheme';
import {
  INDICATOR_CATEGORIES,
  INDICATOR_DEFS,
  INDICATOR_ORDER,
} from '@/indicators/defs';
import { colorsForIndicator } from '@/indicators/themeColors';
import type { EnabledIndicator, IndicatorId } from '@/types/indicator';
import { MAX_INDICATORS, MAX_PANE_INDICATORS } from '@/types/indicator';

interface IndicatorsMenuProps {
  showVolume: boolean;
  onShowVolumeChange: (v: boolean) => void;
  enabled: readonly EnabledIndicator[];
  onChange: (next: EnabledIndicator[]) => void;
  /** Extra mobile-only chart controls rendered below the list. */
  mobileExtras?: ReactNode;
}

type NavId =
  | 'active'
  | 'favorites'
  | 'all'
  | 'volumeHist'
  | (typeof INDICATOR_CATEGORIES)[number];

const FAV_KEY = 'talaria.indicatorFavorites.v1';

function readFavorites(): Set<IndicatorId> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (x): x is IndicatorId => typeof x === 'string' && x in INDICATOR_DEFS,
      ),
    );
  } catch {
    return new Set();
  }
}

function writeFavorites(ids: Set<IndicatorId>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

const NAV_ROWS: {
  id: NavId;
  label: string;
  icon: string;
}[] = [
  { id: 'active', label: 'Active', icon: 'eye' },
  { id: 'favorites', label: 'Pinned', icon: 'pin' },
  { id: 'all', label: 'All', icon: 'layout' },
  { id: 'Moving Averages', label: 'Averages', icon: 'indMa' },
  { id: 'Trend', label: 'Trend', icon: 'indBands' },
  { id: 'Oscillators', label: 'Momentum', icon: 'indOsc' },
  { id: 'Volatility', label: 'Volatility', icon: 'indMacd' },
  { id: 'Volume', label: 'Volume', icon: 'indVolume' },
  { id: 'ICT', label: 'Talaria', icon: 'indicator' },
];

function blurbFor(id: IndicatorId): string {
  const d = INDICATOR_DEFS[id];
  const map: Partial<Record<IndicatorId, string>> = {
    sma: 'Smoothed average of closing prices over N periods',
    ema: 'Exponentially weighted moving average — recent bars weigh more',
    wma: 'Linear-weighted moving average favoring recent closes',
    hma: 'Hull MA — smoother and faster response than SMA/EMA',
    vwma: 'Volume-weighted average price over N bars',
    dema: 'Double EMA — less lag than a single EMA',
    tema: 'Triple EMA — further lag reduction vs DEMA',
    rma: 'Wilder’s smoothed moving average (RMA)',
    bb: 'SMA ± standard-deviation bands around price',
    atr: 'Average True Range — volatility in price units',
    rsi: 'Relative Strength Index — momentum oscillator 0–100',
    macd: 'MACD line, signal, and histogram',
    stoch: 'Stochastic oscillator — close vs high/low range',
    vwap: 'Volume-weighted average price from session open',
  };
  if (map[id]) return map[id]!;
  if (d.placement === 'pane') {
    return `${d.label} — pane study below price`;
  }
  return `${d.label} — overlay on price`;
}

function countInCategory(cat: (typeof INDICATOR_CATEGORIES)[number]): number {
  return INDICATOR_ORDER.filter((id) => INDICATOR_DEFS[id].category === cat)
    .length;
}

/**
 * Obsidian Indicators browser — sidebar · search · abbr/name/desc · pin/+ · Done.
 */
export function IndicatorsMenu({
  showVolume,
  onShowVolumeChange,
  enabled,
  onChange,
  mobileExtras,
}: IndicatorsMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [nav, setNav] = useState<NavId>('all');
  const [favorites, setFavorites] = useState<Set<IndicatorId>>(() =>
    readFavorites(),
  );
  const [tplOpen, setTplOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (tplOpen) setTplOpen(false);
        else setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, tplOpen]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setTplOpen(false);
    }
  }, [open]);

  const enabledMap = useMemo(() => {
    const m = new Map<IndicatorId, EnabledIndicator>();
    for (const e of enabled) m.set(e.id, e);
    return m;
  }, [enabled]);

  const paneCount = enabled.filter(
    (e) => INDICATOR_DEFS[e.id].placement === 'pane',
  ).length;

  const navCounts = useMemo(() => {
    const counts: Partial<Record<NavId, number>> = {
      active: enabled.length + (showVolume ? 1 : 0),
      favorites: favorites.size,
      all: INDICATOR_ORDER.length + 1, // + Volume histogram
    };
    for (const cat of INDICATOR_CATEGORIES) {
      counts[cat] = countInCategory(cat);
    }
    // Volume category includes histogram
    counts.Volume = (counts.Volume ?? 0) + 1;
    return counts;
  }, [enabled.length, favorites.size, showVolume]);

  const listIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    let ids: IndicatorId[];
    if (nav === 'favorites') {
      ids = INDICATOR_ORDER.filter((id) => favorites.has(id));
    } else if (nav === 'active') {
      ids = enabled.map((e) => e.id);
    } else if (nav === 'all' || q) {
      ids = [...INDICATOR_ORDER];
    } else if (nav === 'volumeHist') {
      ids = [];
    } else {
      ids = INDICATOR_ORDER.filter((id) => INDICATOR_DEFS[id].category === nav);
    }

    if (q) {
      ids = ids.filter((id) => {
        const d = INDICATOR_DEFS[id];
        return (
          d.label.toLowerCase().includes(q) ||
          d.shortLabel.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          blurbFor(id).toLowerCase().includes(q) ||
          d.id.includes(q)
        );
      });
    }

    return ids;
  }, [query, nav, favorites, enabled]);

  const showVolumeRow = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return (
        'volume'.includes(q) ||
        q.includes('vol') ||
        q.includes('hist')
      );
    }
    if (nav === 'active') return showVolume;
    if (nav === 'favorites') return false;
    if (nav === 'all' || nav === 'Volume' || nav === 'volumeHist') return true;
    return false;
  }, [query, nav, showVolume]);

  const toggleFavorite = (id: IndicatorId) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFavorites(next);
      return next;
    });
  };

  const toggle = (id: IndicatorId) => {
    const def = INDICATOR_DEFS[id];
    const existing = enabledMap.get(id);
    if (existing) {
      onChange(enabled.filter((e) => e.id !== id));
      return;
    }
    if (enabled.length >= MAX_INDICATORS) return;
    if (def.placement === 'pane' && paneCount >= MAX_PANE_INDICATORS) return;
    onChange([
      ...enabled,
      {
        id,
        params: { ...def.defaultParams },
        visible: true,
        colors: colorsForIndicator(id, getChartColors()),
        lineWidth: 1.5,
      },
    ]);
  };

  const subtitle =
    enabled.length === 0 && !showVolume
      ? 'None on chart'
      : `${enabled.length + (showVolume ? 1 : 0)} on chart`;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="v8b-chrome-btn !h-7 min-h-7 [@media(hover:none)]:min-h-11 gap-1.5"
        onPress={() => setOpen(true)}
      >
        <ChromeIcon n="indicator" s={18} />
        <span className="hidden sm:inline">Indicators</span>
        {enabled.length > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {enabled.length}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: 'var(--backdrop, rgba(0,0,0,0.55))' }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            data-v9-chrome="1"
            data-ind-v2="1"
            data-chrome-win="indicators"
            data-indicators-panel="1"
            data-sdrop="1"
            className="relative w-full sm:w-[min(720px,calc(100vw-2rem))] h-[min(88dvh,640px)] sm:h-[min(80vh,560px)] text-foreground max-sm:!min-w-0 max-sm:!min-h-[50dvh] max-sm:!max-w-none max-sm:!rounded-b-none"
            onPointerDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Indicators"
          >
            <div data-win-header="">
              <div data-win-icon="">
                <ChromeIcon n="indicator" s={16} cl="var(--accent)" />
              </div>
              <div data-ind-win-titles="">
                <span data-win-title="">Indicators</span>
                <em data-ind-current="">{subtitle}</em>
              </div>
              <div style={{ flex: 1 }} />
              <div className="relative" data-nodrag="1">
                <button
                  type="button"
                  data-tpl-trigger=""
                  data-brand-icon="1"
                  className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
                  aria-expanded={tplOpen}
                  aria-haspopup="menu"
                  aria-label="Templates"
                  title="Templates"
                  onClick={() => setTplOpen((o) => !o)}
                >
                  <ChromeIcon n="layout" s={15} />
                </button>
                {tplOpen ? (
                  <div
                    data-v9-chrome="1"
                    data-sdrop="1"
                    data-tpl-menu=""
                    data-ind-tpl-menu=""
                    role="menu"
                    className="absolute top-full right-0 mt-1 z-20 w-56 rounded-[var(--radius-panel,8px)] border border-[color:var(--line)] bg-[color:var(--surface)] py-1 overflow-hidden"
                  >
                    <div
                      data-tpl-head=""
                      className="px-2.5 py-1.5 flex items-center gap-2"
                    >
                      <strong className="text-xs">Templates</strong>
                      <em className="text-xs text-[color:var(--text-faint)]">
                        0
                      </em>
                    </div>
                    <div data-tpl-empty="" className="px-2.5 py-3">
                      <strong className="block text-xs">No templates yet</strong>
                      <em className="block text-xs text-[color:var(--text-faint)] mt-0.5">
                        Save the indicators on your chart to reuse later.
                      </em>
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                data-brand-icon="1"
                className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <ChromeIcon n="x" s={16} />
              </button>
            </div>

            <div data-ind-v2-body="">
              <nav
                data-ind-v2-nav=""
                aria-label="Categories"
                className="hidden sm:flex"
                style={{ width: 168 }}
              >
                {NAV_ROWS.map((n) => {
                  const active = nav === n.id;
                  const cnt = navCounts[n.id];
                  return (
                    <button
                      key={n.id}
                      type="button"
                      data-active={active ? '1' : undefined}
                      onClick={() => setNav(n.id)}
                    >
                      <ChromeIcon
                        n={n.icon}
                        s={14}
                        cl={
                          active ? 'var(--accent)' : 'var(--text-muted)'
                        }
                      />
                      <span data-ind-nav-lbl="">{n.label}</span>
                      {cnt != null ? <span data-cnt="">{cnt}</span> : null}
                    </button>
                  );
                })}
              </nav>

              <div data-ind-v2-main="">
                <div data-ind-search="">
                  <ChromeIcon n="search" s={14} cl="var(--text-faint)" />
                  <input
                    type="text"
                    placeholder="Find an indicator..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Find an indicator"
                    autoFocus
                  />
                  {query ? (
                    <button
                      type="button"
                      data-brand-icon="1"
                      aria-label="Clear"
                      onClick={() => setQuery('')}
                      style={{ width: 28, height: 28 }}
                    >
                      <ChromeIcon n="x" s={12} cl="var(--text-faint)" />
                    </button>
                  ) : null}
                </div>

                <div className="sm:hidden flex gap-1 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {NAV_ROWS.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      data-active={nav === n.id ? '1' : undefined}
                      onClick={() => setNav(n.id)}
                      className={[
                        'shrink-0 min-h-11 px-3 rounded-full text-xs border',
                        nav === n.id
                          ? 'bg-[color:var(--text)] text-[color:var(--surface)] border-[color:var(--text)]'
                          : 'border-[color:var(--line)] text-[color:var(--text-muted)]',
                      ].join(' ')}
                    >
                      {n.label}
                      {navCounts[n.id] != null
                        ? ` ${navCounts[n.id]}`
                        : ''}
                    </button>
                  ))}
                </div>

                <div data-ind-list="" className="tlr-scroll">
                  {showVolumeRow && (
                    <div
                      data-ind-row=""
                      data-on={showVolume ? '1' : undefined}
                      onDoubleClick={() => onShowVolumeChange(!showVolume)}
                    >
                      <div data-ind-meta="">
                        <strong>
                          <span data-ind-abbr="">VOL</span>
                          Volume
                        </strong>
                        <em>Histogram of bar volume under price</em>
                      </div>
                      <span aria-hidden style={{ width: 28 }} />
                      <button
                        type="button"
                        data-ind-toggle=""
                        data-on={showVolume ? '1' : undefined}
                        aria-label={
                          showVolume ? 'Remove Volume' : 'Add Volume'
                        }
                        title={showVolume ? 'Remove' : 'Add'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowVolumeChange(!showVolume);
                        }}
                      >
                        <ChromeIcon
                          n={showVolume ? 'minus' : 'plus'}
                          s={14}
                          cl="currentColor"
                        />
                      </button>
                    </div>
                  )}

                  {listIds.map((id) => {
                    const d = INDICATOR_DEFS[id];
                    const on = enabledMap.has(id);
                    const fav = favorites.has(id);
                    const atCap =
                      !on &&
                      (enabled.length >= MAX_INDICATORS ||
                        (d.placement === 'pane' &&
                          paneCount >= MAX_PANE_INDICATORS));
                    return (
                      <div
                        key={id}
                        data-ind-row=""
                        data-on={on ? '1' : undefined}
                        style={{ opacity: atCap ? 0.45 : 1 }}
                        onDoubleClick={() => {
                          if (!atCap) toggle(id);
                        }}
                      >
                        <div data-ind-meta="">
                          <strong>
                            <span data-ind-abbr="">{d.shortLabel}</span>
                            {d.label}
                          </strong>
                          <em>{blurbFor(id)}</em>
                        </div>
                        <button
                          type="button"
                          data-ind-pin=""
                          data-on={fav ? '1' : undefined}
                          aria-label={fav ? 'Unpin' : 'Pin'}
                          title={fav ? 'Unpin' : 'Pin'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(id);
                          }}
                        >
                          <ChromeIcon
                            n={fav ? 'pinFill' : 'pin'}
                            s={14}
                            cl="currentColor"
                          />
                        </button>
                        <button
                          type="button"
                          data-ind-toggle=""
                          data-on={on ? '1' : undefined}
                          disabled={atCap}
                          aria-label={on ? `Remove ${d.label}` : `Add ${d.label}`}
                          title={on ? 'Remove' : atCap ? 'Limit reached' : 'Add'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!atCap) toggle(id);
                          }}
                        >
                          <ChromeIcon
                            n={on ? 'minus' : 'plus'}
                            s={14}
                            cl="currentColor"
                          />
                        </button>
                      </div>
                    );
                  })}

                  {listIds.length === 0 && !showVolumeRow ? (
                    <div data-ind-empty="">
                      <strong>
                        {nav === 'favorites'
                          ? 'No pins yet'
                          : nav === 'active'
                            ? 'Nothing on the chart'
                            : 'No matches'}
                      </strong>
                      <em>
                        {nav === 'favorites'
                          ? 'Pin indicators to find them here.'
                          : nav === 'active'
                            ? 'Add an indicator from a category.'
                            : 'Try another search.'}
                      </em>
                    </div>
                  ) : null}
                </div>

                {mobileExtras ? (
                  <div className="border-t border-[color:var(--line)] px-3 py-2 sm:hidden shrink-0">
                    {mobileExtras}
                  </div>
                ) : null}
              </div>
            </div>

            <div data-win-foot="" data-ind-foot="">
              <span data-ind-foot-hint="">
                Double-click to add · or use +
              </span>
              <div data-ind-foot-actions="">
                <button
                  type="button"
                  data-brand-btn="primary"
                  className="min-h-11 sm:min-h-8 px-4 text-sm font-semibold"
                  style={{ height: 32 }}
                  onClick={() => setOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
