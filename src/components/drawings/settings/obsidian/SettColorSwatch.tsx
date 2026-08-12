import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObsidianColorPanel } from './ObsidianColorPanel';

interface SettColorSwatchProps {
  color: string;
  opacity?: number;
  onChange: (partial: { color?: string; opacity?: number }) => void;
  disabled?: boolean;
  title?: string;
  /** Show opacity slider (default true). */
  showOpacity?: boolean;
  active?: boolean;
}

/**
 * Obsidian color well — opens the shared palette / custom HSV panel.
 */
export function SettColorSwatch({
  color,
  opacity = 1,
  onChange,
  disabled = false,
  title = 'Color',
  showOpacity = true,
  active: activeProp,
}: SettColorSwatchProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const width = 236;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const estH = showOpacity ? 320 : 260;
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - 8) {
      top = Math.max(8, r.top - estH - 6);
    }
    setPos({ top, left });
  }, [open, showOpacity]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [open]);

  const active = activeProp ?? open;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-v9-color-swatch=""
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        style={{
          backgroundColor: color,
          opacity: disabled ? 0.38 : opacity,
          cursor: disabled ? 'not-allowed' : 'default',
          outline: active
            ? '2px solid color-mix(in oklab, var(--accent) 55%, transparent)'
            : undefined,
          outlineOffset: 1,
        }}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            data-style-flyout="1"
            className="fixed z-[220] rounded-lg overflow-hidden border border-[color:var(--line-strong,var(--line))]"
            style={{
              top: pos.top,
              left: pos.left,
              width: 236,
              background:
                'var(--surface-raised, var(--surface-tertiary, #141416))',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ObsidianColorPanel
              color={color}
              opacity={opacity}
              showOpacity={showOpacity}
              onChange={onChange}
              onRequestClose={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
