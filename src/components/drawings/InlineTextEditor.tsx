import { useEffect, useRef } from 'react';
import type { Drawing } from '@/drawings/drawingStore';

export interface InlineTextEditorProps {
  drawing: Drawing;
  /** Media → CSS pixel mapping from the active chart pane. */
  anchor: { clientX: number; clientY: number } | null;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * On-chart text edit (dblclick / place). Overlay input at the drawing anchor.
 */
export function InlineTextEditor({
  drawing,
  anchor,
  onCommit,
  onCancel,
}: InlineTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [drawing.id]);

  if (!anchor) return null;

  const fontSize = Math.max(12, drawing.style.fontSize || 14);

  return (
    <textarea
      ref={ref}
      defaultValue={drawing.text || ''}
      aria-label="Edit drawing text"
      className="fixed z-[90] min-h-11 min-w-[10rem] max-w-[min(90vw,20rem)] rounded-md border border-accent bg-surface px-2 py-1.5 text-foreground shadow-xl resize-none"
      style={{
        left: Math.max(8, anchor.clientX),
        top: Math.max(8, anchor.clientY - fontSize),
        fontSize,
        fontWeight: drawing.style.textBold ? 700 : 400,
        fontStyle: drawing.style.textItalic ? 'italic' : 'normal',
        color: drawing.style.textColor || drawing.style.color,
      }}
      rows={2}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onCommit(e.currentTarget.value);
        }
      }}
      onBlur={(e) => onCommit(e.currentTarget.value)}
    />
  );
}
