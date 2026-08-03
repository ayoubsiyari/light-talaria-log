import { useRef, useState } from 'react';
import { IconLock, IconSettings, IconTrash } from '@/components/icons/ToolIcons';
import type { Drawing } from '@/drawings/drawingStore';
import type { DrawingStyle } from '@/drawings/drawingStyle';
import { getTool } from '@/drawings/toolRegistry';
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
}

/**
 * TradingView-style floating bar above a selected drawing:
 * style picker · settings · lock · delete
 */
export function DrawingFloatingToolbar({
  drawing,
  onChange,
  onOpenSettings,
  onDelete,
  disabled = false,
  suppressStyleFlyout = false,
}: DrawingFloatingToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const styleBtnRef = useRef<HTMLButtonElement>(null);
  const tool = getTool(drawing.type);
  const style = drawing.style;

  const patchStyle = (partial: Partial<DrawingStyle>) => {
    const next = { ...style, ...partial };
    if (partial.color && style.fillColor === style.color) {
      next.fillColor = partial.color;
    }
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

  return (
    <div
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-surface text-foreground shadow-xl px-1.5 py-1 max-w-full overflow-x-auto overscroll-x-contain"
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

      {!suppressStyleFlyout && (
        <LineStylePickerFlyout
          open={pickerOpen}
          anchorEl={styleBtnRef.current}
          value={styleToPickerValue(style)}
          onChange={patchStyle}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
