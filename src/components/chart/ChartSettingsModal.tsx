import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import {
  getAppearance,
  resetAppearance,
  setAppearance,
} from '@/chart/appearanceStore';
import {
  CHART_STYLE_TEMPLATES,
  applyChartStyleTemplate,
  matchTemplateId,
} from '@/chart/chartStyleTemplates';
import { getTheme, setTheme, type ThemeMode } from '@/theme/theme';
import {
  Row,
  ToggleRow,
} from '@/components/drawings/settings/SettingsForm';
import { SettColorSwatch } from '@/components/drawings/settings/obsidian/SettColorSwatch';
import { CHART_TIMEZONES } from '@/chart/timezone';
import type {
  AppearanceCrosshairMode,
  AppearanceSeriesType,
  ChartAppearance,
  ChartTimezoneId,
  GridLineStyle,
  LastPriceLineStyle,
} from '@/types/chartAppearance';

type SettingsTab =
  | 'symbol'
  | 'status'
  | 'scales'
  | 'canvas'
  | 'layout'
  | 'trading'
  | 'buttons'
  | 'templates';

interface ChartSettingsModalProps {
  onClose: () => void;
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'symbol', label: 'Candles' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'scales', label: 'Time & scale' },
  { id: 'trading', label: 'Trading' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'templates', label: 'Templates' },
  { id: 'status', label: 'Status line' },
  { id: 'layout', label: 'Layout' },
];

const LINE_STYLES: { id: GridLineStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

const SERIES_TYPES: { id: AppearanceSeriesType; label: string }[] = [
  { id: 'candle', label: 'Candles' },
  { id: 'bar', label: 'Bars' },
  { id: 'line', label: 'Line' },
];

const CROSSHAIR_MODES: { id: AppearanceCrosshairMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'magnet', label: 'Magnet' },
  { id: 'magnetOhlc', label: 'Magnet OHLC' },
  { id: 'hidden', label: 'Hidden' },
];

const selectClass =
  'bg-[color:var(--surface-sunken)] border border-[color:var(--line)] rounded px-2 text-[12px] text-foreground outline-none focus:border-accent';

export function ChartSettingsModal({ onClose }: ChartSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('symbol');
  const [snapshot] = useState<ChartAppearance>(() => getAppearance());
  const [themeSnap] = useState<ThemeMode>(() => getTheme());
  const [draft, setDraft] = useState<ChartAppearance>(snapshot);
  const [theme, setThemeLocal] = useState<ThemeMode>(themeSnap);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAppearance(snapshot);
        setTheme(themeSnap);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, snapshot, themeSnap]);

  const cancel = () => {
    setAppearance(snapshot);
    setTheme(themeSnap);
    onClose();
  };

  const apply = () => {
    setAppearance(draft);
    setTheme(theme);
    onClose();
  };

  const applyLive = (partial: Partial<ChartAppearance>) => {
    const next = { ...draft, ...partial };
    setDraft(next);
    setAppearance(next);
  };

  const applyTemplate = (id: string) => {
    applyChartStyleTemplate(id);
    const t = CHART_STYLE_TEMPLATES.find((x) => x.id === id);
    if (t) {
      setThemeLocal(t.theme);
      setTheme(t.theme);
    }
    setDraft(getAppearance());
  };

  const activeTpl = matchTemplateId(draft) ?? '';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/55 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Chart settings"
      onClick={cancel}
    >
      <div
        data-v9-chrome="1"
        data-sett-v2="1"
        data-sett-v3="1"
        data-sett-compact="1"
        data-chrome-win="chart-settings"
        className="w-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header data-sett-head="">
          <span data-sett-head-title="">Settings</span>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full text-muted hover:text-foreground hover:bg-[color:var(--surface-sunken)]"
            aria-label="Close"
            onClick={cancel}
          >
            ✕
          </button>
        </header>

        <div data-sett-v2-body="">
          <nav data-sett-v2-nav="" data-sett-nav="" aria-label="Settings sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                data-active={tab === t.id ? '1' : undefined}
                data-sett-nav-item={t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div data-sett-v2-main="">
            <div data-sett-v2-pane="">
              {tab === 'symbol' && (
                <SymbolTab draft={draft} applyLive={applyLive} />
              )}
              {tab === 'status' && (
                <StatusTab draft={draft} applyLive={applyLive} />
              )}
              {tab === 'scales' && (
                <ScalesTab draft={draft} applyLive={applyLive} />
              )}
              {tab === 'canvas' && (
                <CanvasTab draft={draft} applyLive={applyLive} />
              )}
              {tab === 'layout' && (
                <LayoutTab
                  draft={draft}
                  applyLive={applyLive}
                  theme={theme}
                  onThemeChange={(m) => {
                    setThemeLocal(m);
                    setTheme(m);
                  }}
                />
              )}
              {tab === 'trading' && (
                <>
                  <SectionH>Trading</SectionH>
                  <ToggleRow
                    label="Show order brackets"
                    checked={true}
                    onChange={() => {}}
                  />
                  <ToggleRow
                    label="Confirm order placement"
                    checked={false}
                    onChange={() => {}}
                  />
                </>
              )}
              {tab === 'buttons' && (
                <>
                  <SectionH>Buttons</SectionH>
                  <ToggleRow
                    label="Place Order CTA"
                    checked={true}
                    onChange={() => {}}
                  />
                  <ToggleRow
                    label="Replay controls"
                    checked={true}
                    onChange={() => {}}
                  />
                  <ToggleRow
                    label="Utility icons"
                    checked={true}
                    onChange={() => {}}
                  />
                </>
              )}
              {tab === 'templates' && (
                <>
                  <SectionH>Templates</SectionH>
                  <p className="text-[11px] text-muted mb-2 -mt-1">
                    Apply a full look, then tweak colors in Candles / Canvas.
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {CHART_STYLE_TEMPLATES.map((t) => {
                      const active = activeTpl === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          data-sett-tpl-row=""
                          data-active={active ? '1' : undefined}
                          title={t.description}
                          onClick={() => applyTemplate(t.id)}
                        >
                          <span data-sett-tpl-strip="" aria-hidden="true">
                            {t.preview.map((c, i) => (
                              <i key={i} style={{ background: c }} />
                            ))}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium truncate">
                              {t.name}
                            </span>
                            <span className="block text-[11px] text-muted truncate">
                              {t.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <footer
          data-sett-foot=""
          data-win-foot=""
          className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--line)] bg-[color:var(--surface)]"
        >
          <label className="flex items-center gap-2 min-w-0 min-h-11">
            <span className="text-[12px] text-muted shrink-0">Template</span>
            <select
              data-sett-select=""
              className={`${selectClass} min-w-0 max-w-[160px]`}
              value={activeTpl}
              aria-label="Chart template"
              onChange={(e) => {
                const id = e.target.value;
                if (id) applyTemplate(id);
              }}
            >
              <option value="">Custom</option>
              {CHART_STYLE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 items-center" data-sett-foot-actions="">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              onPress={() => {
                resetAppearance();
                setDraft(getAppearance());
                setThemeLocal('dark');
                setTheme('dark');
              }}
            >
              Reset
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-10"
              onPress={cancel}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="min-h-10"
              onPress={apply}
            >
              Ok
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SectionH({ children }: { children: ReactNode }) {
  return <div data-sett-section-title="">{children}</div>;
}

function SymbolTab({
  draft,
  applyLive,
}: {
  draft: ChartAppearance;
  applyLive: (p: Partial<ChartAppearance>) => void;
}) {
  return (
    <>
      <SectionH>Candles</SectionH>
      <ToggleRow
        label="Hollow candles (up)"
        checked={draft.hollowCandles}
        onChange={(v) => applyLive({ hollowCandles: v })}
      />
      <ToggleRow
        label="Color based on previous close"
        checked={draft.colorBasedOnPrevClose}
        onChange={(v) => applyLive({ colorBasedOnPrevClose: v })}
      />

      {(draft.seriesType === 'candle' || draft.seriesType === 'bar') && (
        <>
          {draft.seriesType === 'candle' && (
            <>
              <CandleColorRow
                label="Body"
                enabled={draft.showBody}
                onEnabledChange={(v) => applyLive({ showBody: v })}
                up={draft.upBody}
                down={draft.downBody}
                onUpChange={(c) => applyLive({ upBody: c })}
                onDownChange={(c) => applyLive({ downBody: c })}
              />
              <CandleColorRow
                label="Borders"
                enabled={draft.showBorder}
                onEnabledChange={(v) => applyLive({ showBorder: v })}
                up={draft.upBorder}
                down={draft.downBorder}
                onUpChange={(c) => applyLive({ upBorder: c })}
                onDownChange={(c) => applyLive({ downBorder: c })}
              />
              <CandleColorRow
                label="Wick"
                enabled={draft.showWick}
                onEnabledChange={(v) => applyLive({ showWick: v })}
                up={draft.upWick}
                down={draft.downWick}
                onUpChange={(c) => applyLive({ upWick: c })}
                onDownChange={(c) => applyLive({ downWick: c })}
              />
            </>
          )}
          {draft.seriesType === 'bar' && (
            <CandleColorRow
              label="Bar colors"
              enabled
              onEnabledChange={() => undefined}
              hideToggle
              up={draft.upBody}
              down={draft.downBody}
              onUpChange={(c) =>
                applyLive({
                  upBody: c,
                  upBorder: c,
                  upWick: c,
                })
              }
              onDownChange={(c) =>
                applyLive({
                  downBody: c,
                  downBorder: c,
                  downWick: c,
                })
              }
            />
          )}
        </>
      )}

      <SectionH>Chart type</SectionH>
      <Row label="Series">
        <select
          data-sett-select=""
          value={draft.seriesType}
          onChange={(e) =>
            applyLive({ seriesType: e.target.value as AppearanceSeriesType })
          }
          className={selectClass}
        >
          {SERIES_TYPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>

      {draft.seriesType === 'line' && (
        <>
          <ColorField
            label="Line color"
            value={draft.lineColor}
            onChange={(c) => applyLive({ lineColor: c })}
            onClear={() => applyLive({ lineColor: null })}
          />
          <Row label="Line width">
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={draft.lineWidth}
              onChange={(e) => applyLive({ lineWidth: Number(e.target.value) })}
              className="w-28 accent-[var(--accent)]"
            />
            <span className="text-[12px] text-muted tabular-nums w-4">
              {draft.lineWidth}
            </span>
          </Row>
        </>
      )}

      <SectionH>Volume</SectionH>
      <ToggleRow
        label="Show volume"
        checked={draft.showVolume}
        onChange={(v) => applyLive({ showVolume: v })}
      />
      <Row label="Volume opacity">
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={draft.volumeOpacity}
          disabled={!draft.showVolume}
          onChange={(e) => applyLive({ volumeOpacity: Number(e.target.value) })}
          className="w-28 accent-[var(--accent)]"
        />
        <span className="text-[12px] text-muted tabular-nums w-9">
          {Math.round(draft.volumeOpacity * 100)}%
        </span>
      </Row>
    </>
  );
}

function StatusTab({
  draft,
  applyLive,
}: {
  draft: ChartAppearance;
  applyLive: (p: Partial<ChartAppearance>) => void;
}) {
  return (
    <>
      <SectionH>Status line</SectionH>
      <ToggleRow
        label="Symbol"
        checked={draft.statusShowSymbol}
        onChange={(v) => applyLive({ statusShowSymbol: v })}
      />
      <ToggleRow
        label="Interval"
        checked={draft.statusShowInterval}
        onChange={(v) => applyLive({ statusShowInterval: v })}
      />
      <ToggleRow
        label="OHLC values"
        checked={draft.statusShowOhlc}
        onChange={(v) => applyLive({ statusShowOhlc: v })}
      />
      <ToggleRow
        label="Bar change %"
        checked={draft.statusShowChange}
        onChange={(v) => applyLive({ statusShowChange: v })}
      />
      <ToggleRow
        label="Volume"
        checked={draft.statusShowVolumeLegend}
        onChange={(v) => applyLive({ statusShowVolumeLegend: v })}
      />
    </>
  );
}

function ScalesTab({
  draft,
  applyLive,
}: {
  draft: ChartAppearance;
  applyLive: (p: Partial<ChartAppearance>) => void;
}) {
  return (
    <>
      <SectionH>Crosshair</SectionH>
      <Row label="Mode">
        <select
          data-sett-select=""
          value={draft.crosshairMode}
          onChange={(e) =>
            applyLive({
              crosshairMode: e.target.value as AppearanceCrosshairMode,
            })
          }
          className={selectClass}
        >
          {CROSSHAIR_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>
      <ColorField
        label="Crosshair"
        value={draft.crosshair}
        onChange={(c) => applyLive({ crosshair: c })}
        onClear={() => applyLive({ crosshair: null })}
      />

      <SectionH>Last price line</SectionH>
      <ToggleRow
        label="Show last price line"
        checked={draft.showLastPrice}
        onChange={(v) => applyLive({ showLastPrice: v })}
      />
      <ToggleRow
        label="Price label on axis"
        checked={draft.showLastPriceLabel}
        onChange={(v) => applyLive({ showLastPriceLabel: v })}
      />
      <Row label="Line style">
        <select
          data-sett-select=""
          value={draft.lastPriceLineStyle}
          onChange={(e) =>
            applyLive({
              lastPriceLineStyle: e.target.value as LastPriceLineStyle,
            })
          }
          className={selectClass}
          disabled={!draft.showLastPrice}
        >
          {LINE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>

      <SectionH>Scales</SectionH>
      <ToggleRow
        label="Price scale"
        checked={draft.showPriceScale}
        onChange={(v) => applyLive({ showPriceScale: v })}
      />
      <ToggleRow
        label="Time scale"
        checked={draft.showTimeScale}
        onChange={(v) => applyLive({ showTimeScale: v })}
      />
      <Row label="Timezone">
        <select
          data-sett-select=""
          value={draft.timezone}
          onChange={(e) =>
            applyLive({
              timezone: e.target.value as ChartTimezoneId,
            })
          }
          className={`${selectClass} max-w-[200px]`}
          aria-label="Chart timezone"
        >
          {CHART_TIMEZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </Row>
      <ColorField
        label="Axis labels"
        value={draft.axisText}
        onChange={(c) => applyLive({ axisText: c })}
        onClear={() => applyLive({ axisText: null })}
      />
    </>
  );
}

function CanvasTab({
  draft,
  applyLive,
}: {
  draft: ChartAppearance;
  applyLive: (p: Partial<ChartAppearance>) => void;
}) {
  return (
    <>
      <SectionH>Chart basic styles</SectionH>
      <ColorField
        label="Background"
        value={draft.background}
        onChange={(c) => applyLive({ background: c })}
        onClear={() => applyLive({ background: null })}
      />
      <ColorStyleRow
        label="Vert grid lines"
        color={draft.gridVertical}
        onColor={(c) => applyLive({ gridVertical: c })}
        onClearColor={() => applyLive({ gridVertical: null })}
        style={draft.gridVStyle}
        onStyle={(s) => applyLive({ gridVStyle: s })}
        enabled={draft.showGridV}
        onEnabled={(v) => applyLive({ showGridV: v })}
      />
      <ColorStyleRow
        label="Horz grid lines"
        color={draft.gridHorizontal}
        onColor={(c) => applyLive({ gridHorizontal: c })}
        onClearColor={() => applyLive({ gridHorizontal: null })}
        style={draft.gridHStyle}
        onStyle={(s) => applyLive({ gridHStyle: s })}
        enabled={draft.showGridH}
        onEnabled={(v) => applyLive({ showGridH: v })}
      />

      <SectionH>Watermark</SectionH>
      <ToggleRow
        label="Show watermark"
        checked={draft.watermarkEnabled}
        onChange={(v) => applyLive({ watermarkEnabled: v })}
      />
      <Row label="Text">
        <input
          type="text"
          value={draft.watermarkText}
          placeholder="e.g. EURUSD"
          disabled={!draft.watermarkEnabled}
          onChange={(e) => applyLive({ watermarkText: e.target.value })}
          className={`${selectClass} w-36 min-h-9 sm:min-h-[28px]`}
        />
      </Row>
      <ColorField
        label="Watermark"
        value={draft.watermarkColor}
        onChange={(c) => applyLive({ watermarkColor: c })}
        onClear={() => applyLive({ watermarkColor: null })}
      />
      <Row label="Opacity">
        <input
          type="range"
          min={0.02}
          max={0.5}
          step={0.02}
          value={draft.watermarkOpacity}
          disabled={!draft.watermarkEnabled}
          onChange={(e) =>
            applyLive({ watermarkOpacity: Number(e.target.value) })
          }
          className="w-28 accent-[var(--accent)]"
        />
        <span className="text-[12px] text-muted tabular-nums w-9">
          {Math.round(draft.watermarkOpacity * 100)}%
        </span>
      </Row>
    </>
  );
}

function LayoutTab({
  draft,
  applyLive,
  theme,
  onThemeChange,
}: {
  draft: ChartAppearance;
  applyLive: (p: Partial<ChartAppearance>) => void;
  theme: ThemeMode;
  onThemeChange: (m: ThemeMode) => void;
}) {
  return (
    <>
      <SectionH>Theme</SectionH>
      <Row label="Color theme">
        <select
          data-sett-select=""
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as ThemeMode)}
          className={selectClass}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </Row>

      <SectionH>Chrome</SectionH>
      <ToggleRow
        label="Top bar"
        checked={draft.showTopBar}
        onChange={(v) => applyLive({ showTopBar: v })}
      />
      <ToggleRow
        label="Bottom bar"
        checked={draft.showBottomBar}
        onChange={(v) => applyLive({ showBottomBar: v })}
      />
      <ToggleRow
        label="Left toolbar"
        checked={draft.showToolbar}
        onChange={(v) => applyLive({ showToolbar: v })}
      />

      <SectionH>Accent</SectionH>
      <ColorField
        label="Accent"
        value={draft.accent}
        onChange={(c) => applyLive({ accent: c, accentForeground: null })}
        onClear={() => applyLive({ accent: null, accentForeground: null })}
      />
      <ColorField
        label="On accent"
        value={draft.accentForeground}
        onChange={(c) => applyLive({ accentForeground: c })}
        onClear={() => applyLive({ accentForeground: null })}
      />

      <SectionH>Chrome colors</SectionH>
      <ColorField
        label="Top bar"
        value={draft.topBarBg}
        onChange={(c) => applyLive({ topBarBg: c })}
        onClear={() => applyLive({ topBarBg: null })}
      />
      <ColorField
        label="Bottom bar"
        value={draft.bottomBarBg}
        onChange={(c) => applyLive({ bottomBarBg: c })}
        onClear={() => applyLive({ bottomBarBg: null })}
      />
      <ColorField
        label="Left toolbar"
        value={draft.toolbarBg}
        onChange={(c) => applyLive({ toolbarBg: c })}
        onClear={() => applyLive({ toolbarBg: null })}
      />
      <ColorField
        label="Chrome text"
        value={draft.chromeText}
        onChange={(c) => applyLive({ chromeText: c })}
        onClear={() => applyLive({ chromeText: null })}
      />
      <ColorField
        label="Borders"
        value={draft.chromeBorder}
        onChange={(c) => applyLive({ chromeBorder: c })}
        onClear={() => applyLive({ chromeBorder: null })}
      />
    </>
  );
}

/** TV-style: checkbox + label left, up/down color wells right. */
function CandleColorRow({
  label,
  enabled,
  onEnabledChange,
  up,
  down,
  onUpChange,
  onDownChange,
  hideToggle,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  up: string;
  down: string;
  onUpChange: (c: string) => void;
  onDownChange: (c: string) => void;
  hideToggle?: boolean;
}) {
  return (
    <div data-sett-row="">
      {hideToggle ? (
        <span data-sett-label="">{label}</span>
      ) : (
        <label
          data-sett-label=""
          className="flex items-center gap-2 cursor-pointer min-w-0"
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="accent-[var(--accent)] w-3.5 h-3.5 rounded-[3px] border border-[color:var(--line)] shrink-0"
          />
          <span className="truncate">{label}</span>
        </label>
      )}
      <div
        data-sett-acts=""
        className={enabled ? undefined : 'opacity-40 pointer-events-none'}
      >
        <SettColorSwatch
          color={up}
          showOpacity={false}
          title={`${label} up`}
          onChange={({ color }) => {
            if (color) onUpChange(color);
          }}
        />
        <SettColorSwatch
          color={down}
          showOpacity={false}
          title={`${label} down`}
          onChange={({ color }) => {
            if (color) onDownChange(color);
          }}
        />
      </div>
    </div>
  );
}

/** Label left, single color well right (theme default = muted well). */
function ColorField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string | null;
  onChange: (c: string) => void;
  onClear: () => void;
}) {
  const display = value ?? '#787B86';
  return (
    <div data-sett-row="">
      <span data-sett-label="">{label}</span>
      <div data-sett-acts="">
        {value == null && (
          <button
            type="button"
            className="text-[11px] text-muted hover:text-foreground min-h-9 px-1"
            onClick={() => onChange(display)}
            title="Override theme default"
          >
            Theme
          </button>
        )}
        <SettColorSwatch
          color={display}
          showOpacity={false}
          title={label}
          opacity={value == null ? 0.55 : 1}
          onChange={({ color }) => {
            if (color) onChange(color);
          }}
        />
        {value != null && (
          <button
            type="button"
            className="text-[11px] text-muted hover:text-foreground min-h-9 px-1"
            onClick={onClear}
            title="Use theme default"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/** Grid line row: enable + color well + style select (TV canvas pattern). */
function ColorStyleRow({
  label,
  color,
  onColor,
  onClearColor,
  style,
  onStyle,
  enabled,
  onEnabled,
}: {
  label: string;
  color: string | null;
  onColor: (c: string) => void;
  onClearColor: () => void;
  style: GridLineStyle;
  onStyle: (s: GridLineStyle) => void;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
}) {
  const display = color ?? '#787B86';
  return (
    <div data-sett-row="">
      <label
        data-sett-label=""
        className="flex items-center gap-2 cursor-pointer min-w-0"
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabled(e.target.checked)}
          className="accent-[var(--accent)] w-3.5 h-3.5 rounded-[3px] border border-[color:var(--line)] shrink-0"
        />
        <span className="truncate">{label}</span>
      </label>
      <div
        data-sett-acts=""
        className={enabled ? undefined : 'opacity-40 pointer-events-none'}
      >
        <SettColorSwatch
          color={display}
          showOpacity={false}
          title={`${label} color`}
          opacity={color == null ? 0.55 : 1}
          onChange={({ color: c }) => {
            if (c) onColor(c);
          }}
        />
        <select
          data-sett-select=""
          value={style}
          onChange={(e) => onStyle(e.target.value as GridLineStyle)}
          className={selectClass}
          aria-label={`${label} style`}
        >
          {LINE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {color != null && (
          <button
            type="button"
            className="text-[11px] text-muted hover:text-foreground min-h-9 px-1"
            onClick={onClearColor}
            title="Use theme default"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
