import { useEffect, useRef, useState } from 'react';
import { IconLock, IconSettings, IconTrash } from '@/components/icons/ToolIcons';
import type { Drawing } from '@/drawings/drawingStore';
import type { DrawingStyle } from '@/drawings/drawingStyle';
import { getTool } from '@/drawings/toolRegistry';
import { getToolSettings } from '@/drawings/toolSettings';
import { StyleTriggerButton } from '@/components/drawings/settings/StyleTriggerButton';
import { FillTriggerButton } from '@/components/drawings/settings/FillTriggerButton';
import { FillColorFlyout } from '@/components/drawings/settings/FillColorFlyout';
import {
  LineStylePickerFlyout,
  styleToPickerValue,
} from '@/components/drawings/settings/LineStylePickerFlyout';
import { TemplateMenu } from '@/components/drawings/settings/TemplateMenu';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';

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
  /** Optional alert hook — TV parity; omit to show disabled stub. */
  onAlert?: () => void;
}

/**
 * TradingView-style floating bar above a selected drawing.
 *
 * Common chrome (every tool): template · settings · alert · lock · delete · more
 * Tool-specific middle: stroke / fill / width / dash (style flyout)
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
  onAlert,
}: DrawingFloatingToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const styleBtnRef = useRef<HTMLButtonElement>(null);
  const fillBtnRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const tool = getTool(drawing.type);
  const toolSettings = getToolSettings(drawing.type);
  const style = drawing.style;
  const canEditText = !!tool.needsText || drawing.type === 'callout';
  const showFill = toolSettings.styleSections.includes('fill');

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
      data-drawing-toolbar="1"
    >
      {/* Drag grip */}
      <span
        className="px-1 text-muted/50 select-none text-xs tracking-widest"
        title={tool.label}
      >
        ⠿
      </span>

      <div className="w-px h-5 bg-border mx-0.5 shrink-0" />

      {/* ── Common: template (all tools) ── */}
      <TemplateMenu
        variant="icon"
        type={drawing.type}
        style={style}
        meta={drawing.meta ?? {}}
        disabled={disabled}
        triggerClassName={btn(false)}
        onApply={(t) => onChange({ style: t.style, meta: t.meta })}
      />

      <div className="w-px h-5 bg-border mx-0.5 shrink-0" />

      {/* ── Tool-specific: stroke style · fill color (shapes) ── */}
      {!suppressStyleFlyout && (
        <>
          <StyleTriggerButton
            ref={styleBtnRef}
            style={style}
            disabled={disabled}
            active={pickerOpen}
            onClick={() => {
              setFillOpen(false);
              setPickerOpen((v) => !v);
            }}
          />
          {showFill && (
            <FillTriggerButton
              ref={fillBtnRef}
              color={style.fillColor || style.color}
              opacity={style.fill ? style.fillOpacity : 0}
              disabled={disabled}
              active={fillOpen}
              title="Fill"
              onClick={() => {
                setPickerOpen(false);
                setFillOpen((v) => !v);
              }}
            />
          )}
          <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
        </>
      )}

      {/* ── Common: settings · alert · lock · delete · more ── */}
      <button
        type="button"
        title="Settings"
        className={btn(false)}
        disabled={disabled}
        onClick={onOpenSettings}
      >
        <IconSettings />
      </button>

      <button
        type="button"
        title={onAlert ? 'Add alert' : 'Alert (coming soon)'}
        className={btn(false)}
        disabled={disabled || !onAlert}
        onClick={() => onAlert?.()}
      >
        <ChromeIcon n="bell" s={16} />
      </button>

      <button
        type="button"
        title={drawing.locked ? 'Unlock' : 'Lock'}
        className={btn(!!drawing.locked)}
        disabled={disabled}
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

      <div className="relative shrink-0" ref={moreRef}>
        <button
          type="button"
          title="More"
          className={btn(moreOpen)}
          disabled={disabled}
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

      {!suppressStyleFlyout && showFill && (
        <FillColorFlyout
          open={fillOpen}
          anchorEl={fillBtnRef.current}
          color={style.fillColor || style.color}
          opacity={style.fillOpacity}
          onChange={(partial) => {
            const next = { ...style, fill: true };
            if (partial.color) next.fillColor = partial.color;
            if (partial.opacity != null) next.fillOpacity = partial.opacity;
            onChange({ style: next });
          }}
          onClose={() => setFillOpen(false)}
        />
      )}
    </div>
  );
}
