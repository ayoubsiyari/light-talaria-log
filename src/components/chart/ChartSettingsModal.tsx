import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import {
  getAppearance,
  resetAppearance,
  setAppearance,
} from '@/chart/appearanceStore';
import { CHART_STYLE_TEMPLATES } from '@/chart/chartStyleTemplates';
import { getTheme, setTheme, type ThemeMode } from '@/theme/theme';
import {
  ColorSwatches,
  Row,
  SectionTitle,
  ToggleRow,
  fieldClass,
} from '@/components/drawings/settings/SettingsForm';
import type {
  AppearanceCrosshairMode,
  AppearanceSeriesType,
  ChartAppearance,
  GridLineStyle,
  LastPriceLineStyle,
} from '@/types/chartAppearance';

type SettingsTab = 'symbol' | 'status' | 'scales' | 'canvas' | 'layout';

interface ChartSettingsModalProps {
  onClose: () => void;
}

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'symbol', label: 'Symbol', icon: '▮' },
  { id: 'status', label: 'Status line', icon: '≡' },
  { id: 'scales', label: 'Scales & lines', icon: '↕' },
  { id: 'canvas', label: 'Canvas', icon: '✎' },
  { id: 'layout', label: 'Layout', icon: '▣' },
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/70 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Chart settings"
      onClick={cancel}
    >
      <div
        className="w-full max-w-3xl max-h-[92dvh] flex flex-col sm:flex-row overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="sm:w-48 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-background/40 p-2 flex sm:flex-col gap-1 overflow-x-auto">
          <p className="hidden sm:block px-2 py-2 text-xs font-semibold text-muted uppercase tracking-wide">
            Settings
          </p>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'flex items-center gap-2 min-h-11 px-3 rounded-md text-sm text-left shrink-0',
                tab === t.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-background/70',
              ].join(' ')}
            >
              <span className="opacity-70 w-4 text-center">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-foreground">
              {TABS.find((t) => t.id === tab)?.label ?? 'Settings'}
            </h2>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-full text-muted hover:text-foreground hover:bg-background/70"
              aria-label="Close"
              onClick={cancel}
            >
              ✕
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
          </div>

          <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              onPress={() => {
                resetAppearance();
                setDraft(getAppearance());
                setThemeLocal('dark');
                setTheme('dark');
              }}
            >
              Reset defaults
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="min-h-11" onPress={cancel}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" className="min-h-11" onPress={apply}>
                OK
              </Button>
            </div>
          </footer>
        </div>
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
      <SectionTitle>Style templates</SectionTitle>
      <p className="text-[11px] text-muted -mt-1 mb-1">
        Apply a candle + background look. You can still tweak colors below.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CHART_STYLE_TEMPLATES.map((t) => {
          const [bg, bull, bear] = t.preview;
          const active =
            draft.background?.toLowerCase() === bg.toLowerCase() &&
            draft.upBody.toLowerCase().startsWith(bull.toLowerCase()) &&
            draft.downBody.toLowerCase().startsWith(bear.toLowerCase());
          return (
            <button
              key={t.id}
              type="button"
              title={`Apply ${t.name}`}
              onClick={() => {
                applyLive(t.patch);
                onThemeChange(t.theme);
              }}
              className={[
                'rounded-lg border px-2 py-2 text-left transition-colors min-h-11',
                active
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50 hover:bg-background/60',
              ].join(' ')}
            >
              <div className="flex h-5 overflow-hidden rounded-sm mb-1.5">
                <span className="flex-1" style={{ background: bg }} />
                <span className="w-1/3" style={{ background: bull }} />
                <span className="w-1/3" style={{ background: bear }} />
              </div>
              <span className="text-[11px] font-medium text-foreground">
                {t.name}
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
    <div className="space-y-2 rounded-lg border border-border p-3">
      {hideToggle ? (
        <p className="text-sm text-foreground">{label}</p>
      ) : (
        <ToggleRow label={label} checked={enabled} onChange={onEnabledChange} />
      )}
      <div className={enabled ? 'space-y-2' : 'space-y-2 opacity-40 pointer-events-none'}>
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
          className="h-9 w-11 cursor-pointer rounded border border-border bg-background p-0.5"
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
