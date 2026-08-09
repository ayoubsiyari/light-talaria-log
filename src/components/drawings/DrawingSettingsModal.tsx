import { useEffect, useMemo, useRef, useState } from 'react';
import type { Drawing, DrawingPoint } from '@/drawings/drawingStore';
import {
  INFO_METRIC_OPTIONS,
  type DrawingStyle,
  type ExtendMode,
  type TextAlignH,
  type TextAlignV,
} from '@/drawings/drawingStyle';
import { chromeIconForTool } from '@/drawings/chromeToolIcon';
import { getTool } from '@/drawings/toolRegistry';
import { getToolSettings, resolveMeta } from '@/drawings/toolSettings';
import {
  DRAWING_VISIBILITY_TFS,
  toggleVisibleOnTf,
} from '@/drawings/visibility';
import {
  ColorSwatches,
  fieldClass,
  Row,
  ToggleRow,
} from '@/components/drawings/settings/SettingsForm';
import { SettingsChip } from '@/components/drawings/settings/SettingsChip';
import { ToolInputsPanel } from '@/components/drawings/settings/ToolInputsPanel';
import { DrawingSettingsShell } from '@/components/drawings/settings/DrawingSettingsShell';
import { TemplateMenu } from '@/components/drawings/settings/TemplateMenu';
import { StyleTriggerButton } from '@/components/drawings/settings/StyleTriggerButton';
import {
  LineStylePickerFlyout,
  styleToPickerValue,
} from '@/components/drawings/settings/LineStylePickerFlyout';

type SettingsTab = 'style' | 'inputs' | 'text' | 'coordinates' | 'visibility';

interface DrawingSettingsModalProps {
  drawing: Drawing;
  /** Live preview — called on every draft change. */
  onLiveChange: (next: Drawing) => void;
  /** Cancel — restore snapshot then close. */
  onCancel: (snapshot: Drawing) => void;
  /** OK — keep current draft and close. */
  onOk: (next: Drawing) => void;
}

const ALIGN_V: { id: TextAlignV; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'middle', label: 'Middle' },
  { id: 'bottom', label: 'Bottom' },
];

const ALIGN_H: { id: TextAlignH; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

function cloneDrawing(d: Drawing): Drawing {
  return {
    ...d,
    points: d.points.map((p) => ({ ...p })),
    style: { ...d.style },
    meta: d.meta ? { ...d.meta } : undefined,
  };
}

/** Text tools open on Text; fib on Inputs; everything else Style. */
function initialSettingsTab(type: Drawing['type']): SettingsTab {
  if (getTool(type).needsText) return 'text';
  if (getToolSettings(type).toolPanel === 'fibLevels') return 'inputs';
  return 'style';
}

/**
 * Shared TV-style settings modal for every drawing tool.
 * Live-previews on the chart; Cancel restores the open-time snapshot.
 */
export function DrawingSettingsModal({
  drawing,
  onLiveChange,
  onCancel,
  onOk,
}: DrawingSettingsModalProps) {
  const tool = getTool(drawing.type);
  const settings = useMemo(() => getToolSettings(drawing.type), [drawing.type]);
  const [tab, setTab] = useState<SettingsTab>(() => initialSettingsTab(drawing.type));
  const snapshotRef = useRef<Drawing>(cloneDrawing(drawing));
  const drawingIdRef = useRef(drawing.id);
  const skipLiveRef = useRef(false);

  const [draft, setDraft] = useState<Drawing>(() => ({
    ...cloneDrawing(drawing),
    meta: resolveMeta(drawing.type, drawing.meta),
  }));

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const strokeBtnRef = useRef<HTMLButtonElement>(null);
  const fillBtnRef = useRef<HTMLButtonElement>(null);

  // New selection → reset snapshot + draft + tab.
  useEffect(() => {
    if (drawing.id === drawingIdRef.current) return;
    drawingIdRef.current = drawing.id;
    const next = {
      ...cloneDrawing(drawing),
      meta: resolveMeta(drawing.type, drawing.meta),
    };
    snapshotRef.current = cloneDrawing(next);
    skipLiveRef.current = true;
    setDraft(next);
    setTab(initialSettingsTab(drawing.type));
    setRenaming(false);
    setPickerOpen(false);
    setFillPickerOpen(false);
  }, [drawing]);

  // Stable callbacks — parent may recreate closures each render.
  const liveRef = useRef(onLiveChange);
  liveRef.current = onLiveChange;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Live preview — skip the frame after id-switch reset.
  useEffect(() => {
    if (skipLiveRef.current) {
      skipLiveRef.current = false;
      return;
    }
    liveRef.current(draft);
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelRef.current(snapshotRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showInputs = settings.showInputsTab && settings.toolPanel !== 'generic';
  const showText = settings.showTextTab;
  const showCoords = settings.showCoordsTab !== false;

  const tabs = useMemo(() => {
    const list: { id: SettingsTab; label: string }[] = [
      { id: 'style', label: 'Style' },
    ];
    if (showInputs) list.push({ id: 'inputs', label: 'Inputs' });
    if (showText) list.push({ id: 'text', label: 'Text' });
    if (showCoords) list.push({ id: 'coordinates', label: 'Coordinates' });
    list.push({ id: 'visibility', label: 'Visibility' });
    return list;
  }, [showInputs, showText, showCoords]);

  const displayTitle = draft.name?.trim() || tool.label;

  const patchStyle = (partial: Partial<DrawingStyle>) => {
    setDraft((d) => {
      const style = { ...d.style, ...partial };
      const meta =
        typeof partial.textBold === 'boolean'
          ? { ...d.meta, bold: partial.textBold }
          : d.meta;
      return { ...d, style, meta };
    });
  };

  const patchMeta = (partial: Record<string, unknown>) => {
    setDraft((d) => {
      let points = d.points;
      // Risk/reward: move target (point 2) from entry/stop distance × RR.
      if (
        typeof partial.riskReward === 'number' &&
        (d.type === 'longPosition' || d.type === 'shortPosition') &&
        d.points[0] &&
        d.points[1] &&
        d.points[2]
      ) {
        const entry = d.points[0].price;
        const stop = d.points[1].price;
        const risk = stop - entry;
        const targetPrice = entry - risk * partial.riskReward;
        points = d.points.map((p, i) =>
          i === 2 ? { ...p, price: targetPrice } : p,
        );
      }
      // Text-tool Bold input mirrors Style textBold.
      let style = d.style;
      if (typeof partial.bold === 'boolean') {
        style = { ...d.style, textBold: partial.bold };
      }
      return { ...d, points, style, meta: { ...d.meta, ...partial } };
    });
  };

  const patchPoint = (index: number, partial: Partial<DrawingPoint>) => {
    setDraft((d) => {
      const points = d.points.map((p, i) => (i === index ? { ...p, ...partial } : p));
      return { ...d, points };
    });
  };

  const showFill = settings.styleSections.includes('fill');
  const showLineExtras = settings.styleSections.includes('lineExtras');
  const isBrushTool = draft.type === 'brush' || draft.type === 'highlighter';
  const isHighlighter = draft.type === 'highlighter';
  /** Obsidian Extend chips — line / channel / fib (not brush/highlighter/vline). */
  const showExtendChips =
    showLineExtras &&
    !isBrushTool &&
    draft.type !== 'vline' &&
    draft.type !== 'hline';
  /** Labels Price/Time chips (Obsidian) — most overlay tools. */
  const showPriceChip = draft.type !== 'vline' && draft.type !== 'text';
  const showTimeChip =
    draft.type !== 'hline' &&
    draft.type !== 'horizontalRay' &&
    draft.type !== 'text';
  /** Show Info — classic trendline family only. */
  const showInfoRow =
    draft.type === 'trendLine' ||
    draft.type === 'infoLine' ||
    draft.type === 'datePriceRange';

  const extendLeft =
    draft.style.extend === 'left' || draft.style.extend === 'both';
  const extendRight =
    draft.style.extend === 'right' || draft.style.extend === 'both';

  const setExtendChip = (side: 'left' | 'right', on: boolean) => {
    const left = side === 'left' ? on : extendLeft;
    const right = side === 'right' ? on : extendRight;
    let next: ExtendMode = 'none';
    if (left && right) next = 'both';
    else if (left) next = 'left';
    else if (right) next = 'right';
    patchStyle({ extend: next });
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    setDraft((d) => ({
      ...d,
      name: trimmed && trimmed !== tool.label ? trimmed : undefined,
    }));
    setRenaming(false);
  };

  const applyTemplate = (t: { style: DrawingStyle; meta: Record<string, unknown> }) => {
    setDraft((d) => ({
      ...d,
      style: { ...t.style },
      meta: { ...t.meta },
    }));
  };

  const resetToSnapshot = () => {
    skipLiveRef.current = true;
    setDraft(cloneDrawing(snapshotRef.current));
  };

  return (
    <>
      <DrawingSettingsShell
        title={displayTitle}
        iconName={chromeIconForTool(draft.type)}
        renaming={renaming}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onStartRename={() => {
          setRenameValue(displayTitle);
          setRenaming(true);
        }}
        onCommitRename={commitRename}
        onCancelRename={() => setRenaming(false)}
        tabs={tabs}
        tab={tab}
        onTabChange={setTab}
        onClose={() => onCancel(snapshotRef.current)}
        onBackdrop={() => onCancel(snapshotRef.current)}
        headerTrailing={
          <TemplateMenu
            variant="icon"
            type={draft.type}
            style={draft.style}
            meta={draft.meta ?? {}}
            onApply={applyTemplate}
          />
        }
        footer={
          <>
            <button
              type="button"
              data-sett-dd=""
              onClick={resetToSnapshot}
              className="min-h-9 px-4 rounded-md text-sm text-foreground"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => onOk(draft)}
              className="min-h-9 px-4 rounded-md bg-[color:var(--text)] text-[color:var(--surface)] text-sm font-semibold hover:opacity-90"
            >
              Done
            </button>
          </>
        }
      >
        {tab === 'style' && (
          <>
            <div data-sett-linegrid="">
              <span data-sett-label="">{showFill ? 'Border' : 'Line'}</span>
              <div data-sett-cluster="">
                <StyleTriggerButton
                  ref={strokeBtnRef}
                  style={draft.style}
                  active={pickerOpen}
                  onClick={() => {
                    setFillPickerOpen(false);
                    setPickerOpen((v) => !v);
                  }}
                />
                {/* End caps: line tools + brush (not highlighter). */}
                {showLineExtras && !isHighlighter && (
                  <>
                    <select
                      data-sett-dd=""
                      value={draft.style.leftEnd ? draft.style.leftEndStyle : 'none'}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'none') {
                          patchStyle({ leftEnd: false });
                        } else {
                          patchStyle({
                            leftEnd: true,
                            leftEndStyle: v as 'normal' | 'arrow',
                          });
                        }
                      }}
                      aria-label="Left end"
                      title="Left end"
                    >
                      <option value="none">—</option>
                      <option value="normal">●</option>
                      <option value="arrow">◀</option>
                    </select>
                    <select
                      data-sett-dd=""
                      value={draft.style.rightEnd ? draft.style.rightEndStyle : 'none'}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'none') {
                          patchStyle({ rightEnd: false });
                        } else {
                          patchStyle({
                            rightEnd: true,
                            rightEndStyle: v as 'normal' | 'arrow',
                          });
                        }
                      }}
                      aria-label="Right end"
                      title="Right end"
                    >
                      <option value="none">—</option>
                      <option value="normal">●</option>
                      <option value="arrow">▶</option>
                    </select>
                  </>
                )}
              </div>
            </div>

            {showExtendChips && (
              <Row label="Extend">
                <SettingsChip
                  label="Left"
                  on={extendLeft}
                  onClick={() => setExtendChip('left', !extendLeft)}
                />
                <SettingsChip
                  label="Right"
                  on={extendRight}
                  onClick={() => setExtendChip('right', !extendRight)}
                />
              </Row>
            )}

            {(showPriceChip || showTimeChip) && (
              <Row label="Labels">
                {showPriceChip && (
                  <SettingsChip
                    label="Price"
                    on={draft.style.showPriceLabels}
                    onClick={() =>
                      patchStyle({ showPriceLabels: !draft.style.showPriceLabels })
                    }
                  />
                )}
                {showTimeChip && (
                  <SettingsChip
                    label="Time"
                    on={draft.style.showTimeLabels}
                    onClick={() =>
                      patchStyle({ showTimeLabels: !draft.style.showTimeLabels })
                    }
                  />
                )}
              </Row>
            )}

            {showInfoRow && (
              <>
                <ToggleRow
                  label="Show Info"
                  checked={draft.style.showInfo}
                  onChange={(v) => patchStyle({ showInfo: v })}
                  trailing={
                    <select
                      data-sett-dd=""
                      disabled={!draft.style.showInfo}
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        const cur = draft.style.infoMetrics ?? [];
                        const next = cur.includes(id)
                          ? cur.filter((x) => x !== id)
                          : [...cur, id];
                        patchStyle({ infoMetrics: next });
                      }}
                      className={!draft.style.showInfo ? 'opacity-40' : ''}
                      aria-label="Info metrics"
                    >
                      <option value="">
                        {(draft.style.infoMetrics?.length ?? 0) > 0
                          ? `${draft.style.infoMetrics.length} selected`
                          : 'None'}
                      </option>
                      {INFO_METRIC_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {(draft.style.infoMetrics ?? []).includes(m.id) ? '✓ ' : ''}
                          {m.label}
                        </option>
                      ))}
                    </select>
                  }
                />
              </>
            )}

            {showLineExtras && !isBrushTool && (
              <ToggleRow
                label="Midpoint"
                checked={draft.style.showMidpoint}
                onChange={(v) => patchStyle({ showMidpoint: v })}
              />
            )}

            {showFill && (
              <ToggleRow
                label="Background"
                checked={draft.style.fill}
                onChange={(v) => patchStyle({ fill: v })}
                trailing={
                  <button
                    ref={fillBtnRef}
                    type="button"
                    data-v9-color-swatch=""
                    disabled={!draft.style.fill}
                    title="Fill color"
                    onClick={() => {
                      if (!draft.style.fill) return;
                      setPickerOpen(false);
                      setFillPickerOpen((v) => !v);
                    }}
                    className={!draft.style.fill ? 'opacity-40 cursor-not-allowed' : ''}
                    style={{
                      backgroundColor: draft.style.fillColor || draft.style.color,
                      opacity: draft.style.fill ? draft.style.fillOpacity : 0.35,
                    }}
                  />
                }
              />
            )}
          </>
        )}

        {tab === 'inputs' && showInputs && (
          <ToolInputsPanel
            type={draft.type}
            panel={settings.toolPanel}
            meta={draft.meta ?? {}}
            onMetaChange={patchMeta}
          />
        )}

        {tab === 'text' && showText && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <ColorSwatches
                value={draft.style.textColor}
                onChange={(c) => patchStyle({ textColor: c })}
                limit={8}
              />
              <select
                value={draft.style.fontSize}
                onChange={(e) =>
                  patchStyle({ fontSize: Number(e.target.value) || 14 })
                }
                className={`${fieldClass} w-16`}
                aria-label="Font size"
              >
                {[10, 12, 14, 16, 18, 20, 24, 28].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Bold"
                onClick={() => patchStyle({ textBold: !draft.style.textBold })}
                className={[
                  'min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-md border text-sm font-bold',
                  draft.style.textBold
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-foreground hover:bg-background/70',
                ].join(' ')}
              >
                B
              </button>
              <button
                type="button"
                title="Italic"
                onClick={() => patchStyle({ textItalic: !draft.style.textItalic })}
                className={[
                  'min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-md border text-sm italic',
                  draft.style.textItalic
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-foreground hover:bg-background/70',
                ].join(' ')}
              >
                I
              </button>
            </div>

            <textarea
              value={draft.text ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              rows={4}
              placeholder={tool.needsText ? 'Add text' : 'Optional note…'}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground resize-y min-h-[6rem] outline-none focus:border-accent"
            />

            <Row label="Text alignment">
              <select
                value={draft.style.textAlignV}
                onChange={(e) =>
                  patchStyle({ textAlignV: e.target.value as TextAlignV })
                }
                className={fieldClass}
              >
                {ALIGN_V.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={draft.style.textAlignH}
                onChange={(e) =>
                  patchStyle({ textAlignH: e.target.value as TextAlignH })
                }
                className={fieldClass}
              >
                {ALIGN_H.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Row>
          </>
        )}

        {tab === 'coordinates' && showCoords && (
          <div className="space-y-3">
            {draft.points.length === 0 && (
              <p className="text-muted text-sm">No points on this drawing.</p>
            )}
            {draft.points.map((p, i) => (
              <div key={i} className="space-y-1.5">
                <div className="text-xs text-muted">
                  #{i + 1} (price, bar)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={p.price}
                    onChange={(e) =>
                      patchPoint(i, { price: Number(e.target.value) || p.price })
                    }
                    className={`w-full ${fieldClass} tabular-nums`}
                    aria-label={`Point ${i + 1} price`}
                  />
                  <input
                    type="number"
                    value={Math.round(p.time)}
                    onChange={(e) =>
                      patchPoint(i, { time: Number(e.target.value) || p.time })
                    }
                    className={`w-full ${fieldClass} tabular-nums`}
                    aria-label={`Point ${i + 1} time`}
                    title="Unix time (seconds)"
                  />
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
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-foreground">
                Show on intervals
              </p>
              <p className="text-[11px] text-muted leading-snug">
                Uncheck a timeframe to hide this drawing when that interval is
                active (TradingView-style).
              </p>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {DRAWING_VISIBILITY_TFS.map((tf) => {
                  const onTfs = draft.visibleOnTfs;
                  const checked =
                    onTfs == null ||
                    onTfs === 'all' ||
                    (Array.isArray(onTfs) && onTfs.includes(tf));
                  return (
                    <label
                      key={tf}
                      className="flex items-center gap-1.5 min-h-9 px-2 rounded-[4px] bg-background/60 text-xs text-foreground cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            visibleOnTfs: toggleVisibleOnTf(
                              d.visibleOnTfs,
                              tf,
                              e.target.checked,
                            ),
                          }))
                        }
                        className="accent-[var(--accent)]"
                      />
                      {tf}
                    </label>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted">
              Globally hidden drawings stay saved. Re-select via Object tree
              (toolbar list icon) or show again here.
            </p>
          </>
        )}
      </DrawingSettingsShell>

      <LineStylePickerFlyout
        open={pickerOpen}
        anchorEl={strokeBtnRef.current}
        value={styleToPickerValue(draft.style)}
        hideDash={settings.hideDash}
        widthPresets={settings.widthPresets}
        onChange={(partial) => {
          const next: Partial<DrawingStyle> = { ...partial };
          // Keep fill linked until user picks a separate fill color.
          if (partial.color && draft.style.fillColor === draft.style.color) {
            next.fillColor = partial.color;
          }
          // Brush/highlighter always solid.
          if (settings.hideDash) next.lineStyle = 'solid';
          patchStyle(next);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <LineStylePickerFlyout
        open={fillPickerOpen}
        anchorEl={fillBtnRef.current}
        value={{
          color: draft.style.fillColor || draft.style.color,
          opacity: draft.style.fillOpacity,
          width: draft.style.width,
          lineStyle: draft.style.lineStyle,
        }}
        showLineControls={false}
        onChange={(partial) => {
          const patch: Partial<DrawingStyle> = {};
          if (partial.color != null) patch.fillColor = partial.color;
          if (partial.opacity != null) patch.fillOpacity = partial.opacity;
          patchStyle(patch);
        }}
        onClose={() => setFillPickerOpen(false)}
      />
    </>
  );
}
