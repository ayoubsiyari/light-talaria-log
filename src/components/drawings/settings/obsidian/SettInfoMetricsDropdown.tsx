import { INFO_METRIC_OPTIONS } from '@/drawings/drawingStyle';
import { SettDropOption, SettDropdownShell } from './SettDropdownShell';

interface SettInfoMetricsDropdownProps {
  selected: string[];
  onChange: (next: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

/** Multi-select Show Info metrics dropdown (keeps open while toggling). */
export function SettInfoMetricsDropdown({
  selected,
  onChange,
  open,
  onOpenChange,
  disabled,
}: SettInfoMetricsDropdownProps) {
  const label =
    selected.length === 0
      ? 'None'
      : selected.length === 1
        ? (INFO_METRIC_OPTIONS.find((m) => m.id === selected[0])?.label ?? '1 selected')
        : `${selected.length} selected`;

  return (
    <SettDropdownShell
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      ariaLabel="Info metrics"
      width={168}
      rightAlign
      btnWidth={120}
      preview={
        <span
          style={{
            fontSize: 12,
            color: open ? 'var(--accent)' : 'var(--text-muted)',
            maxWidth: 90,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      }
    >
      {INFO_METRIC_OPTIONS.map((m) => {
        const isA = selected.includes(m.id);
        return (
          <SettDropOption
            key={m.id}
            selected={isA}
            keepOpen
            onSelect={() => {
              const next = isA
                ? selected.filter((x) => x !== m.id)
                : [...selected, m.id];
              onChange(next);
            }}
          >
            <span
              style={{
                fontSize: 12,
                padding: '0 10px',
                width: '100%',
                textAlign: 'left',
                color: isA ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isA ? 700 : 500,
              }}
            >
              {m.label}
            </span>
          </SettDropOption>
        );
      })}
    </SettDropdownShell>
  );
}
