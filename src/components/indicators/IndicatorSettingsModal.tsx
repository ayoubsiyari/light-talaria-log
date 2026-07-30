import { useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { ColorSwatches, Row, ToggleRow } from '@/components/drawings/settings/SettingsForm';
import { getIndicatorDef } from '@/indicators/defs';
import { seriesLabelsFor } from '@/indicators/seriesLabels';
import { colorsForIndicator } from '@/indicators/themeColors';
import { getChartColors } from '@/chart/chartTheme';
import type { EnabledIndicator, IndicatorParams, ParamField } from '@/types/indicator';

type SettingsTab = 'inputs' | 'style' | 'visibility';

interface IndicatorSettingsModalProps {
  indicator: EnabledIndicator;
  onSave: (next: EnabledIndicator) => void;
  onClose: () => void;
}

export function IndicatorSettingsModal({
  indicator,
  onSave,
  onClose,
}: IndicatorSettingsModalProps) {
  const def = getIndicatorDef(indicator.id);
  const themeDefaults = useMemo(
    () => colorsForIndicator(indicator.id, getChartColors()),
    [indicator.id],
  );
  const labels = useMemo(() => seriesLabelsFor(indicator.id), [indicator.id]);

  const [tab, setTab] = useState<SettingsTab>('inputs');
  const [draftParams, setDraftParams] = useState<IndicatorParams>({
    ...def.defaultParams,
    ...indicator.params,
  });
  const [draftColors, setDraftColors] = useState<string[]>(() =>
    padColors(indicator.colors ?? themeDefaults, def.seriesCount, themeDefaults),
  );
  const [draftVisible, setDraftVisible] = useState(indicator.visible !== false);
  const [draftLineWidth, setDraftLineWidth] = useState(indicator.lineWidth ?? 1.5);

  useEffect(() => {
    setDraftParams({ ...def.defaultParams, ...indicator.params });
    setDraftColors(padColors(indicator.colors ?? themeDefaults, def.seriesCount, themeDefaults));
    setDraftVisible(indicator.visible !== false);
    setDraftLineWidth(indicator.lineWidth ?? 1.5);
    setTab('inputs');
  }, [indicator, def.defaultParams, def.seriesCount, themeDefaults]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'inputs', label: 'Inputs' },
    { id: 'style', label: 'Style' },
    { id: 'visibility', label: 'Visibility' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={`${def.label} settings`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85dvh] overflow-auto rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-border bg-surface">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground truncate">{def.label}</h2>
              <p className="text-[11px] text-muted">{def.category}</p>
            </div>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-md text-muted hover:text-foreground hover:bg-background/70"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  'min-h-9 px-3 rounded-md text-xs font-medium shrink-0',
                  tab === t.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted hover:text-foreground hover:bg-background/60',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <div className="px-4 py-3 space-y-3 min-h-[12rem]">
          {tab === 'inputs' && (
            <>
              {def.fields.length === 0 ? (
                <p className="text-sm text-muted py-2">No adjustable inputs for this indicator.</p>
              ) : (
                def.fields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    value={draftParams[field.key] ?? def.defaultParams[field.key]}
                    onChange={(v) =>
                      setDraftParams((prev) => ({ ...prev, [field.key]: v }))
                    }
                  />
                ))
              )}
            </>
          )}

          {tab === 'style' && (
            <>
              <Row label="Line width">
                <input
                  type="number"
                  min={1}
                  max={6}
                  step={0.5}
                  value={draftLineWidth}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setDraftLineWidth(Math.min(6, Math.max(1, n)));
                  }}
                  className="w-20 min-h-9 bg-background border border-border rounded-md px-2 text-sm tabular-nums outline-none"
                />
              </Row>
              {labels.map((label, i) => (
                <div key={`${label}-${i}`} className="space-y-1.5">
                  <p className="text-xs text-muted">{label}</p>
                  <ColorSwatches
                    value={draftColors[i] ?? themeDefaults[i] ?? '#006fee'}
                    onChange={(c) => {
                      setDraftColors((prev) => {
                        const next = [...prev];
                        while (next.length < def.seriesCount) {
                          next.push(themeDefaults[next.length] ?? '#006fee');
                        }
                        next[i] = c;
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 w-full"
                onPress={() => setDraftColors([...themeDefaults])}
              >
                Reset colors to theme
              </Button>
            </>
          )}

          {tab === 'visibility' && (
            <>
              <ToggleRow
                label="Show on chart"
                checked={draftVisible}
                onChange={setDraftVisible}
              />
              <p className="text-xs text-muted">
                Hidden indicators stay in the legend. Use the eye icon for a quick toggle, or
                remove with the trash icon.
              </p>
            </>
          )}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3">
          <Button variant="secondary" size="sm" className="min-h-11" onPress={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="min-h-11"
            onPress={() => {
              onSave({
                id: indicator.id,
                params: draftParams,
                visible: draftVisible,
                colors: draftColors,
                lineWidth: draftLineWidth,
              });
              onClose();
            }}
          >
            Apply
          </Button>
        </footer>
      </div>
    </div>
  );
}

function padColors(colors: readonly string[], count: number, fallback: readonly string[]): string[] {
  const out = colors.slice(0, count);
  while (out.length < count) {
    out.push(fallback[out.length] ?? fallback[0] ?? '#006fee');
  }
  return out;
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: number | string | boolean | undefined;
  onChange: (v: number | string | boolean) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <ToggleRow label={field.label} checked={Boolean(value)} onChange={onChange} />
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">{field.label}</span>
        <select
          value={String(value ?? '')}
          onChange={(e) => {
            const opt = field.options!.find((o) => String(o.value) === e.target.value);
            onChange(opt?.value ?? e.target.value);
          }}
          className="min-h-11 bg-background border border-border rounded-md px-3 text-sm outline-none"
        >
          {field.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{field.label}</span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={typeof value === 'number' ? value : Number(value) || 0}
        onChange={(e) => {
          let n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          if (field.min != null) n = Math.max(field.min, n);
          if (field.max != null) n = Math.min(field.max, n);
          onChange(n);
        }}
        className="min-h-11 bg-background border border-border rounded-md px-3 text-sm tabular-nums outline-none"
      />
    </label>
  );
}
