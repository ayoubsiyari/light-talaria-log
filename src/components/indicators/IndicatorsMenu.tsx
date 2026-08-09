import { useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import { IndicatorSettingsModal } from '@/components/indicators/IndicatorSettingsModal';
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
  mobileExtras?: React.ReactNode;
}

type NavId = 'favorites' | 'active' | 'volume' | (typeof INDICATOR_CATEGORIES)[number];
type FilterTab = 'all' | 'overlays' | 'panes';

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

const NAV_ROWS: { id: NavId; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'favorites', label: 'Pinned' },
  { id: 'Moving Averages', label: 'Moving averages' },
  { id: 'Trend', label: 'Trend' },
  { id: 'Oscillators', label: 'Oscillators' },
  { id: 'Volatility', label: 'Volatility' },
  { id: 'Volume', label: 'Volume' },
  { id: 'ICT', label: 'ICT' },
  { id: 'volume', label: 'Volume histogram' },
];

/**
 * Obsidian Indicators browser — matches Live screenshot:
 * header · left nav · search · All/Overlays/Panes · NAME/TYPE rows · Close/Done.
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
  const [nav, setNav] = useState<NavId>('Moving Averages');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [favorites, setFavorites] = useState<Set<IndicatorId>>(() =>
    readFavorites(),
  );
  const [settingsId, setSettingsId] = useState<IndicatorId | null>(null);
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

  const listIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    let ids: IndicatorId[];
    if (nav === 'favorites') {
      ids = INDICATOR_ORDER.filter((id) => favorites.has(id));
    } else if (nav === 'active') {
      ids = enabled.map((e) => e.id);
    } else if (nav === 'volume') {
      ids = [];
    } else if (q) {
      ids = [...INDICATOR_ORDER];
    } else {
      ids = INDICATOR_ORDER.filter((id) => INDICATOR_DEFS[id].category === nav);
    }

    if (filter === 'overlays') {
      ids = ids.filter((id) => INDICATOR_DEFS[id].placement === 'overlay');
    } else if (filter === 'panes') {
      ids = ids.filter((id) => INDICATOR_DEFS[id].placement === 'pane');
    }

    if (q) {
      ids = ids.filter((id) => {
        const d = INDICATOR_DEFS[id];
        return (
          d.label.toLowerCase().includes(q) ||
          d.shortLabel.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.id.includes(q)
        );
      });
    }

    return ids;
  }, [query, nav, filter, favorites, enabled]);

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

  const openSettings = (id: IndicatorId) => {
    const on = enabledMap.has(id);
    const def = INDICATOR_DEFS[id];
    const atCap =
      !on &&
      (enabled.length >= MAX_INDICATORS ||
        (def.placement === 'pane' && paneCount >= MAX_PANE_INDICATORS));
    if (!on) {
      if (atCap) return;
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
    }
    setSettingsId(id);
  };

  const settingsItem: EnabledIndicator | null = settingsId
    ? (enabledMap.get(settingsId) ?? {
        id: settingsId,
        params: { ...INDICATOR_DEFS[settingsId].defaultParams },
      })
    : null;

  const showVolumeRow =
    nav === 'volume' ||
    (nav === 'Volume' && filter !== 'overlays') ||
    nav === 'favorites' ||
    nav === 'active' ||
    (query.trim().length > 0 && 'volume'.includes(query.trim().toLowerCase()));

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="v8b-chrome-btn !h-7 min-h-7 [@media(hover:none)]:min-h-11 gap-1.5"
        onPress={() => setOpen(true)}
      >
        <ChromeIcon n="indicator" s={15} />
        <span className="hidden sm:inline">Indicators</span>
        {enabled.length > 0 && (
          <span className="text-[10px] text-muted tabular-nums">
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
            {/* Header */}
            <div data-win-header="">
              <div data-win-icon="">
                <ChromeIcon n="indicator" s={16} cl="var(--accent)" />
              </div>
              <div data-ind-win-titles="">
                <span data-win-title="">Indicators</span>
                <em data-ind-current="">
                  {enabled.length} active
                </em>
              </div>
              <div style={{ flex: 1 }} />
              <div className="relative" data-nodrag="1">
                <button
                  type="button"
                  data-tpl-trigger=""
                  className="min-h-11 sm:min-h-8 px-2 text-[12px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                  aria-expanded={tplOpen}
                  aria-haspopup="menu"
                  onClick={() => setTplOpen((o) => !o)}
                >
                  Templates
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
                    <div data-tpl-head="" className="px-2.5 py-1.5 flex items-center gap-2">
                      <strong className="text-[12px]">Templates</strong>
                      <em className="text-[10px] text-[color:var(--text-faint)]">0</em>
                    </div>
                    <div data-tpl-empty="" className="px-2.5 py-3">
                      <strong className="block text-[12px]">No templates yet</strong>
                      <em className="block text-[11px] text-[color:var(--text-faint)] mt-0.5">
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
              {/* Sidebar */}
              <nav
                data-ind-v2-nav=""
                aria-label="Categories"
                className="hidden sm:flex"
              >
                {NAV_ROWS.map((n) => {
                  const active = nav === n.id;
                  const cnt =
                    n.id === 'active'
                      ? enabled.length
                      : n.id === 'favorites'
                        ? favorites.size
                        : undefined;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      data-active={active ? '1' : undefined}
                      onClick={() => setNav(n.id)}
                    >
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
                    placeholder="Search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search indicators"
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

                {/* Mobile category chips */}
                <div className="sm:hidden flex gap-1 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    </button>
                  ))}
                </div>

                {/* Filter pills — screenshot parity */}
                <div
                  data-ind-filters=""
                  className="flex items-center gap-1.5 flex-wrap px-3.5 pb-2 shrink-0"
                >
                  {(
                    [
                      ['all', 'All'],
                      ['overlays', 'Overlays'],
                      ['panes', 'Panes'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      data-active={filter === id ? '1' : undefined}
                      onClick={() => setFilter(id)}
                      className={[
                        'min-h-11 sm:min-h-8 px-3 rounded-full text-[12px] font-semibold border transition-colors',
                        filter === id
                          ? 'bg-[color:var(--text)] text-[color:var(--surface)] border-[color:var(--text)]'
                          : 'bg-transparent text-[color:var(--text-muted)] border-[color:var(--line)] hover:text-[color:var(--text)]',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="ml-auto text-[11px] font-semibold tabular-nums text-[color:var(--text-faint)] hidden sm:inline">
                    {enabled.length}/{MAX_INDICATORS}
                  </span>
                </div>

                {/* Column headers */}
                <div
                  data-ind-cols=""
                  className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-faint)] border-b border-[color:var(--line)] shrink-0"
                >
                  <span>Name</span>
                  <span className="w-16 text-right hidden sm:block">Type</span>
                  <span className="w-9" aria-hidden />
                </div>

                <div data-ind-list="" className="tlr-scroll">
                  {showVolumeRow &&
                    (nav === 'volume' ||
                      nav === 'Volume' ||
                      nav === 'active' ||
                      nav === 'favorites' ||
                      query.trim().length > 0) &&
                    filter !== 'overlays' && (
                      <div
                        data-ind-row=""
                        data-on={showVolume ? '1' : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => onShowVolumeChange(!showVolume)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onShowVolumeChange(!showVolume);
                          }
                        }}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '28px 1fr auto 36px',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span aria-hidden />
                        <div data-ind-meta="">
                          <strong>Volume</strong>
                        </div>
                        <em
                          className="hidden sm:block text-[11px] text-[color:var(--text-faint)] w-16 text-right"
                          style={{ fontStyle: 'normal' }}
                        >
                          hist
                        </em>
                        <span aria-hidden />
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
                    const typeLbl =
                      d.placement === 'pane' ? 'pane' : 'overlay';
                    return (
                      <div
                        key={id}
                        data-ind-row=""
                        data-on={on ? '1' : undefined}
                        role="button"
                        tabIndex={atCap ? -1 : 0}
                        aria-pressed={on}
                        aria-disabled={atCap || undefined}
                        onClick={() => {
                          if (!atCap) toggle(id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (!atCap) toggle(id);
                          }
                        }}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '28px 1fr auto 36px',
                          alignItems: 'center',
                          gap: 8,
                          opacity: atCap ? 0.45 : 1,
                        }}
                      >
                        <button
                          type="button"
                          data-indaction="1"
                          data-ind-pin=""
                          data-on={fav ? '1' : undefined}
                          aria-label={fav ? 'Unpin' : 'Pin'}
                          title={fav ? 'Unpin' : 'Pin'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(id);
                          }}
                          className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7 inline-flex items-center justify-center"
                        >
                          <ChromeIcon
                            n={fav ? 'starFill' : 'star'}
                            s={14}
                            cl="currentColor"
                          />
                        </button>
                        <div data-ind-meta="">
                          <strong>{d.label}</strong>
                          <em className="sm:hidden">
                            {typeLbl}
                            {on ? ' · on' : ''}
                          </em>
                        </div>
                        <span
                          className="hidden sm:block text-[11px] text-[color:var(--text-faint)] w-16 text-right tabular-nums"
                          style={{ fontStyle: 'normal' }}
                        >
                          {typeLbl}
                        </span>
                        <button
                          type="button"
                          data-indaction="1"
                          data-brand-icon="1"
                          aria-label={`${d.label} settings`}
                          title={`${d.label} settings`}
                          className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7 inline-flex items-center justify-center text-[color:var(--text-muted)]"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSettings(id);
                          }}
                        >
                          <ChromeIcon n="settings" s={14} />
                        </button>
                      </div>
                    );
                  })}

                  {listIds.length === 0 && nav !== 'volume' ? (
                    <div data-ind-empty="" className="px-4 py-10 text-center">
                      <strong className="block text-[13px]">
                        {(nav as NavId) === 'favorites'
                          ? 'No pins yet'
                          : (nav as NavId) === 'active'
                            ? 'Nothing on the chart'
                            : 'No matches'}
                      </strong>
                      <em className="block text-[11px] text-[color:var(--text-faint)] mt-1">
                        {(nav as NavId) === 'favorites'
                          ? 'Pin indicators to find them here.'
                          : (nav as NavId) === 'active'
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
              <button
                type="button"
                className="min-h-11 sm:min-h-8 px-3 rounded-md text-[13px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <div data-ind-foot-actions="" style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  data-brand-btn="primary"
                  className="min-h-11 sm:min-h-8"
                  style={{ height: 32, padding: '0 16px', fontSize: 13, fontWeight: 600 }}
                  onClick={() => setOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {settingsItem && (
        <IndicatorSettingsModal
          indicator={settingsItem}
          onClose={() => setSettingsId(null)}
          onSave={(next) => {
            const exists = enabled.some((e) => e.id === next.id);
            if (exists) {
              onChange(enabled.map((e) => (e.id === next.id ? next : e)));
            } else {
              onChange([...enabled, next]);
            }
          }}
        />
      )}
    </>
  );
}
