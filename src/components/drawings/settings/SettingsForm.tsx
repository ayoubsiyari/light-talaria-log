import type { ReactNode } from 'react';
import { TV_COLOR_PALETTE } from '@/drawings/drawingStyle';

export const fieldClass =
  'bg-background border border-border rounded-md px-2.5 py-2 text-foreground text-sm outline-none focus:border-accent min-h-11 sm:min-h-9';

export function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-11">
      <span className="text-muted shrink-0 text-sm">{label}</span>
      <div className="flex items-center justify-end gap-2 flex-wrap min-w-0">{children}</div>
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
  trailing,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Optional control shown after the checkbox (e.g. disabled style trigger). */
  trailing?: ReactNode;
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 text-sm min-h-11',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <label className="flex items-center gap-2.5 text-foreground cursor-pointer min-w-0 flex-1">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-[var(--accent)] w-4 h-4 rounded-[3px] border border-border shrink-0"
        />
        <span className="truncate">{label}</span>
      </label>
      {trailing}
    </div>
  );
}

export function ColorSwatches({
  value,
  onChange,
  limit,
}: {
  value: string;
  onChange: (c: string) => void;
  limit?: number;
}) {
  const colors = limit ? TV_COLOR_PALETTE.slice(0, limit) : TV_COLOR_PALETTE;
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px] justify-end">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={[
            'w-5 h-5 rounded-sm border',
            value === c ? 'border-accent ring-1 ring-accent' : 'border-border',
          ].join(' ')}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-muted pt-2 mt-1 border-t border-border first:border-0 first:pt-0 first:mt-0">
      {children}
    </div>
  );
}
