import { useEffect, useState } from 'react';
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
  ColorSwatches,
  Row,
  SectionTitle,
  ToggleRow,
  fieldClass,
} from '@/components/drawings/settings/SettingsForm';
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

  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? 'Settings';

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
        data-chrome-win="chart-settings"
        className="w-full flex flex-col overflow-hidden rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body: nav | pane — must stay a row (see chrome-rebuild [data-sett-v2-body]) */}
        <div data-sett-v2-body="">
          <nav data-sett-v2-nav="" data-sett-nav="" aria-label="Chart settings sections">
            <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-semibold text-muted uppercase tracking-wide">
              Chart settings
            </p>
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
            <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[color:var(--line)] shrink-0">
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                {tabLabel}
              </h2>
              <button
                type="button"
                className="min-h-11 min-w-11 rounded-md text-muted hover:text-foreground hover:bg-[color:var(--surface-sunken)]"
                aria-label="Close"
                onClick={cancel}
              >
                ✕
              </button>
            </header>

            <div data-sett-v2-pane="" className="px-4 py-3 space-y-3">
              {tab === 'symbol' && (
                <SymbolTab
                  draft={draft}
                  applyLive={applyLive}
                  onThemeChange={(m) => {
                    setThemeLocal(m);
                    setTheme(m);
                  }}
                />
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
                <div className="space-y-3">
                  <SectionTitle>Trading</SectionTitle>
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
                  <p className="text-[11px] text-muted">
                    Stub toggles — wire to trading prefs later.
                  </p>
                </div>
              )}
              {tab === 'buttons' && (
                <div className="space-y-3">
                  <SectionTitle>Buttons</SectionTitle>
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
                  <p className="text-[11px] text-muted">
                    Stub visibility — wire to chrome prefs later.
                  </p>
                </div>
              )}
              {tab === 'templates' && (
                <div className="space-y-2">
                  <SectionTitle>Templates</SectionTitle>
                  <p className="text-[11px] text-muted -mt-1">
                    Full look presets. Apply, then tweak in Candles / Canvas /
                    Layout.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CHART_STYLE_TEMPLATES.map((t) => {
                      const active = matchTemplateId(draft) === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          title={t.description}
                          className={[
                            'rounded-lg border px-2.5 py-2 text-left transition-colors min-h-11',
                            active
                              ? 'border-accent bg-accent/10'
                              : 'border-[color:var(--line)] hover:border-accent/50 hover:bg-[color:var(--surface-sunken)]',
                          ].join(' ')}
                          onClick={() => {
                            applyChartStyleTemplate(t.id);
                            setThemeLocal(t.theme);
                            setTheme(t.theme);
                            setDraft(getAppearance());
                          }}
                        >
                          <div className="flex h-5 overflow-hidden rounded-sm mb-1.5">
                            {t.preview.map((c, i) => (
                              <span
                                key={i}
                                className="flex-1"
                                style={{ background: c }}
                              />
                            ))}
                          </div>
                          <span className="text-[12px] font-medium text-foreground block truncate">
                            {t.name}
                          </span>
                          <span className="text-[10px] text-muted block truncate">
                            {t.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer
          data-sett-foot=""
          data-win-foot=""
          className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--line)] px-4 py-2.5 bg-[color:var(--surface)]"
        >
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
            Reset defaults
          </Button>
          <div className="flex gap-2" data-sett-foot-actions="">
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
              OK
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SymbolTab({
  draft,
  applyLive,
  onThemeChange,
}: {
  draft: ChartAppearance;
  applyLive: (p: Partial<ChartAppearance>) => void;
  onThemeChange: (m: ThemeMode) => void;
}) {
  return (
    <>
      <SectionTitle>Chart templates</SectionTitle>
      <p className="text-[11px] text-muted -mt-1 mb-1">
        Full look: candles, grid, volume, chrome, buttons & selection. Tweak
        below after applying.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CHART_STYLE_TEMPLATES.map((t) => {
          const active = matchTemplateId(draft) === t.id;
          return (
            <button
              key={t.id}
              type="button"
              title={t.description}
              onClick={() => {
                applyChartStyleTemplate(t.id);
                onThemeChange(t.theme);
                applyLive({ ...getAppearance() });
              }}
              className={[
                'rounded-lg border px-2 py-2 text-left transition-colors min-h-11',
                active
                  ? 'border-accent bg-accent/10'
                  : 'border-[color:var(--line)] hover:border-accent/50 hover:bg-[color:var(--surface-sunken)]',
              ].join(' ')}
            >
              <div className="flex h-5 overflow-hidden rounded-sm mb-1.5">
                {t.preview.map((c, i) => (
                  <span key={i} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <span className="text-[11px] font-medium text-foreground block truncate">
                {t.name}
              </span>
              <span className="text-[10px] text-muted block truncate">
                {t.description}
              </span>
            </button>
          );
        })}
      </div>

      <SectionTitle>Chart type</SectionTitle>
      <Row label="Series">
        <select
          value={draft.seriesType}
          onChange={(e) =>
            applyLive({ seriesType: e.target.value as AppearanceSeriesType })
          }
          className={`${fieldClass} min-h-9`}
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
              className="w-32 accent-[var(--accent)]"
            />
            <span className="text-xs text-muted w-4">{draft.lineWidth}</span>
          </Row>
        </>
      )}

      {(draft.seriesType === 'candle' || draft.seriesType === 'bar') && (
        <>
          <SectionTitle>Candles / bars</SectionTitle>
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

      <SectionTitle>Volume</SectionTitle>
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
          className="w-32 accent-[var(--accent)]"
        />
        <span className="text-xs text-muted w-10">
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
      <SectionTitle>Legend</SectionTitle>
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
        label="Volume legend control"
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
      <SectionTitle>Crosshair</SectionTitle>
      <Row label="Mode">
        <select
          value={draft.crosshairMode}
          onChange={(e) =>
            applyLive({
              crosshairMode: e.target.value as AppearanceCrosshairMode,
            })
          }
          className={`${fieldClass} min-h-9`}
        >
          {CROSSHAIR_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>
      <ColorField
        label="Crosshair color"
        value={draft.crosshair}
        onChange={(c) => applyLive({ crosshair: c })}
        onClear={() => applyLive({ crosshair: null })}
      />

      <SectionTitle>Last price line</SectionTitle>
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
          value={draft.lastPriceLineStyle}
          onChange={(e) =>
            applyLive({
              lastPriceLineStyle: e.target.value as LastPriceLineStyle,
            })
          }
          className={`${fieldClass} min-h-9`}
          disabled={!draft.showLastPrice}
        >
          {LINE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>

      <SectionTitle>Axes</SectionTitle>
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
          value={draft.timezone}
          onChange={(e) =>
            applyLive({
              timezone: e.target.value as ChartTimezoneId,
            })
          }
          className={`${fieldClass} min-h-11`}
          aria-label="Chart timezone"
        >
          {CHART_TIMEZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </Row>
      <p className="text-xs text-muted px-1 -mt-1 mb-2">
        Axis, crosshair, and replay clock labels. Bar data stays UTC.
      </p>
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
      <SectionTitle>Background</SectionTitle>
      <ColorField
        label="Chart background"
        value={draft.background}
        onChange={(c) => applyLive({ background: c })}
        onClear={() => applyLive({ background: null })}
      />

      <SectionTitle>Grid</SectionTitle>
      <ToggleRow
        label="Horizontal grid"
        checked={draft.showGridH}
        onChange={(v) => applyLive({ showGridH: v })}
      />
      <ColorField
        label="Horizontal color"
        value={draft.gridHorizontal}
        onChange={(c) => applyLive({ gridHorizontal: c })}
        onClear={() => applyLive({ gridHorizontal: null })}
      />
      <Row label="Horizontal style">
        <select
          value={draft.gridHStyle}
          onChange={(e) =>
            applyLive({ gridHStyle: e.target.value as GridLineStyle })
          }
          className={`${fieldClass} min-h-9`}
        >
          {LINE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>
      <ToggleRow
        label="Vertical grid"
        checked={draft.showGridV}
        onChange={(v) => applyLive({ showGridV: v })}
      />
      <ColorField
        label="Vertical color"
        value={draft.gridVertical}
        onChange={(c) => applyLive({ gridVertical: c })}
        onClear={() => applyLive({ gridVertical: null })}
      />
      <Row label="Vertical style">
        <select
          value={draft.gridVStyle}
          onChange={(e) =>
            applyLive({ gridVStyle: e.target.value as GridLineStyle })
          }
          className={`${fieldClass} min-h-9`}
        >
          {LINE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>

      <SectionTitle>Watermark</SectionTitle>
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
          className={`${fieldClass} min-h-9 w-40`}
        />
      </Row>
      <ColorField
        label="Watermark color"
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
          className="w-32 accent-[var(--accent)]"
        />
        <span className="text-xs text-muted w-10">
          {Math.round(draft.watermarkOpacity * 100)}%
        </span>
      </Row>
      <Row label="Size">
        <input
          type="range"
          min={20}
          max={96}
          step={2}
          value={draft.watermarkFontSize}
          disabled={!draft.watermarkEnabled}
          onChange={(e) =>
            applyLive({ watermarkFontSize: Number(e.target.value) })
          }
          className="w-32 accent-[var(--accent)]"
        />
        <span className="text-xs text-muted w-8">{draft.watermarkFontSize}</span>
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
      <SectionTitle>Theme</SectionTitle>
      <Row label="Color theme">
        <select
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as ThemeMode)}
          className={`${fieldClass} min-h-9`}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </Row>

      <SectionTitle>Chrome visibility</SectionTitle>
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

      <SectionTitle>Accent / selection</SectionTitle>
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
      <p className="text-[11px] text-muted -mt-1 mb-1">
        Buttons, timeframe chip, tool selection, focus rings. Clear to use theme
        default.
      </p>

      <SectionTitle>Chrome colors</SectionTitle>
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
        label="Panel borders"
        value={draft.chromeBorder}
        onChange={(c) => applyLive({ chromeBorder: c })}
        onClear={() => applyLive({ chromeBorder: null })}
      />
      <p className="text-[11px] text-muted">
        Clear a color to fall back to the current light/dark theme token.
      </p>
    </>
  );
}

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
    <div className="space-y-2 rounded-lg border border-[color:var(--line)] p-3">
      {hideToggle ? (
        <p className="text-sm text-foreground">{label}</p>
      ) : (
        <ToggleRow label={label} checked={enabled} onChange={onEnabledChange} />
      )}
      <div
        className={
          enabled ? 'space-y-2' : 'space-y-2 opacity-40 pointer-events-none'
        }
      >
        <div>
          <p className="text-[11px] text-muted mb-1">Up</p>
          <ColorPicker value={up} onChange={onUpChange} />
        </div>
        <div>
          <p className="text-[11px] text-muted mb-1">Down</p>
          <ColorPicker value={down} onChange={onDownChange} />
        </div>
      </div>
    </div>
  );
}

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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground">{label}</span>
        <button
          type="button"
          className="text-[11px] text-muted hover:text-foreground min-h-9 px-2"
          onClick={onClear}
        >
          {value == null ? 'Theme default' : 'Use theme'}
        </button>
      </div>
      <ColorPicker value={display} onChange={onChange} />
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <ColorSwatches value={value} onChange={onChange} />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={toHex6(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 cursor-pointer rounded border border-[color:var(--line)] bg-background p-0.5"
          aria-label="Custom color"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldClass} min-h-9 w-28 font-mono text-xs`}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function toHex6(c: string): string {
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return `#${c.slice(1, 7)}`;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1]!;
    const g = c[2]!;
    const b = c[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#787B86';
}
