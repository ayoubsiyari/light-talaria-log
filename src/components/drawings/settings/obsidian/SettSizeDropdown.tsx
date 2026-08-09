import { FONT_SIZES } from '@/drawings/drawingStyle';
import { SettDropOption, SettDropdownShell } from './SettDropdownShell';

interface SettSizeDropdownProps {
  value: number;
  onChange: (n: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sizes?: readonly number[];
  disabled?: boolean;
  ariaLabel?: string;
}

/** Font / label size dropdown (10–24). */
export function SettSizeDropdown({
  value,
  onChange,
  open,
  onOpenChange,
  sizes = FONT_SIZES,
  disabled,
  ariaLabel = 'Size',
}: SettSizeDropdownProps) {
  return (
    <SettDropdownShell
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
      btnWidth={52}
      rightAlign
      preview={
        <span
          style={{
            fontSize: 12,
            color: open ? 'var(--accent)' : 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      }
    >
      {sizes.map((sz) => (
        <SettDropOption
          key={sz}
          selected={value === sz}
          onSelect={() => {
            onChange(sz);
            onOpenChange(false);
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: value === sz ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: value === sz ? 700 : 500,
            }}
          >
            {sz}
          </span>
        </SettDropOption>
      ))}
    </SettDropdownShell>
  );
}

/** Bold / Italic toggle buttons matching V9 data-sett-dd open state. */
export function SettBIToggle({
  bold,
  italic,
  onBold,
  onItalic,
}: {
  bold: boolean;
  italic: boolean;
  onBold: () => void;
  onItalic: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(
        [
          ['B', bold, onBold, { fontWeight: 800 } as const],
          ['I', italic, onItalic, { fontStyle: 'italic', fontWeight: 600 } as const],
        ] as const
      ).map(([label, on, toggle, extra]) => (
        <button
          key={label}
          type="button"
          data-sett-dd=""
          data-open={on ? '1' : undefined}
          onClick={toggle}
          aria-pressed={on}
          aria-label={label === 'B' ? 'Bold' : 'Italic'}
          style={{
            width: 28,
            height: 28,
            minWidth: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: on ? 'var(--accent)' : 'var(--text-muted)',
            ...extra,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
