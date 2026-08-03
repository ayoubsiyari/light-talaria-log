import type { ReactNode } from 'react';

export interface SegmentOption<T extends string | number> {
  id: T;
  label?: string;
  /** Custom content (e.g. thickness line preview). */
  content?: ReactNode;
  title?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background/50 p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={String(opt.id)}
            type="button"
            title={opt.title ?? opt.label}
            onClick={() => onChange(opt.id)}
            className={[
              'min-h-9 min-w-9 px-2 rounded-[4px] flex items-center justify-center text-xs transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted hover:text-foreground hover:bg-background/80',
            ].join(' ')}
          >
            {opt.content ?? opt.label}
          </button>
        );
      })}
    </div>
  );
}
