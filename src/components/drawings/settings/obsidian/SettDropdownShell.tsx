import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevDown } from './dashPreview';

interface SettDropdownShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ReactNode;
  children: ReactNode;
  /** Dropdown panel width (px). */
  width?: number;
  rightAlign?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  btnWidth?: number;
  className?: string;
}

/**
 * Obsidian data-sett-dd trigger + data-sett-drop panel.
 * Only one dropdown should be open at a time — parent owns `open`.
 */
export function SettDropdownShell({
  open,
  onOpenChange,
  preview,
  children,
  width = 56,
  rightAlign = false,
  disabled = false,
  ariaLabel,
  btnWidth,
  className,
}: SettDropdownShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dropId = useId();
  const [dropUp, setDropUp] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={['relative inline-flex', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        data-sett-dd=""
        data-open={open ? '1' : undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={dropId}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          setDropUp(r.bottom + 120 > window.innerHeight);
          onOpenChange(!open);
        }}
        style={
          btnWidth
            ? {
                width: btnWidth,
                minWidth: btnWidth,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: disabled ? 0.38 : 1,
              }
            : {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: disabled ? 0.38 : 1,
              }
        }
      >
        {preview}
        <ChevDown open={open} />
      </button>
      {open && (
        <div
          id={dropId}
          data-sett-drop=""
          data-sett-drop-shell=""
          role="listbox"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            zIndex: 20,
            width,
            ...(dropUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
            ...(rightAlign ? { right: 0 } : { left: 0 }),
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function SettDropOption({
  selected,
  onSelect,
  children,
  keepOpen,
}: {
  selected?: boolean;
  onSelect: () => void;
  children: ReactNode;
  keepOpen?: boolean;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-pick-on={selected ? '1' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        padding: '7px 0',
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: selected ? 'var(--accent-quiet)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = selected
          ? 'var(--accent-quiet)'
          : 'transparent';
      }}
      data-keep-open={keepOpen ? '1' : undefined}
    >
      {children}
    </div>
  );
}
