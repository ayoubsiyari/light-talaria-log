import { useEffect, useState } from 'react';
import { Popover } from '@heroui/react';
import {
  CHART_STYLE_TEMPLATES,
  CHART_TEMPLATE_CATEGORIES,
  applyChartStyleTemplate,
  getActiveTemplateId,
  matchTemplateId,
  resetChartStyleTemplate,
  type ChartTemplateCategory,
} from '@/chart/chartStyleTemplates';
import { getAppearance, subscribeAppearance } from '@/chart/appearanceStore';
import { IconSettings } from '@/components/icons/ToolIcons';

function TemplateGlyph({
  preview,
  size = 22,
}: {
  preview: readonly string[];
  size?: number;
}) {
  const [bg, bull, bear, accent] = preview;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden
      className="shrink-0 rounded-[3px]"
    >
      <rect width="28" height="28" rx="3" fill={bg} />
      <rect x="5" y="10" width="4" height="10" rx="0.5" fill={bull} />
      <rect x="6.5" y="7" width="1" height="16" fill={bull} />
      <rect x="12" y="8" width="4" height="12" rx="0.5" fill={bear} />
      <rect x="13.5" y="5" width="1" height="18" fill={bear} />
      <rect x="19" y="12" width="4" height="8" rx="0.5" fill={accent ?? bull} />
      <rect x="20.5" y="9" width="1" height="14" fill={accent ?? bull} />
    </svg>
  );
}

function openChartSettings(): void {
  window.dispatchEvent(new CustomEvent('talaria:open-chart-settings'));
}

/**
 * TopBar chart templates menu — full looks (colors, series, grid, volume, chrome)
 * plus a shortcut into Chart settings.
 */
export function ChartTemplatesMenu() {
  const [activeId, setActiveId] = useState<string | null>(() => getActiveTemplateId());
  const [filter, setFilter] = useState<ChartTemplateCategory | 'all'>('all');

  useEffect(() => {
    setActiveId(matchTemplateId(getAppearance()) ?? getActiveTemplateId());
    return subscribeAppearance((a) => {
      setActiveId(matchTemplateId(a) ?? getActiveTemplateId());
    });
  }, []);

  const templates =
    filter === 'all'
      ? CHART_STYLE_TEMPLATES
      : CHART_STYLE_TEMPLATES.filter((t) => t.category === filter);

  const active = activeId ? CHART_STYLE_TEMPLATES.find((t) => t.id === activeId) : undefined;

  return (
    <Popover>
      <Popover.Trigger
        title={active ? `Template: ${active.name}` : 'Chart templates'}
        aria-label="Chart templates"
        className={[
          'inline-flex items-center justify-center gap-1',
          'h-7 min-w-7 px-1.5 [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11',
          'rounded-[3px] text-muted hover:text-foreground hover:bg-background/70 transition-colors',
        ].join(' ')}
      >
        {active ? (
          <TemplateGlyph preview={active.preview} size={18} />
        ) : (
          <TemplateGlyph
            preview={['#0b1220', '#2dd4bf', '#fb7185', '#6366f1']}
            size={18}
          />
        )}
        <span className="hidden lg:inline text-xs font-medium max-w-[5.5rem] truncate">
          {active?.name ?? 'Template'}
        </span>
      </Popover.Trigger>

      <Popover.Content placement="bottom end" className="p-0 z-[100]">
        <Popover.Dialog className="w-[min(22rem,calc(100vw-1.5rem))] bg-surface border border-[color:var(--tv-panel-line)] rounded-lg shadow-[0_8px_28px_rgba(0,0,0,0.22)] overflow-hidden">
          <div className="px-3 pt-2.5 pb-2 border-b border-[color:var(--tv-panel-line)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Chart templates</p>
              <button
                type="button"
                className="text-[11px] text-muted hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  resetChartStyleTemplate();
                  setActiveId(null);
                }}
              >
                Reset
              </button>
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              Full look: candles, grid, volume, scales & chrome colors.
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              <FilterChip
                label="All"
                active={filter === 'all'}
                onClick={() => setFilter('all')}
              />
              {CHART_TEMPLATE_CATEGORIES.map((c) => (
                <FilterChip
                  key={c.id}
                  label={c.label}
                  active={filter === c.id}
                  onClick={() => setFilter(c.id)}
                />
              ))}
            </div>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2 grid grid-cols-2 gap-1.5">
            {templates.map((t) => {
              const selected = activeId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.description}
                  onClick={() => {
                    applyChartStyleTemplate(t.id);
                    setActiveId(t.id);
                  }}
                  className={[
                    'flex flex-col items-stretch gap-1.5 rounded-lg border px-2 py-2 text-left transition-colors',
                    'min-h-11 [@media(hover:none)]:min-h-12',
                    selected
                      ? 'border-accent bg-accent/10'
                      : 'border-[color:var(--tv-panel-line)] hover:border-accent/45 hover:bg-background/55',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <TemplateGlyph preview={t.preview} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-foreground truncate">
                        {t.name}
                      </div>
                      <div className="text-[10px] text-muted truncate">{t.description}</div>
                    </div>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-[2px]">
                    {t.preview.map((c, i) => (
                      <span key={i} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[color:var(--tv-panel-line)] p-1.5">
            <button
              type="button"
              onClick={openChartSettings}
              className="w-full flex items-center gap-2 px-2.5 h-9 [@media(hover:none)]:min-h-11 rounded-md text-sm text-foreground hover:bg-background/70"
            >
              <IconSettings className="w-4 h-4 text-muted" />
              Chart settings…
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2 h-6 rounded-md text-[11px] font-medium transition-colors',
        active
          ? 'bg-accent/15 text-accent'
          : 'text-muted hover:text-foreground hover:bg-background/60',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
