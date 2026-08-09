import { useEffect, useRef, useState } from 'react';
import type { DrawingToolId } from '@/drawings/toolRegistry';
import {
  clearDrawingTemplate,
  hasDrawingTemplate,
  resolveDrawingTemplate,
  saveDrawingTemplate,
  type DrawingTemplate,
} from '@/drawings/drawingTemplates';
import type { DrawingStyle } from '@/drawings/drawingStyle';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import { IconChevron } from '@/components/icons/ToolIcons';

interface TemplateMenuProps {
  type: DrawingToolId;
  style: DrawingStyle;
  meta: Record<string, unknown>;
  onApply: (t: DrawingTemplate) => void;
  /** Obsidian header icon trigger (default: labeled footer button). */
  variant?: 'button' | 'icon';
}

/**
 * Template menu: Apply default · Save as default · Reset to factory.
 * Obsidian: icon in header (`variant="icon"`).
 */
export function TemplateMenu({
  type,
  style,
  meta,
  onApply,
  variant = 'button',
}: TemplateMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const saved = hasDrawingTemplate(type);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [open]);

  const menu = open ? (
    <div
      role="menu"
      data-tpl-menu=""
      data-sett-drop=""
      className={[
        'absolute z-20 min-w-[200px] rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] py-1',
        variant === 'icon' ? 'right-0 top-full mt-1' : 'bottom-full left-0 mb-1',
      ].join(' ')}
    >
      <button
        type="button"
        role="menuitem"
        className="w-full text-left px-3 py-2.5 min-h-11 text-sm text-foreground hover:bg-[color:var(--surface-sunken)]"
        onClick={() => {
          onApply(resolveDrawingTemplate(type));
          setOpen(false);
        }}
      >
        Apply default{saved ? '' : ' (factory)'}
      </button>
      <button
        type="button"
        role="menuitem"
        className="w-full text-left px-3 py-2.5 min-h-11 text-sm text-foreground hover:bg-[color:var(--surface-sunken)]"
        onClick={() => {
          saveDrawingTemplate(type, style, meta);
          setOpen(false);
        }}
      >
        Save as default
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!saved}
        className={[
          'w-full text-left px-3 py-2.5 min-h-11 text-sm',
          saved
            ? 'text-foreground hover:bg-[color:var(--surface-sunken)]'
            : 'text-muted cursor-not-allowed',
        ].join(' ')}
        onClick={() => {
          if (!saved) return;
          clearDrawingTemplate(type);
          onApply(resolveDrawingTemplate(type));
          setOpen(false);
        }}
      >
        Reset to factory
      </button>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative">
      {variant === 'icon' ? (
        <button
          type="button"
          data-tpl-trigger=""
          data-brand-icon="1"
          className="inline-flex items-center justify-center text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          title="Template"
        >
          <ChromeIcon n="template" s={16} />
        </button>
      ) : (
        <button
          type="button"
          className="min-h-11 sm:min-h-9 px-3 rounded-md border border-border text-foreground text-sm hover:bg-background/80 inline-flex items-center gap-1.5"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          Template
          <IconChevron className="w-3.5 h-3.5 rotate-90 opacity-70" />
        </button>
      )}
      {menu}
    </div>
  );
}
