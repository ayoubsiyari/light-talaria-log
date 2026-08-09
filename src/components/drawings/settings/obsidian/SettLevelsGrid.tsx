import type { LineStyleKind, StyleLevelRow } from '@/drawings/drawingStyle';
import { SettCheckbox } from './SettCheckbox';
import { SettColorSwatch } from './SettColorSwatch';
import {
  SettLineTypeDropdown,
  SettLineWidthDropdown,
} from './SettLineDropdown';

interface SettLevelsGridProps {
  levels: StyleLevelRow[];
  onChange: (next: StyleLevelRow[]) => void;
  /** Which dropdown key is open (`type-0`, `width-2`, …). */
  openKey: string | null;
  onOpenKey: (key: string | null) => void;
  /** Show editable value field (fib/channel). */
  showValue?: boolean;
  /** Prefer label over value when present. */
  preferLabel?: boolean;
}

/**
 * V9-style level row grid: checkbox · color · dash · width · optional value.
 * Paint may ignore these — store for later wiring.
 */
export function SettLevelsGrid({
  levels,
  onChange,
  openKey,
  onOpenKey,
  showValue = true,
  preferLabel = false,
}: SettLevelsGridProps) {
  const patch = (index: number, partial: Partial<StyleLevelRow>) => {
    onChange(levels.map((l, i) => (i === index ? { ...l, ...partial } : l)));
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: showValue
          ? '1fr auto auto auto auto'
          : '1fr auto auto auto',
        columnGap: 10,
        rowGap: 0,
        alignItems: 'center',
      }}
    >
      <div />
      <div />
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
        <span data-sett-col-lbl="">Style</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
        <span data-sett-col-lbl="">Width</span>
      </div>
      {showValue && <div />}

      {levels.map((ln, idx) => {
        const op = ln.on ? 1 : 0.38;
        const pe = ln.on ? 'auto' : 'none';
        const typeKey = `type-${idx}`;
        const widthKey = `width-${idx}`;
        const rowLabel =
          preferLabel && ln.label
            ? ln.label
            : ln.label && !showValue
              ? ln.label
              : ln.value;
        return (
          <div key={idx} style={{ display: 'contents' }}>
            <div style={{ padding: '5px 0', alignSelf: 'center' }}>
              <SettCheckbox
                checked={ln.on}
                onChange={(on) => patch(idx, { on })}
                label={rowLabel}
              />
            </div>
            <div style={{ padding: '5px 0', opacity: op, pointerEvents: pe as 'auto' | 'none' }}>
              <SettColorSwatch
                color={ln.color}
                showOpacity={false}
                onChange={({ color }) => {
                  if (color) patch(idx, { color });
                }}
              />
            </div>
            <div style={{ padding: '5px 0', opacity: op, pointerEvents: pe as 'auto' | 'none' }}>
              <SettLineTypeDropdown
                value={ln.type}
                open={openKey === typeKey}
                onOpenChange={(o) => onOpenKey(o ? typeKey : null)}
                onChange={(type: LineStyleKind) => patch(idx, { type })}
              />
            </div>
            <div style={{ padding: '5px 0', opacity: op, pointerEvents: pe as 'auto' | 'none' }}>
              <SettLineWidthDropdown
                value={ln.width}
                open={openKey === widthKey}
                onOpenChange={(o) => onOpenKey(o ? widthKey : null)}
                onChange={(width) => patch(idx, { width })}
              />
            </div>
            {showValue && (
              <div style={{ padding: '5px 0', opacity: op, pointerEvents: pe as 'auto' | 'none' }}>
                <input
                  value={ln.value}
                  onChange={(e) => patch(idx, { value: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="tlr-nospinner"
                  style={{
                    width: 56,
                    height: 24,
                    background: 'rgba(140,160,255,0.05)',
                    border: '1px solid rgba(140,160,255,0.2)',
                    color: 'var(--text)',
                    fontSize: 11,
                    padding: '0 6px',
                    outline: 'none',
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                    borderRadius: 4,
                  }}
                  aria-label={`Level ${idx + 1} value`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
