import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconLock, IconSettings, IconTrash } from '@/components/icons/ToolIcons';
import type { Drawing } from '@/drawings/drawingStore';
import {
  LINE_WIDTHS,
  TV_COLOR_PALETTE,
  type DrawingStyle,
  type LineStyleKind,
} from '@/drawings/drawingStyle';
import { getTool } from '@/drawings/toolRegistry';

interface DrawingFloatingToolbarProps {
  drawing: Drawing;
  onChange: (patch: Partial<Drawing>) => void;
  onOpenSettings: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

const LINE_STYLES: { id: LineStyleKind; label: string; dash: string }[] = [
  { id: 'solid', label: 'Solid', dash: '' },
  { id: 'dashed', label: 'Dashed', dash: '4 3' },
  { id: 'dotted', label: 'Dotted', dash: '1.5 2.5' },
];

type FlyoutId = 'color' | 'width' | 'style' | null;

/**
 * TradingView-style floating bar above a selected drawing:
 * color · width · line style · settings · lock · delete
 *
 * Flyouts portal to document.body so parent overflow / chart clipping cannot hide them.
 */
export function DrawingFloatingToolbar({
  drawing,
  onChange,
  onOpenSettings,
  onDelete,
  disabled = false,
}: DrawingFloatingToolbarProps) {
  const [flyout, setFlyout] = useState<FlyoutId>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const widthBtnRef = useRef<HTMLButtonElement>(null);
  const styleBtnRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const tool = getTool(drawing.type);
  const style = drawing.style;

  const anchorRef = (id: Exclude<FlyoutId, null>) => {
    if (id === 'color') return colorBtnRef;
    if (id === 'width') return widthBtnRef;
    return styleBtnRef;
  };

  useLayoutEffect(() => {
    if (!flyout) {
      setFlyoutPos(null);
      return;
    }
    const el = anchorRef(flyout).current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setFlyoutPos({ top: r.bottom + 4, left: r.left });
  }, [flyout]);

  useEffect(() => {
    if (!flyout) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || flyoutRef.current?.contains(t)) return;
      setFlyout(null);
    };
    const onScroll = () => setFlyout(null);
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [flyout]);

  const patchStyle = (partial: Partial<DrawingStyle>) => {
    onChange({ style: { ...style, ...partial } });
  };

  const openFlyout = (id: Exclude<FlyoutId, null>) => {
    setFlyout((cur) => (cur === id ? null : id));
  };

  const btn = (active: boolean) =>
    [
      'min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 sm:h-8 px-1.5 rounded-md flex items-center justify-center gap-1 transition-colors shrink-0',
      disabled
        ? 'opacity-40 cursor-not-allowed'
        : active
          ? 'bg-accent/20 text-accent'
          : 'text-muted hover:text-foreground hover:bg-background/80',
    ].join(' ');

  const flyoutPanel =
    flyout && flyoutPos
      ? createPortal(
          <div
            ref={flyoutRef}
            className="fixed z-[200] rounded-lg border border-border bg-surface shadow-xl"
            style={{ top: flyoutPos.top, left: flyoutPos.left }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {flyout === 'color' && (
              <div className="p-2 grid grid-cols-8 gap-1 w-[196px]">
                {TV_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    className={[
                      'w-5 h-5 rounded-sm border',
                      style.color === c ? 'border-accent ring-1 ring-accent' : 'border-border',
                    ].join(' ')}
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      patchStyle({ color: c });
                      setFlyout(null);
                    }}
                  />
                ))}
              </div>
            )}
            {flyout === 'width' && (
              <div className="py-1 min-w-[88px]">
                {LINE_WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={[
                      'w-full px-3 py-1.5 text-left text-xs flex items-center gap-2',
                      style.width === w
                        ? 'bg-accent/15 text-accent'
                        : 'text-foreground hover:bg-background/80',
                    ].join(' ')}
                    onClick={() => {
                      patchStyle({ width: w });
                      setFlyout(null);
                    }}
                  >
                    <span
                      className="flex-1 rounded-full bg-current"
                      style={{ height: Math.max(1, w) }}
                    />
                    {w}px
                  </button>
                ))}
              </div>
            )}
            {flyout === 'style' && (
              <div className="py-1 min-w-[120px]">
                {LINE_STYLES.map((ls) => (
                  <button
                    key={ls.id}
                    type="button"
                    className={[
                      'w-full px-3 py-2 text-left text-xs',
                      style.lineStyle === ls.id
                        ? 'bg-accent/15 text-accent'
                        : 'text-foreground hover:bg-background/80',
                    ].join(' ')}
                    onClick={() => {
                      patchStyle({ lineStyle: ls.id });
                      setFlyout(null);
                    }}
                  >
                    <svg width="56" height="10" viewBox="0 0 56 10" className="inline-block">
                      <line
                        x1="2"
                        y1="5"
                        x2="54"
                        y2="5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray={ls.dash || undefined}
                      />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-surface text-foreground shadow-xl px-1.5 py-1 max-w-full"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="px-1 text-muted/50 select-none text-xs tracking-widest" title={tool.label}>
        ⠿
      </span>

      <div className="w-px h-5 bg-border mx-0.5" />

      <button
        ref={colorBtnRef}
        type="button"
        title="Color"
        disabled={disabled}
        className={btn(flyout === 'color')}
        onClick={() => openFlyout('color')}
      >
        <span
          className="w-4 h-4 rounded-sm border border-border"
          style={{ backgroundColor: style.color }}
        />
      </button>

      <button
        ref={widthBtnRef}
        type="button"
        title="Line width"
        disabled={disabled}
        className={btn(flyout === 'width')}
        onClick={() => openFlyout('width')}
      >
        <span className="text-xs tabular-nums text-foreground">{style.width}px</span>
      </button>

      <button
        ref={styleBtnRef}
        type="button"
        title="Line style"
        disabled={disabled}
        className={btn(flyout === 'style')}
        onClick={() => openFlyout('style')}
      >
        <svg width="22" height="10" viewBox="0 0 22 10" className="text-foreground">
          <line
            x1="1"
            y1="5"
            x2="21"
            y2="5"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={
              style.lineStyle === 'dashed'
                ? '4 3'
                : style.lineStyle === 'dotted'
                  ? '1.5 2.5'
                  : undefined
            }
          />
        </svg>
      </button>

      <div className="w-px h-5 bg-border mx-0.5" />

      <button
        type="button"
        title="Settings"
        className={btn(false)}
        onClick={onOpenSettings}
      >
        <IconSettings />
      </button>

      <button
        type="button"
        title={drawing.locked ? 'Unlock' : 'Lock'}
        className={btn(!!drawing.locked)}
        onClick={() => onChange({ locked: !drawing.locked })}
      >
        <IconLock />
      </button>

      <button
        type="button"
        title="Delete"
        disabled={disabled || !!drawing.locked}
        className={[
          btn(false),
          !(disabled || drawing.locked) ? 'hover:text-danger' : '',
        ].join(' ')}
        onClick={onDelete}
      >
        <IconTrash />
      </button>

      {flyoutPanel}
    </div>
  );
}
