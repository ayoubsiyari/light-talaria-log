import type { ReactNode } from 'react';
import { TV_COLOR_PALETTE } from '@/drawings/drawingStyle';

export const fieldClass =
  'bg-background border border-border rounded px-2 py-1.5 text-foreground text-sm outline-none focus:border-accent';

export function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-10">
      <span className="text-foreground shrink-0 text-sm">{label}</span>
      <div className="flex items-center justify-end gap-2 flex-wrap min-w-0">{children}</div>
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-foreground text-sm min-h-10 cursor-pointer">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--accent)] w-4 h-4"
      />
    </label>
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
    <div className="text-[10px] uppercase tracking-wide text-muted pt-1 border-t border-border first:border-0 first:pt-0">
      {children}
    </div>
  );
}
