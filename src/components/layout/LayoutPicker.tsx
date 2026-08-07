import { Popover } from '@heroui/react';
import {
  DEFAULT_LAYOUT_SYNC,
  LAYOUT_ROWS,
  cellsForLayout,
  type LayoutCell,
  type LayoutOption,
  type LayoutSyncOptions,
} from '@/types/layout';
import type { ChartLayout } from '@/types/ui';

interface LayoutPickerProps {
  layout: ChartLayout;
  onLayoutChange: (layout: ChartLayout) => void;
  sync: LayoutSyncOptions;
  onSyncChange: (next: LayoutSyncOptions) => void;
}

const SYNC_ROWS: { key: keyof LayoutSyncOptions; label: string }[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'interval', label: 'Interval' },
  { key: 'crosshair', label: 'Crosshair' },
  { key: 'time', label: 'Time' },
  { key: 'dateRange', label: 'Date range' },
];

/** Mini TV-style layout glyph (filled when selected). */
function LayoutGlyph({
  cells,
  selected,
  size = 18,
}: {
  cells: LayoutCell[];
  selected: boolean;
  size?: number;
}) {
  const pad = 1.25;
  const gap = 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={size - 1}
        rx={2}
        fill={selected ? 'var(--foreground)' : 'transparent'}
        stroke={selected ? 'var(--foreground)' : 'var(--tv-panel-line, var(--border))'}
        strokeWidth={1}
      />
      {cells.map((c, i) => {
        const x = pad + c.x * (size - pad * 2) + (c.x > 0 ? gap / 2 : 0);
        const y = pad + c.y * (size - pad * 2) + (c.y > 0 ? gap / 2 : 0);
        const w =
          c.w * (size - pad * 2) -
          (c.x + c.w < 1 && c.w < 1 ? gap / 2 : 0) -
          (c.x > 0 ? gap / 2 : 0);
        const h =
          c.h * (size - pad * 2) -
          (c.y + c.h < 1 && c.h < 1 ? gap / 2 : 0) -
          (c.y > 0 ? gap / 2 : 0);
        if (selected) {
          if (cells.length === 1) return null;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={Math.max(1, w)}
              height={Math.max(1, h)}
              rx={0.5}
              fill="none"
              stroke="var(--surface)"
              strokeWidth={1}
            />
          );
        }
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(1, w)}
            height={Math.max(1, h)}
            rx={0.5}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={1}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

/**
 * TradingView-style layout menu: numbered rows of grid icons + sync toggles.
 * Compact — matches TV density, not a large settings panel.
 */
export function LayoutPicker({
  layout,
  onLayoutChange,
  sync,
  onSyncChange,
}: LayoutPickerProps) {
  return (
    <Popover>
      {/* Trigger is the pressable — do not nest another <button> inside */}
      <Popover.Trigger
        title="Layout"
        aria-label="Chart layout"
        data-tb-item="layout"
        className="v8b-chrome-btn !h-9 !min-h-11 sm:!min-h-9 !w-9 !min-w-11 sm:!min-w-9 !px-0 justify-center rounded-[var(--radius-control,6px)]"
      >
        <LayoutGlyph cells={cellsForLayout(layout)} selected={false} size={16} />
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="p-0 z-[100]">
        <Popover.Dialog
          data-v9-chrome="1"
          data-sdrop="1"
          className="v9-flyout w-[13.5rem] bg-[color:var(--surface-raised)] border border-[color:var(--line)] rounded-[var(--radius-panel,8px)] overflow-hidden shadow-none"
        >
          <div className="max-h-[min(55dvh,18rem)] overflow-y-auto overscroll-contain">
            {LAYOUT_ROWS.map((row, rowIdx) => (
              <div
                key={row.panes}
                className={[
                  'flex items-center gap-1.5 px-2 py-1.5',
                  rowIdx > 0 ? 'border-t border-[color:var(--line)]' : '',
                ].join(' ')}
              >
                <span className="w-3.5 shrink-0 text-[11px] text-muted tabular-nums">
                  {row.panes}
                </span>
                <div className="flex flex-wrap items-center gap-0.5">
                  {row.options.map((opt) => (
                    <LayoutIconButton
                      key={opt.id}
                      option={opt}
                      selected={layout === opt.id}
                      onSelect={() => onLayoutChange(opt.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[color:var(--line)] px-2 py-1.5 space-y-0.5">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted px-0.5 pb-0.5">
              Sync in layout
            </p>
            {SYNC_ROWS.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-2 min-h-9 px-0.5"
              >
                <span className="text-[11px] text-foreground truncate">{row.label}</span>
                <TvToggle
                  checked={sync[row.key]}
                  label={`Sync ${row.label}`}
                  onChange={(v) => onSyncChange({ ...sync, [row.key]: v })}
                />
              </div>
            ))}
            <button
              type="button"
              className="text-[10px] text-muted hover:text-foreground px-0.5 pt-0.5 min-h-9"
              onClick={() => onSyncChange({ ...DEFAULT_LAYOUT_SYNC })}
            >
              Reset
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function LayoutIconButton({
  option,
  selected,
  onSelect,
}: {
  option: LayoutOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={`${option.panes}-pane layout`}
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        'h-9 w-9 min-h-9 min-w-9 rounded-[var(--radius-control,6px)] flex items-center justify-center transition-colors',
        selected
          ? 'bg-[color:var(--accent-quiet)] text-[color:var(--accent)]'
          : 'hover:bg-[color:var(--surface-sunken)]',
      ].join(' ')}
    >
      <LayoutGlyph cells={option.cells} selected={selected} size={18} />
    </button>
  );
}

/** Compact TV-style pill toggle. */
function TvToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-4 w-7 rounded-full transition-colors shrink-0',
        checked ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--line-strong)]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] h-2.5 w-2.5 rounded-full bg-[color:var(--cta-bg)] transition-transform',
          checked ? 'left-[14px]' : 'left-[3px]',
        ].join(' ')}
      />
    </button>
  );
}
