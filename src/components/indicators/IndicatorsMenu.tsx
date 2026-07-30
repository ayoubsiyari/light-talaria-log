import { useMemo, useState } from 'react';
import { Button, Popover } from '@heroui/react';
import { IconIndicators } from '@/components/icons/ToolIcons';
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
import {
  MAX_OVERLAY_INDICATORS,
  MAX_PANE_INDICATORS,
} from '@/types/indicator';

interface IndicatorsMenuProps {
  showVolume: boolean;
  onShowVolumeChange: (v: boolean) => void;
  enabled: readonly EnabledIndicator[];
  onChange: (next: EnabledIndicator[]) => void;
  /** Extra mobile-only chart controls rendered below the list. */
  mobileExtras?: React.ReactNode;
}

export function IndicatorsMenu({
  showVolume,
  onShowVolumeChange,
  enabled,
  onChange,
  mobileExtras,
}: IndicatorsMenuProps) {
  const [query, setQuery] = useState('');
  const [settingsId, setSettingsId] = useState<IndicatorId | null>(null);
  const enabledMap = useMemo(() => {
    const m = new Map<IndicatorId, EnabledIndicator>();
    for (const e of enabled) m.set(e.id, e);
    return m;
  }, [enabled]);

  const overlayCount = enabled.filter((e) => INDICATOR_DEFS[e.id].placement === 'overlay').length;
  const paneCount = enabled.filter((e) => INDICATOR_DEFS[e.id].placement === 'pane').length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INDICATOR_ORDER.filter((id) => {
      const d = INDICATOR_DEFS[id];
      if (!q) return true;
      return (
        d.label.toLowerCase().includes(q) ||
        d.shortLabel.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.id.includes(q)
      );
    });
  }, [query]);

  const byCategory = useMemo(() => {
    const map = new Map<string, IndicatorId[]>();
    for (const cat of INDICATOR_CATEGORIES) map.set(cat, []);
    for (const id of filtered) {
      const list = map.get(INDICATOR_DEFS[id].category);
      list?.push(id);
    }
    return map;
  }, [filtered]);

  const toggle = (id: IndicatorId) => {
    const def = INDICATOR_DEFS[id];
    const existing = enabledMap.get(id);
    if (existing) {
      onChange(enabled.filter((e) => e.id !== id));
      return;
    }
    if (def.placement === 'overlay' && overlayCount >= MAX_OVERLAY_INDICATORS) return;
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

  const settingsItem: EnabledIndicator | null = settingsId
    ? (enabledMap.get(settingsId) ?? {
        id: settingsId,
        params: { ...INDICATOR_DEFS[settingsId].defaultParams },
      })
    : null;

  return (
    <>
      <Popover>
        {/* Button as direct DialogTrigger child — avoid Button nested in Popover.Trigger */}
        <Button variant="ghost" size="sm" className="inline-flex gap-1.5 h-8 min-h-8 px-2 text-[13px]">
          <IconIndicators className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Indicators</span>
          {enabled.length > 0 && (
            <span className="text-[10px] text-muted tabular-nums">{enabled.length}</span>
          )}
        </Button>
        <Popover.Content className="p-0 z-[100]">
          <Popover.Dialog className="w-[min(22rem,calc(100vw-1.5rem))] bg-surface border border-border rounded-lg shadow-lg p-2">
            <Popover.Heading className="px-2 py-1.5 text-xs font-semibold text-muted uppercase tracking-wide">
              Indicators ({INDICATOR_ORDER.length})
            </Popover.Heading>

            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search indicators…"
              className="mx-2 mb-2 w-[calc(100%-1rem)] min-h-11 bg-background border border-border rounded-md px-3 text-sm outline-none"
              aria-label="Search indicators"
            />

            <p className="px-2 pb-1 text-[10px] text-muted">
              Overlays {overlayCount}/{MAX_OVERLAY_INDICATORS} · Panes {paneCount}/
              {MAX_PANE_INDICATORS}
            </p>

            <div className="max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain">
              <label className="flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-foreground cursor-pointer hover:bg-background/60 min-h-11">
                <input
                  type="checkbox"
                  checked={showVolume}
                  onChange={(e) => onShowVolumeChange(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span className="flex-1">Volume</span>
                <span className="text-[11px] text-muted">hist</span>
              </label>

              {INDICATOR_CATEGORIES.map((cat) => {
                const ids = byCategory.get(cat) ?? [];
                if (ids.length === 0) return null;
                return (
                  <div key={cat} className="mt-1">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {cat}
                    </p>
                    {ids.map((id) => {
                      const d = INDICATOR_DEFS[id];
                      const on = enabledMap.has(id);
                      const atCap =
                        !on &&
                        ((d.placement === 'overlay' && overlayCount >= MAX_OVERLAY_INDICATORS) ||
                          (d.placement === 'pane' && paneCount >= MAX_PANE_INDICATORS));
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-1 px-1 py-0.5 rounded-md hover:bg-background/60 min-h-11"
                        >
                          <label className="flex items-center gap-2.5 flex-1 min-w-0 px-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={atCap}
                              onChange={() => toggle(id)}
                              className="accent-[var(--accent)]"
                            />
                            <span className="flex-1 truncate text-sm">{d.shortLabel}</span>
                            <span className="text-[10px] text-muted shrink-0">
                              {d.placement === 'pane' ? 'pane' : 'ov'}
                            </span>
                          </label>
                          <button
                            type="button"
                            className="min-h-11 min-w-11 rounded-md text-muted hover:text-foreground hover:bg-background/70 text-xs"
                            title={`${d.label} settings`}
                            aria-label={`${d.label} settings`}
                            onClick={() => {
                              if (!on) {
                                if (atCap) return;
                                onChange([
                                  ...enabled,
                                  {
                                    id,
                                    params: { ...d.defaultParams },
                                    visible: true,
                                    colors: colorsForIndicator(id, getChartColors()),
                                    lineWidth: 1.5,
                                  },
                                ]);
                              }
                              setSettingsId(id);
                            }}
                          >
                            ⚙
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {enabled.length > 0 && (
              <div className="border-t border-border mt-1 pt-1 px-2 pb-1">
                <p className="text-[10px] text-muted mb-1">Active</p>
                <div className="flex flex-wrap gap-1">
                  {enabled.map((e) => (
                    <span
                      key={e.id}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border"
                    >
                      {formatIndicatorLabel(e.id, e.params)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {mobileExtras}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

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
