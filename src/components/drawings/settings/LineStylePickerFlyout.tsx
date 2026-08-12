import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LINE_WIDTHS,
  type DrawingStyle,
  type LineStyleKind,
} from '@/drawings/drawingStyle';
import { SegmentedControl } from '@/components/drawings/settings/SegmentedControl';
import { ObsidianColorPanel } from '@/components/drawings/settings/obsidian/ObsidianColorPanel';

const LINE_STYLES: { id: LineStyleKind; dash: string; title: string }[] = [
  { id: 'solid', dash: '', title: 'Solid' },
  { id: 'dotted', dash: '2 4', title: 'Dotted' },
  { id: 'dashed', dash: '7 4', title: 'Dashed' },
  { id: 'dashdot', dash: '7 4 2 4', title: 'Dash-dot' },
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
 * Obsidian style flyout: TV color panel + thickness / dash.
 * No native browser color input.
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

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const r = anchorEl.getBoundingClientRect();
    const width = 248;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    let top = r.bottom + 6;
    const estHeight = showLineControls ? 420 : 300;
    if (top + estHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - estHeight - 6);
    }
    setPos({ top, left });
  }, [open, anchorEl, showLineControls]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorEl?.contains(t)) return;
      onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-v9-chrome="1"
      className="fixed z-[200] w-[248px] rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] text-foreground overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ObsidianColorPanel
        color={value.color}
        opacity={value.opacity}
        showOpacity
        onChange={(partial) => onChange(partial)}
        onRequestClose={onClose}
      />

      {showLineControls && (
        <div className="px-2.5 pb-3 pt-1 space-y-3 border-t border-[color:var(--line)]">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Thickness
            </div>
            <SegmentedControl
              ariaLabel="Line thickness"
              value={
                (widths as readonly number[]).includes(value.width)
                  ? value.width
                  : (widths.find((w) => w >= value.width) ??
                    widths[widths.length - 1]!)
              }
              onChange={(w) => onChange({ width: w })}
              options={widths.map((w) => ({
                id: w,
                title: `${w}px`,
                content: (
                  <span
                    className="block w-5 rounded-full bg-current"
                    style={{
                      height: Math.max(
                        1,
                        Math.min(8, w / (widths.length > 4 ? 8 : 1)),
                      ),
                    }}
                  />
                ),
              }))}
            />
          </div>

          {!hideDash && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Line style
              </div>
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
        </div>
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
