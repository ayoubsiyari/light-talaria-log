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
import { IconChevron } from '@/components/icons/ToolIcons';

interface TemplateMenuProps {
  type: DrawingToolId;
  style: DrawingStyle;
  meta: Record<string, unknown>;
  onApply: (t: DrawingTemplate) => void;
}

/**
 * Footer template dropdown: Apply default · Save as default · Reset to factory.
 */
export function TemplateMenu({ type, style, meta, onApply }: TemplateMenuProps) {
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

  return (
    <div ref={rootRef} className="relative">
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
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-1 z-10 min-w-[200px] rounded-md border border-border bg-surface shadow-xl py-1"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2.5 min-h-11 text-sm text-foreground hover:bg-background/80"
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
            className="w-full text-left px-3 py-2.5 min-h-11 text-sm text-foreground hover:bg-background/80"
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
                ? 'text-foreground hover:bg-background/80'
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
      )}
    </div>
  );
}
