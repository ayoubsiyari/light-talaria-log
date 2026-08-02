import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import {
  getAppearance,
  resetAppearance,
  setAppearance,
} from '@/chart/appearanceStore';
import { ColorSwatches, Row, ToggleRow } from '@/components/drawings/settings/SettingsForm';
import type { ChartAppearance, GridLineStyle } from '@/types/chartAppearance';

type SettingsTab = 'symbol' | 'canvas' | 'layout' | 'scales';

interface ChartSettingsModalProps {
  onClose: () => void;
}

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'symbol', label: 'Symbol', icon: '▮' },
  { id: 'canvas', label: 'Canvas', icon: '✎' },
  { id: 'layout', label: 'Layout', icon: '▣' },
  { id: 'scales', label: 'Scales', icon: '↕' },
];

const LINE_STYLES: { id: GridLineStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

export function ChartSettingsModal({ onClose }: ChartSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('symbol');
  const [snapshot] = useState<ChartAppearance>(() => getAppearance());
  const [draft, setDraft] = useState<ChartAppearance>(snapshot);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAppearance(snapshot);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, snapshot]);

  const cancel = () => {
    setAppearance(snapshot);
    onClose();
  };

  const apply = () => {
    setAppearance(draft);
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
        className="w-full max-w-2xl max-h-[90dvh] flex flex-col sm:flex-row overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <nav className="sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-background/40 p-2 flex sm:flex-col gap-1 overflow-x-auto">
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

        {/* Content */}
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

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {tab === 'symbol' && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Candles</p>
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

            {tab === 'canvas' && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Background
                </p>
                <ColorOrTheme
                  label="Chart background"
                  value={draft.background}
                  onChange={(c) => applyLive({ background: c })}
                  onClear={() => applyLive({ background: null })}
                />

                <p className="text-xs font-semibold text-muted uppercase tracking-wide pt-2">
                  Grid lines
                </p>
                <ToggleRow
                  label="Horizontal grid"
                  checked={draft.showGridH}
                  onChange={(v) => applyLive({ showGridH: v })}
                />
                <ColorOrTheme
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
                    className="min-h-9 bg-background border border-border rounded-md px-2 text-sm"
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
                <ColorOrTheme
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
                    className="min-h-9 bg-background border border-border rounded-md px-2 text-sm"
                  >
                    {LINE_STYLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Row>
              </>
            )}

            {tab === 'layout' && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Chrome colors
                </p>
                <ColorOrTheme
                  label="Top bar"
                  value={draft.topBarBg}
                  onChange={(c) => applyLive({ topBarBg: c })}
                  onClear={() => applyLive({ topBarBg: null })}
                />
                <ColorOrTheme
                  label="Bottom bar"
                  value={draft.bottomBarBg}
                  onChange={(c) => applyLive({ bottomBarBg: c })}
                  onClear={() => applyLive({ bottomBarBg: null })}
                />
                <ColorOrTheme
                  label="Left toolbar"
                  value={draft.toolbarBg}
                  onChange={(c) => applyLive({ toolbarBg: c })}
                  onClear={() => applyLive({ toolbarBg: null })}
                />
                <ColorOrTheme
                  label="Chrome text"
                  value={draft.chromeText}
                  onChange={(c) => applyLive({ chromeText: c })}
                  onClear={() => applyLive({ chromeText: null })}
                />
                <ColorOrTheme
                  label="Panel borders"
                  value={draft.chromeBorder}
                  onChange={(c) => applyLive({ chromeBorder: c })}
                  onClear={() => applyLive({ chromeBorder: null })}
                />
                <p className="text-[11px] text-muted">
                  Clear a color to fall back to the current light/dark theme token.
                </p>
              </>
            )}

            {tab === 'scales' && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Crosshair
                </p>
                <ColorOrTheme
                  label="Crosshair color"
                  value={draft.crosshair}
                  onChange={(c) => applyLive({ crosshair: c })}
                  onClear={() => applyLive({ crosshair: null })}
                />
              </>
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

function CandleColorRow({
  label,
  enabled,
  onEnabledChange,
  up,
  down,
  onUpChange,
  onDownChange,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  up: string;
  down: string;
  onUpChange: (c: string) => void;
  onDownChange: (c: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <ToggleRow label={label} checked={enabled} onChange={onEnabledChange} />
      <div className={enabled ? 'space-y-2' : 'space-y-2 opacity-40 pointer-events-none'}>
        <div>
          <p className="text-[11px] text-muted mb-1">Up</p>
          <ColorSwatches value={up} onChange={onUpChange} />
        </div>
        <div>
          <p className="text-[11px] text-muted mb-1">Down</p>
          <ColorSwatches value={down} onChange={onDownChange} />
        </div>
      </div>
    </div>
  );
}

function ColorOrTheme({
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
      <ColorSwatches value={display} onChange={onChange} />
    </div>
  );
}
