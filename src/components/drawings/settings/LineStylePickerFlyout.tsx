import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LINE_WIDTHS,
  TV_COLOR_PALETTE,
  type DrawingStyle,
  type LineStyleKind,
} from '@/drawings/drawingStyle';
import { SegmentedControl } from '@/components/drawings/settings/SegmentedControl';

const LINE_STYLES: { id: LineStyleKind; dash: string; title: string }[] = [
  { id: 'solid', dash: '', title: 'Solid' },
  { id: 'dashed', dash: '4 3', title: 'Dashed' },
  { id: 'dotted', dash: '1.5 2.5', title: 'Dotted' },
];

export interface LineStylePickerValue {
  color: string;
  opacity: number;
  width: number;
  lineStyle: LineStyleKind;
}

interface LineStylePickerFlyoutProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  value: LineStylePickerValue;
  onChange: (partial: Partial<LineStylePickerValue>) => void;
  onClose: () => void;
  /** Show thickness + dash segments (default true). */
  showLineControls?: boolean;
  /** Hide dash style row (brush/highlighter — always solid). */
  hideDash?: boolean;
  /** Custom thickness presets (e.g. highlighter 8…64). */
  widthPresets?: readonly number[];
}

/**
 * Unified TV color / opacity / thickness / dash flyout.
 * Portals to document.body so chart overflow cannot clip it.
 */
export function LineStylePickerFlyout({
  open,
  anchorEl,
  value,
  onChange,
  onClose,
  showLineControls = true,
  hideDash = false,
  widthPresets,
}: LineStylePickerFlyoutProps) {
  const widths = widthPresets?.length ? widthPresets : LINE_WIDTHS;
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [customHex, setCustomHex] = useState(value.color);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const r = anchorEl.getBoundingClientRect();
    const width = 260;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    let top = r.bottom + 6;
    const estHeight = showLineControls ? 280 : 200;
    if (top + estHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - estHeight - 6);
    }
    setPos({ top, left });
  }, [open, anchorEl, showLineControls]);

  useEffect(() => {
    if (!open) return;
    setCustomHex(value.color);
  }, [open, value.color]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorEl?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !pos) return null;

  const opacityPct = Math.round(value.opacity * 100);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[200] w-[260px] rounded-lg border border-border bg-surface text-foreground shadow-xl p-3 space-y-3"
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
              value.color.toLowerCase() === c.toLowerCase()
                ? 'border-foreground ring-2 ring-foreground/40'
                : 'border-border hover:border-muted',
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
          className="h-8 w-8 cursor-pointer rounded border border-border bg-background p-0.5"
          aria-label="Custom color"
          title="Custom color"
        />
        <input
          type="text"
          value={customHex}
          onChange={(e) => {
            const v = e.target.value;
            setCustomHex(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange({ color: v });
          }}
          className="flex-1 min-h-9 rounded-md border border-border bg-background px-2 text-xs font-mono text-foreground outline-none focus:border-accent"
          spellCheck={false}
          aria-label="Hex color"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Opacity</span>
          <span className="tabular-nums text-foreground">{opacityPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={opacityPct}
            onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
            className="flex-1 h-1 accent-[var(--accent)]"
            aria-label="Opacity"
          />
          <input
            type="number"
            min={5}
            max={100}
            value={opacityPct}
            onChange={(e) => {
              const n = Math.max(5, Math.min(100, Number(e.target.value) || 100));
              onChange({ opacity: n / 100 });
            }}
            className="w-14 min-h-9 rounded-md border border-border bg-background px-1.5 text-xs tabular-nums text-foreground outline-none focus:border-accent"
            aria-label="Opacity percent"
          />
        </div>
      </div>

      {showLineControls && (
        <>
          <div className="space-y-1.5">
            <div className="text-xs text-muted">Thickness</div>
            <SegmentedControl
              ariaLabel="Line thickness"
              value={
                (widths as readonly number[]).includes(value.width)
                  ? value.width
                  : (widths.find((w) => w >= value.width) ?? widths[widths.length - 1]!)
              }
              onChange={(w) => onChange({ width: w })}
              options={widths.map((w) => ({
                id: w,
                title: `${w}px`,
                content: (
                  <span
                    className="block w-5 rounded-full bg-current"
                    style={{ height: Math.max(1, Math.min(8, w / (widths.length > 4 ? 8 : 1))) }}
                  />
                ),
              }))}
            />
          </div>

          {!hideDash && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted">Line style</div>
              <SegmentedControl
                ariaLabel="Line style"
                value={value.lineStyle}
                onChange={(lineStyle) => onChange({ lineStyle })}
                options={LINE_STYLES.map((ls) => ({
                  id: ls.id,
                  title: ls.title,
                  content: (
                    <svg width="28" height="10" viewBox="0 0 28 10">
                      <line
                        x1="2"
                        y1="5"
                        x2="26"
                        y2="5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray={ls.dash || undefined}
                      />
                    </svg>
                  ),
                }))}
              />
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

/** Map DrawingStyle → picker value. */
export function styleToPickerValue(style: DrawingStyle): LineStylePickerValue {
  return {
    color: style.color,
    opacity: style.opacity,
    width: style.width,
    lineStyle: style.lineStyle,
  };
}
