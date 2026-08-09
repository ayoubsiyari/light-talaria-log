import { useEffect, useRef, useState } from 'react';
import { IconLock, IconSettings, IconTrash } from '@/components/icons/ToolIcons';
import type { Drawing } from '@/drawings/drawingStore';
import type { DrawingStyle } from '@/drawings/drawingStyle';
import { getTool } from '@/drawings/toolRegistry';
import { getToolSettings } from '@/drawings/toolSettings';
import { StyleTriggerButton } from '@/components/drawings/settings/StyleTriggerButton';
import {
  LineStylePickerFlyout,
  styleToPickerValue,
} from '@/components/drawings/settings/LineStylePickerFlyout';

interface DrawingFloatingToolbarProps {
  drawing: Drawing;
  onChange: (patch: Partial<Drawing>) => void;
  onOpenSettings: () => void;
  onDelete: () => void;
  disabled?: boolean;
  /** When true, style flyout is suppressed (settings modal owns style). */
  suppressStyleFlyout?: boolean;
  onClone?: () => void;
  onCopy?: () => void;
  onHide?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onEditText?: () => void;
}

/**
 * TradingView-style floating bar above a selected drawing:
 * style picker · settings · lock · delete · more
 */
export function DrawingFloatingToolbar({
  drawing,
  onChange,
  onOpenSettings,
  onDelete,
  disabled = false,
  suppressStyleFlyout = false,
  onClone,
  onCopy,
  onHide,
  onBringToFront,
  onSendToBack,
  onEditText,
}: DrawingFloatingToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const styleBtnRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const tool = getTool(drawing.type);
  const toolSettings = getToolSettings(drawing.type);
  const style = drawing.style;
  const canEditText = !!tool.needsText || drawing.type === 'callout';

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [moreOpen]);

  const patchStyle = (partial: Partial<DrawingStyle>) => {
    const next = { ...style, ...partial };
    if (partial.color && style.fillColor === style.color) {
      next.fillColor = partial.color;
    }
    if (toolSettings.hideDash) next.lineStyle = 'solid';
    onChange({ style: next });
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

  const menuItem =
    'w-full min-h-11 px-3 text-left text-sm text-foreground hover:bg-background/80 disabled:opacity-40';

  return (
    <div
      className="pointer-events-auto relative flex items-center gap-0.5 rounded-lg border border-border bg-surface text-foreground shadow-xl px-1.5 py-1 max-w-full overflow-x-auto overscroll-x-contain"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="px-1 text-muted/50 select-none text-xs tracking-widest" title={tool.label}>
        ⠿
      </span>

      <div className="w-px h-5 bg-border mx-0.5" />

      {!suppressStyleFlyout && (
        <>
          <StyleTriggerButton
            ref={styleBtnRef}
            style={style}
            disabled={disabled}
            active={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
          />
          <div className="w-px h-5 bg-border mx-0.5" />
        </>
      )}

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

      <div className="relative" ref={moreRef}>
        <button
          type="button"
          title="More"
          className={btn(moreOpen)}
          onClick={() => setMoreOpen((v) => !v)}
        >
          ···
        </button>
        {moreOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[11rem] rounded-lg border border-border bg-surface shadow-xl py-1">
            {canEditText && onEditText && (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  setMoreOpen(false);
                  onEditText();
                }}
              >
                Edit text
              </button>
            )}
            {onClone && (
              <button
                type="button"
                className={menuItem}
                disabled={disabled}
                onClick={() => {
                  setMoreOpen(false);
                  onClone();
                }}
              >
                Clone
              </button>
            )}
            {onCopy && (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  setMoreOpen(false);
                  onCopy();
                }}
              >
                Copy
              </button>
            )}
            {onHide && (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  setMoreOpen(false);
                  onHide();
                }}
              >
                Hide
              </button>
            )}
            {onBringToFront && (
              <button
                type="button"
                className={menuItem}
                disabled={disabled}
                onClick={() => {
                  setMoreOpen(false);
                  onBringToFront();
                }}
              >
                Bring to front
              </button>
            )}
            {onSendToBack && (
              <button
                type="button"
                className={menuItem}
                disabled={disabled}
                onClick={() => {
                  setMoreOpen(false);
                  onSendToBack();
                }}
              >
                Send to back
              </button>
            )}
          </div>
        )}
      </div>

      {!suppressStyleFlyout && (
        <LineStylePickerFlyout
          open={pickerOpen}
          anchorEl={styleBtnRef.current}
          value={styleToPickerValue(style)}
          hideDash={toolSettings.hideDash}
          widthPresets={toolSettings.widthPresets}
          onChange={patchStyle}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
