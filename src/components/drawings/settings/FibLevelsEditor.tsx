import { useState } from 'react';
import type { LineStyleKind } from '@/drawings/drawingStyle';
import { TV_COLOR_PALETTE } from '@/drawings/drawingStyle';
import {
  defaultFibLevelsFor,
  formatFibCoeff,
  normalizeFibLevels,
  type FibLevel,
} from '@/drawings/fibLevels';
import type { DrawingToolId } from '@/drawings/toolRegistry';
import { fieldClass, SectionTitle, ToggleRow } from './SettingsForm';

interface FibLevelsEditorProps {
  type: DrawingToolId;
  meta: Record<string, unknown>;
  onMetaChange: (partial: Record<string, unknown>) => void;
}

const LINE_STYLE_OPTS: { id: LineStyleKind; label: string }[] = [
  { id: 'solid', label: '—' },
  { id: 'dashed', label: '- -' },
  { id: 'dotted', label: '···' },
];

/**
 * TradingView-style level rows: checkbox · color · line style · editable coeff · remove.
 */
export function FibLevelsEditor({ type, meta, onMetaChange }: FibLevelsEditorProps) {
  const levels = normalizeFibLevels(meta.levels, defaultFibLevelsFor(type));
  const [colorPicker, setColorPicker] = useState<number | null>(null);
  const [newCoeff, setNewCoeff] = useState('1.272');

  const setLevels = (next: FibLevel[]) => onMetaChange({ levels: next });

  const patchLevel = (index: number, partial: Partial<FibLevel>) => {
    setLevels(levels.map((l, i) => (i === index ? { ...l, ...partial } : l)));
  };

  const removeLevel = (index: number) => {
    setLevels(levels.filter((_, i) => i !== index));
  };

  const addLevel = () => {
    const coeff = Number(newCoeff);
    if (!Number.isFinite(coeff)) return;
    if (levels.some((l) => Math.abs(l.coeff - coeff) < 1e-9)) return;
    const next = [
      ...levels,
      {
        coeff,
        visible: true,
        color: '#2962FF',
        lineStyle: 'solid' as LineStyleKind,
      },
    ].sort((a, b) => a.coeff - b.coeff);
    setLevels(next);
  };

  const showExtend =
    type === 'fibRetracement' ||
    type === 'fibExtension' ||
    type === 'fibChannel' ||
    type === 'fibTimezone' ||
    type === 'fibTrendTime';

  const showReverse =
    type === 'fibRetracement' ||
    type === 'fibExtension' ||
    type === 'fibChannel';

  const showPrices =
    type === 'fibRetracement' ||
    type === 'fibExtension' ||
    type === 'fibChannel';

  return (
    <div className="space-y-3">
      <SectionTitle>Levels</SectionTitle>
      <p className="text-xs text-muted -mt-1">
        Toggle, recolor, and edit each coefficient — same as TradingView.
      </p>

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
        {levels.map((lv, i) => (
          <div
            key={`${lv.coeff}-${i}`}
            className="flex items-center gap-1.5 min-h-11"
          >
            <input
              type="checkbox"
              checked={lv.visible}
              onChange={(e) => patchLevel(i, { visible: e.target.checked })}
              className="accent-[var(--accent)] w-4 h-4 shrink-0"
              aria-label={`Show level ${formatFibCoeff(lv.coeff)}`}
            />
            <div className="relative shrink-0">
              <button
                type="button"
                title="Level color"
                className="w-7 h-7 rounded-md border border-border"
                style={{ backgroundColor: lv.color }}
                onClick={() => setColorPicker(colorPicker === i ? null : i)}
              />
              {colorPicker === i && (
                <div className="absolute left-0 top-full mt-1 z-20 p-2 rounded-md border border-border bg-surface shadow-xl flex flex-wrap gap-1 w-[148px]">
                  {TV_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={[
                        'w-5 h-5 rounded-sm border',
                        lv.color === c ? 'border-accent ring-1 ring-accent' : 'border-border',
                      ].join(' ')}
                      style={{ backgroundColor: c }}
                      onClick={() => {
                        patchLevel(i, { color: c });
                        setColorPicker(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <select
              value={lv.lineStyle}
              onChange={(e) =>
                patchLevel(i, { lineStyle: e.target.value as LineStyleKind })
              }
              className={`${fieldClass} w-[52px] px-1 text-center`}
              aria-label="Line style"
              title="Line style"
            >
              {LINE_STYLE_OPTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              value={lv.coeff}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                patchLevel(i, { coeff: n });
              }}
              className={`${fieldClass} flex-1 min-w-0 tabular-nums`}
              aria-label={`Level ${i + 1} value`}
            />
            <button
              type="button"
              title="Remove level"
              className="min-h-9 min-w-9 rounded-md text-muted hover:text-danger hover:bg-background/70 text-sm"
              onClick={() => removeLevel(i)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={newCoeff}
          onChange={(e) => setNewCoeff(e.target.value)}
          className={`${fieldClass} flex-1 tabular-nums`}
          aria-label="New level value"
          placeholder="Coeff"
        />
        <button
          type="button"
          onClick={addLevel}
          className="min-h-11 sm:min-h-9 px-3 rounded-md border border-border text-sm text-foreground hover:bg-background/80 shrink-0"
        >
          Add
        </button>
      </div>

      <SectionTitle>Options</SectionTitle>
      <ToggleRow
        label="Show labels (coeffs)"
        checked={meta.showLabels !== false}
        onChange={(v) => onMetaChange({ showLabels: v })}
      />
      {showPrices && (
        <ToggleRow
          label="Show prices"
          checked={!!meta.showPrices}
          onChange={(v) => onMetaChange({ showPrices: v })}
        />
      )}
      {showReverse && (
        <ToggleRow
          label="Reverse"
          checked={!!meta.reverse}
          onChange={(v) => onMetaChange({ reverse: v })}
        />
      )}
      {showExtend && (
        <>
          <ToggleRow
            label="Extend left"
            checked={!!meta.extendLeft || (!!meta.extendLines && meta.extendLeft == null)}
            onChange={(v) => onMetaChange({ extendLeft: v })}
          />
          <ToggleRow
            label="Extend right"
            checked={
              typeof meta.extendRight === 'boolean'
                ? meta.extendRight
                : !!meta.extendLines
            }
            onChange={(v) => onMetaChange({ extendRight: v })}
          />
        </>
      )}
    </div>
  );
}
