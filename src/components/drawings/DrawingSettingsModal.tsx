import { useEffect, useMemo, useState } from 'react';
import type { Drawing, DrawingPoint } from '@/drawings/drawingStore';
import {
  LINE_WIDTHS,
  type DrawingStyle,
  type ExtendMode,
  type LineStyleKind,
} from '@/drawings/drawingStyle';
import { getTool } from '@/drawings/toolRegistry';
import { getToolSettings, resolveMeta } from '@/drawings/toolSettings';
import {
  ColorSwatches,
  fieldClass,
  Row,
  ToggleRow,
} from '@/components/drawings/settings/SettingsForm';
import { ToolInputsPanel } from '@/components/drawings/settings/ToolInputsPanel';

type SettingsTab = 'style' | 'inputs' | 'text' | 'coordinates' | 'visibility';

interface DrawingSettingsModalProps {
  drawing: Drawing;
  onChange: (next: Drawing) => void;
  onClose: () => void;
}

const EXTEND_OPTIONS: { id: ExtendMode; label: string }[] = [
  { id: 'none', label: 'Do not extend' },
  { id: 'left', label: 'Extend left' },
  { id: 'right', label: 'Extend right' },
  { id: 'both', label: 'Extend both' },
];

const LINE_STYLES: { id: LineStyleKind; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

/**
 * Shared settings shell for every drawing tool.
 * Same chrome (header / tabs / footer); Style + Inputs content driven by tool settings.
 */
export function DrawingSettingsModal({
  drawing,
  onChange,
  onClose,
}: DrawingSettingsModalProps) {
  const tool = getTool(drawing.type);
  const settings = useMemo(() => getToolSettings(drawing.type), [drawing.type]);
  const [tab, setTab] = useState<SettingsTab>('style');
  const [draft, setDraft] = useState<Drawing>(() => ({
    ...drawing,
    meta: resolveMeta(drawing.type, drawing.meta),
  }));

  useEffect(() => {
    setDraft({
      ...drawing,
      meta: resolveMeta(drawing.type, drawing.meta),
    });
    setTab('style');
  }, [drawing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs = useMemo(() => {
    const list: { id: SettingsTab; label: string }[] = [
      { id: 'style', label: 'Style' },
      { id: 'inputs', label: 'Inputs' },
    ];
    if (settings.showTextTab) list.push({ id: 'text', label: 'Text' });
    list.push(
      { id: 'coordinates', label: 'Coordinates' },
      { id: 'visibility', label: 'Visibility' },
    );
    return list;
  }, [settings.showTextTab]);

  const patchStyle = (partial: Partial<DrawingStyle>) => {
    setDraft((d) => ({ ...d, style: { ...d.style, ...partial } }));
  };

  const patchMeta = (partial: Record<string, unknown>) => {
    setDraft((d) => ({ ...d, meta: { ...d.meta, ...partial } }));
  };

  const patchPoint = (index: number, partial: Partial<DrawingPoint>) => {
    setDraft((d) => {
      const points = d.points.map((p, i) => (i === index ? { ...p, ...partial } : p));
      return { ...d, points };
    });
  };

  const apply = () => {
    onChange(draft);
    onClose();
  };

  const showFill = settings.styleSections.includes('fill');
  const showLineExtras = settings.styleSections.includes('lineExtras');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'var(--backdrop, rgba(0,0,0,0.5))' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-xl sm:rounded-xl border border-border bg-surface text-foreground shadow-2xl overflow-hidden flex flex-col max-h-[min(92vh,640px)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{tool.label}</h2>
            <span className="text-muted text-xs shrink-0">Settings</span>
          </div>
          <button
            type="button"
            className="text-muted hover:text-foreground w-10 h-10 sm:w-8 sm:h-8 rounded-md hover:bg-background/70"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-border px-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap min-h-11',
                tab === t.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted hover:text-foreground',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
          {tab === 'style' && (
            <>
              <Row label="Line">
                <ColorSwatches
                  value={draft.style.color}
                  onChange={(c) => patchStyle({ color: c })}
                  limit={8}
                />
                <select
                  value={draft.style.width}
                  onChange={(e) => patchStyle({ width: Number(e.target.value) })}
                  className={fieldClass}
                >
                  {LINE_WIDTHS.map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                </select>
                <select
                  value={draft.style.lineStyle}
                  onChange={(e) =>
                    patchStyle({ lineStyle: e.target.value as LineStyleKind })
                  }
                  className={fieldClass}
                >
                  {LINE_STYLES.map((ls) => (
                    <option key={ls.id} value={ls.id}>
                      {ls.label}
                    </option>
                  ))}
                </select>
              </Row>

              <Row label="Opacity">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={draft.style.opacity}
                  onChange={(e) => patchStyle({ opacity: Number(e.target.value) })}
                  className="w-40 accent-[var(--accent)]"
                />
              </Row>

              {showLineExtras && (
                <>
                  <Row label="Extend">
                    <select
                      value={draft.style.extend}
                      onChange={(e) =>
                        patchStyle({ extend: e.target.value as ExtendMode })
                      }
                      className={`${fieldClass} min-w-[160px]`}
                    >
                      {EXTEND_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <ToggleRow
                    label="Midpoint"
                    checked={draft.style.showMidpoint}
                    onChange={(v) => patchStyle({ showMidpoint: v })}
                  />
                  <ToggleRow
                    label="Price labels"
                    checked={draft.style.showPriceLabels}
                    onChange={(v) => patchStyle({ showPriceLabels: v })}
                  />
                  <div className="flex items-center justify-between gap-3 min-h-10">
                    <span className="text-foreground">Ends</span>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 text-muted text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.style.leftEnd}
                          onChange={(e) => patchStyle({ leftEnd: e.target.checked })}
                          className="accent-[var(--accent)]"
                        />
                        Left
                      </label>
                      <label className="flex items-center gap-1.5 text-muted text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.style.rightEnd}
                          onChange={(e) => patchStyle({ rightEnd: e.target.checked })}
                          className="accent-[var(--accent)]"
                        />
                        Right
                      </label>
                    </div>
                  </div>
                </>
              )}

              {showFill && (
                <>
                  <ToggleRow
                    label="Fill"
                    checked={draft.style.fill}
                    onChange={(v) => patchStyle({ fill: v })}
                  />
                  {draft.style.fill && (
                    <Row label="Fill opacity">
                      <input
                        type="range"
                        min={0.05}
                        max={0.8}
                        step={0.05}
                        value={draft.style.fillOpacity}
                        onChange={(e) =>
                          patchStyle({ fillOpacity: Number(e.target.value) })
                        }
                        className="w-40 accent-[var(--accent)]"
                      />
                    </Row>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'inputs' && (
            <ToolInputsPanel
              type={draft.type}
              panel={settings.toolPanel}
              meta={draft.meta ?? {}}
              onMetaChange={patchMeta}
            />
          )}

          {tab === 'text' && (
            <>
              <label className="block space-y-1">
                <span className="text-muted text-xs uppercase tracking-wide">Label</span>
                <textarea
                  value={draft.text ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                  rows={3}
                  placeholder={tool.needsText ? 'Enter text…' : 'Optional note…'}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground resize-y min-h-[5rem]"
                />
              </label>
              <Row label="Font size">
                <input
                  type="number"
                  min={10}
                  max={28}
                  value={draft.style.fontSize}
                  onChange={(e) => patchStyle({ fontSize: Number(e.target.value) || 12 })}
                  className={`${fieldClass} w-20`}
                />
              </Row>
              <Row label="Text color">
                <ColorSwatches
                  value={draft.style.textColor}
                  onChange={(c) => patchStyle({ textColor: c })}
                />
              </Row>
            </>
          )}

          {tab === 'coordinates' && (
            <div className="space-y-3">
              {draft.points.length === 0 && (
                <p className="text-muted text-sm">No points on this drawing.</p>
              )}
              {draft.points.map((p, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border p-3 space-y-2 bg-background/40"
                >
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Point {i + 1}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-muted text-xs">Time (unix)</span>
                      <input
                        type="number"
                        value={Math.round(p.time)}
                        onChange={(e) =>
                          patchPoint(i, { time: Number(e.target.value) || p.time })
                        }
                        className={`w-full ${fieldClass} tabular-nums`}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-muted text-xs">Price</span>
                      <input
                        type="number"
                        step="any"
                        value={p.price}
                        onChange={(e) =>
                          patchPoint(i, { price: Number(e.target.value) || p.price })
                        }
                        className={`w-full ${fieldClass} tabular-nums`}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'visibility' && (
            <>
              <ToggleRow
                label="Visible on chart"
                checked={draft.visible !== false}
                onChange={(v) => setDraft((d) => ({ ...d, visible: v }))}
              />
              <ToggleRow
                label="Lock drawing"
                checked={!!draft.locked}
                onChange={(v) => setDraft((d) => ({ ...d, locked: v }))}
              />
              <p className="text-xs text-muted">
                Hidden drawings stay saved and can be shown again from this dialog.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-background/30">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2 rounded-md border border-border text-foreground hover:bg-background/80 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="min-h-11 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
