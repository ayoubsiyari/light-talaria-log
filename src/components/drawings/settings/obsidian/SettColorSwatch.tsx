import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TV_COLOR_PALETTE } from '@/drawings/drawingStyle';

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
 * V9 data-v9-color-swatch — opens a TV palette popover with optional opacity.
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
  const [customHex, setCustomHex] = useState(color);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const width = 240;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    let top = r.bottom + 6;
    const estH = showOpacity ? 220 : 160;
    if (top + estH > window.innerHeight - 8) {
      top = Math.max(8, r.top - estH - 6);
    }
    setPos({ top, left });
  }, [open, showOpacity]);

  useEffect(() => {
    if (!open) return;
    setCustomHex(color);
  }, [open, color]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = activeProp ?? open;
  const opacityPct = Math.round(Math.max(0, Math.min(1, opacity)) * 100);

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
            data-v9-chrome="1"
            data-sett-v3="1"
            className="fixed z-[220] w-[240px] rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] p-3 space-y-3 shadow-none"
            style={{ top: pos.top, left: pos.left }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-8 gap-1.5">
              {TV_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  className={[
                    'w-6 h-6 rounded-[4px] border transition-shadow',
                    color.toLowerCase() === c.toLowerCase()
                      ? 'border-[color:var(--text)] ring-2 ring-[color:var(--text)]/30'
                      : 'border-[color:var(--line)]',
                  ].join(' ')}
                  style={{ backgroundColor: c }}
                  onClick={() => onChange({ color: c })}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : '#2962FF'}
                onChange={(e) => {
                  setCustomHex(e.target.value);
                  onChange({ color: e.target.value });
                }}
                className="h-8 w-8 cursor-pointer rounded border border-[color:var(--line)] bg-[color:var(--surface-sunken)] p-0.5"
                aria-label="Custom color"
              />
              <input
                type="text"
                value={customHex}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomHex(v);
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange({ color: v });
                }}
                className="flex-1 min-h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 text-xs font-mono text-[color:var(--text)] outline-none"
                spellCheck={false}
                aria-label="Hex color"
              />
            </div>
            {showOpacity && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
                  <span>Opacity</span>
                  <span className="tabular-nums text-[color:var(--text)]">
                    {opacityPct}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={opacityPct}
                    onChange={(e) =>
                      onChange({ opacity: Number(e.target.value) / 100 })
                    }
                    className="flex-1 h-1 accent-[var(--accent)]"
                    aria-label="Opacity"
                  />
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={opacityPct}
                    onChange={(e) => {
                      const n = Math.max(
                        5,
                        Math.min(100, Number(e.target.value) || 100),
                      );
                      onChange({ opacity: n / 100 });
                    }}
                    className="w-14 min-h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-1.5 text-xs tabular-nums text-[color:var(--text)] outline-none"
                    aria-label="Opacity percent"
                  />
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
