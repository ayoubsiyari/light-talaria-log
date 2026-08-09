import type { ReactNode } from 'react';

interface SettCheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
}

/**
 * TlChk-style label+checkbox for data-sett-label pattern.
 */
export function SettCheckbox({
  checked,
  onChange,
  label,
  id,
  disabled = false,
}: SettCheckboxProps) {
  return (
    <label
      data-sett-label=""
      className="flex items-center gap-2 cursor-pointer min-w-0 select-none"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--accent)] w-4 h-4 rounded-[3px] border border-[color:var(--line)] shrink-0"
      />
      {label != null && label !== '' && (
        <span className="truncate text-[12px] text-[color:var(--text-muted)]">
          {label}
        </span>
      )}
    </label>
  );
}

/** Section header matching V9 data-sett-sec. */
export function SettSec({ children }: { children: ReactNode }) {
  return <div data-sett-sec="">{children}</div>;
}

/** Horizontal rule. */
export function SettRule() {
  return <div data-sett-rule="" />;
}

/** Standard label-left / acts-right row. */
export function SettRow({
  label,
  children,
  dimmed,
}: {
  label: ReactNode;
  children?: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div data-sett-row="" style={dimmed ? { opacity: 0.38 } : undefined}>
      {typeof label === 'string' ? (
        <span data-sett-label="">{label}</span>
      ) : (
        <div data-sett-label="">{label}</div>
      )}
      {children != null && (
        <div
          data-sett-acts=""
          style={
            dimmed
              ? { pointerEvents: 'none', opacity: 1 }
              : undefined
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Line grid: label left, clustered controls right. */
export function SettLineGrid({
  label,
  children,
  dimmed,
}: {
  label: ReactNode;
  children: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div data-sett-linegrid="" data-sett-row="">
      {typeof label === 'string' ? (
        <span data-sett-label="">{label}</span>
      ) : (
        <div data-sett-label="">{label}</div>
      )}
      <div
        data-sett-cluster=""
        data-sett-acts=""
        style={{
          opacity: dimmed ? 0.38 : 1,
          pointerEvents: dimmed ? 'none' : 'auto',
          transition: 'opacity 0.15s',
        }}
      >
        {children}
      </div>
    </div>
  );
}
