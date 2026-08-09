import { useState } from 'react';
import { Popover } from '@heroui/react';
import type { SeriesType } from '@/chart';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';

const SERIES_ROWS: {
  id: SeriesType | 'hollow' | 'heikin' | 'area';
  label: string;
  engine?: SeriesType;
  stub?: boolean;
}[] = [
  { id: 'candle', label: 'Candles', engine: 'candle' },
  { id: 'hollow', label: 'Hollow Candles', stub: true },
  { id: 'heikin', label: 'Heikin Ashi', stub: true },
  { id: 'bar', label: 'Bars', engine: 'bar' },
  { id: 'line', label: 'Line', engine: 'line' },
  { id: 'area', label: 'Area', stub: true },
];

interface SeriesTypePickerProps {
  seriesType: SeriesType;
  onSeriesTypeChange: (t: SeriesType) => void;
  /** Compact trigger for mobile extras. */
  compact?: boolean;
}

/**
 * Obsidian chart-type drop — data-tb-drop="chartType".
 * Unsupported series shown disabled until engine supports them.
 */
export function SeriesTypePicker({
  seriesType,
  onSeriesTypeChange,
  compact = false,
}: SeriesTypePickerProps) {
  const [open, setOpen] = useState(false);
  const activeLabel =
    SERIES_ROWS.find((r) => r.engine === seriesType)?.label ?? 'Candles';

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title="Chart type"
        aria-label="Chart type"
        data-tb-item="chartType"
        className={[
          'v8b-chrome-btn cursor-pointer [@media(hover:none)]:min-h-11',
          compact ? 'w-full justify-between inline-flex' : 'hidden sm:inline-flex',
        ].join(' ')}
      >
        <ChromeIcon n="candle" s={15} />
        <span className="text-[13px] font-semibold truncate max-w-[7.5rem]">
          {activeLabel}
        </span>
        <ChromeIcon n="chevDown" s={10} />
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="p-0 z-[100]">
        <Popover.Dialog
          data-v9-chrome="1"
          data-sdrop="1"
          data-tb-drop="chartType"
          className="w-[11.5rem] overflow-hidden bg-[color:var(--surface)] border border-[color:var(--line)] rounded-[var(--radius-panel,8px)] shadow-none py-1"
        >
          {SERIES_ROWS.map((row) => {
            const active = row.engine === seriesType;
            const disabled = !!row.stub;
            return (
              <button
                key={row.id}
                type="button"
                data-menu-row=""
                data-active={active ? '1' : undefined}
                disabled={disabled}
                className="w-full flex items-center gap-2 px-2.5 min-h-11 sm:min-h-8 text-left text-[13px] disabled:opacity-40"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text)',
                  background: active ? 'var(--accent-quiet)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
                onClick={() => {
                  if (row.engine) {
                    onSeriesTypeChange(row.engine);
                    setOpen(false);
                  }
                }}
              >
                <ChromeIcon n="candle" s={14} />
                <span className="flex-1 truncate">{row.label}</span>
                {disabled ? (
                  <span className="text-[9px] text-[color:var(--text-faint)]">Soon</span>
                ) : null}
              </button>
            );
          })}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
