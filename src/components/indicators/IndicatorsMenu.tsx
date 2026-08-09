import { useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import {
  IconSearch,
  IconSettings,
  IconStar,
} from '@/components/icons/ToolIcons';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import { IndicatorSettingsModal } from '@/components/indicators/IndicatorSettingsModal';
import { getChartColors } from '@/chart/chartTheme';
import {
  INDICATOR_CATEGORIES,
  INDICATOR_DEFS,
  INDICATOR_ORDER,
  formatIndicatorLabel,
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
    return new Set(parsed.filter((x): x is IndicatorId => typeof x === 'string' && x in INDICATOR_DEFS));
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

const NAV_BUILTIN: { id: NavId; label: string }[] = [
  { id: 'Moving Averages', label: 'Moving averages' },
  { id: 'Trend', label: 'Trend' },
  { id: 'Oscillators', label: 'Oscillators' },
  { id: 'Volatility', label: 'Volatility' },
  { id: 'Volume', label: 'Volume' },
  { id: 'ICT', label: 'ICT' },
  { id: 'volume', label: 'Volume histogram' },
];

/**
 * TradingView-style Indicators browser — modal with sidebar, search, filter pills.
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
  const [favorites, setFavorites] = useState<Set<IndicatorId>>(() => readFavorites());
  const [settingsId, setSettingsId] = useState<IndicatorId | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    // Typing in search scans all built-ins (TV-style); sidebar still scopes Favorites/Active.
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
    nav === 'Volume' ||
    nav === 'favorites' ||
    nav === 'active' ||
    (query.trim().length > 0 && 'volume'.includes(query.trim().toLowerCase()));

  const filterPill = (id: FilterTab, label: string) => {
    const active = filter === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setFilter(id)}
        className={[
          'min-h-11 sm:min-h-8 px-3 rounded-full text-sm transition-colors border',
          active
            ? 'bg-foreground text-background border-foreground'
            : 'bg-transparent text-muted border-border hover:text-foreground',
        ].join(' ')}
      >
        {label}
      </button>
    );
  };

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
          <span className="text-[10px] text-muted tabular-nums">{enabled.length}</span>
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
            className="w-full sm:max-w-[720px] h-[min(88dvh,640px)] sm:h-[min(80vh,560px)] rounded-t-xl sm:rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] text-foreground shadow-none overflow-hidden flex flex-col"
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
                <span data-ind-current="">
                  {enabled.length} active
                </span>
              </div>
              <div className="relative" data-nodrag="1">
                <button
                  type="button"
                  className="min-h-11 sm:min-h-8 px-2 text-[11px] font-semibold text-[color:var(--text-muted)]"
                  title="Templates (stub)"
                >
                  Templates
                </button>
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

            <div data-ind-v2-body="" className="flex flex-1 min-h-0">
              <aside
                data-ind-v2-nav=""
                className="hidden sm:flex w-[200px] shrink-0 flex-col overflow-y-auto tlr-scroll py-2 px-2 gap-0.5"
              >
                <button
                  type="button"
                  data-active={nav === 'active' ? '1' : undefined}
                  onClick={() => setNav('active')}
                >
                  <span data-ind-nav-lbl="">Active</span>
                  <span data-cnt="">{enabled.length}</span>
                </button>
                <button
                  type="button"
                  data-active={nav === 'favorites' ? '1' : undefined}
                  onClick={() => setNav('favorites')}
                >
                  <span data-ind-nav-lbl="">Pinned</span>
                </button>
                {NAV_BUILTIN.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    data-active={nav === n.id ? '1' : undefined}
                    onClick={() => setNav(n.id)}
                  >
                    <span data-ind-nav-lbl="">{n.label}</span>
                  </button>
                ))}
              </aside>

              <div data-ind-v2-main="" className="flex-1 min-w-0 flex flex-col">
                <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
                  <div data-ind-search="" className="relative">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search"
                      autoFocus
                      className="w-full min-h-11 rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-accent"
                      aria-label="Search indicators"
                    />
                  </div>

                  {/* Mobile nav */}
                  <div className="sm:hidden flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {(
                      [
                        { id: 'favorites' as NavId, label: 'Favorites' },
                        { id: 'active' as NavId, label: 'Active' },
                        ...NAV_BUILTIN,
                      ] as { id: NavId; label: string }[]
                    ).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setNav(n.id)}
                        className={[
                          'shrink-0 min-h-11 px-3 rounded-full text-xs border',
                          nav === n.id
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-border text-muted',
                        ].join(' ')}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {filterPill('all', 'All')}
                    {filterPill('overlays', 'Overlays')}
                    {filterPill('panes', 'Panes')}
                    <span className="ml-auto text-[10px] text-muted tabular-nums hidden sm:inline">
                      {enabled.length}/{MAX_INDICATORS}
                      {paneCount > 0 ? ` · ${paneCount}/${MAX_PANE_INDICATORS} panes` : ''}
                    </span>
                  </div>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted border-b border-border/60 shrink-0">
                  <span>Name</span>
                  <span className="w-16 text-right hidden sm:block">Type</span>
                  <span className="w-11" />
                </div>

                <div data-ind-list="" className="flex-1 overflow-y-auto overscroll-contain tlr-scroll">
                  {showVolumeRow && (nav === 'volume' || filter !== 'overlays') && (
                    <div
                      data-ind-row=""
                      data-on={showVolume ? '1' : undefined}
                      className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 sm:px-3 min-h-11 hover:bg-background/50 border-b border-border/30"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 min-w-0 text-left min-h-11 px-1"
                        onClick={() => onShowVolumeChange(!showVolume)}
                      >
                        <span className="w-8" />
                        <span
                          className={[
                            'truncate text-sm',
                            showVolume ? 'text-foreground font-medium' : 'text-foreground',
                          ].join(' ')}
                        >
                          Volume
                        </span>
                        {showVolume && (
                          <span className="text-[10px] text-accent shrink-0">on</span>
                        )}
                      </button>
                      <span className="w-16 text-right text-[11px] text-muted hidden sm:block">
                        hist
                      </span>
                      <span className="w-11" />
                    </div>
                  )}

                  {listIds.map((id) => {
                    const d = INDICATOR_DEFS[id];
                    const on = enabledMap.has(id);
                    const fav = favorites.has(id);
                    const atCap =
                      !on &&
                      (enabled.length >= MAX_INDICATORS ||
                        (d.placement === 'pane' && paneCount >= MAX_PANE_INDICATORS));
                    return (
                      <div
                        key={id}
                        data-ind-row=""
                        data-on={on ? '1' : undefined}
                        className={[
                          'grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 sm:px-3 min-h-11 border-b border-border/30',
                          on ? 'bg-accent/5' : 'hover:bg-background/50',
                          atCap ? 'opacity-50' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <button
                            type="button"
                            className={[
                              'min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 flex items-center justify-center rounded-md',
                              fav ? 'text-accent' : 'text-muted hover:text-foreground',
                            ].join(' ')}
                            title={fav ? 'Remove favorite' : 'Add favorite'}
                            aria-label={fav ? 'Remove favorite' : 'Add favorite'}
                            onClick={() => toggleFavorite(id)}
                          >
                            <IconStar className="w-3.5 h-3.5" filled={fav} />
                          </button>
                          <button
                            type="button"
                            disabled={atCap}
                            className="flex-1 min-w-0 text-left min-h-11 py-2 disabled:cursor-not-allowed"
                            onClick={() => toggle(id)}
                          >
                            <span
                              className={[
                                'block truncate text-sm',
                                on ? 'font-medium text-foreground' : 'text-foreground',
                              ].join(' ')}
                            >
                              {d.label}
                            </span>
                            <span className="block text-[11px] text-muted truncate sm:hidden">
                              {d.shortLabel} · {d.placement === 'pane' ? 'pane' : 'overlay'}
                              {on ? ' · on' : ''}
                            </span>
                          </button>
                        </div>
                        <span className="w-16 text-right text-[11px] text-muted hidden sm:block tabular-nums">
                          {d.placement === 'pane' ? 'pane' : 'overlay'}
                        </span>
                        <button
                          type="button"
                          className="w-11 min-h-11 rounded-md text-muted hover:text-foreground hover:bg-background/70 flex items-center justify-center"
                          title={`${d.label} settings`}
                          aria-label={`${d.label} settings`}
                          onClick={() => openSettings(id)}
                        >
                          <IconSettings className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {listIds.length === 0 && nav !== 'volume' && (
                    <p className="px-4 py-8 text-sm text-muted text-center">
                      No indicators match.
                    </p>
                  )}
                </div>

                {enabled.length > 0 && (
                  <div className="border-t border-border px-3 py-2 shrink-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
                      Active on chart
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {enabled.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="text-[11px] px-2 py-1 min-h-9 rounded-md bg-background border border-border hover:border-accent/50"
                          onClick={() => setSettingsId(e.id)}
                          title="Open settings"
                        >
                          {formatIndicatorLabel(e.id, e.params)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mobileExtras && (
                  <div className="border-t border-border px-3 py-2 sm:hidden shrink-0">
                    {mobileExtras}
                  </div>
                )}
              </div>
            </div>
            <div data-win-foot="" className="flex items-center justify-end gap-2 px-3 py-2 border-t border-[color:var(--line)] shrink-0">
              <button
                type="button"
                className="min-h-11 sm:min-h-8 px-3 rounded-md text-[12px] font-semibold text-[color:var(--text-muted)]"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                data-brand-btn="primary"
                className="min-h-11 sm:min-h-8 px-4 rounded-md text-[12px] font-bold"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
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
