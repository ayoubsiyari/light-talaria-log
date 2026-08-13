import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObsidianColorPanel } from '@/components/drawings/settings/obsidian/ObsidianColorPanel';

interface FillColorFlyoutProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  color: string;
  opacity: number;
  onChange: (partial: { color?: string; opacity?: number }) => void;
  onClose: () => void;
}

/** Color + opacity panel for fill, same chrome as stroke style flyout. */
export function FillColorFlyout({
  open,
  anchorEl,
  color,
  opacity,
  onChange,
  onClose,
}: FillColorFlyoutProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const r = anchorEl.getBoundingClientRect();
    const width = 236;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const estH = 320;
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - 8) {
      top = Math.max(8, r.top - estH - 6);
    }
    setPos({ top, left });
  }, [open, anchorEl]);

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
      data-style-flyout="1"
      data-drawing-toolbar="1"
      className="fixed z-[200] w-[236px] rounded-lg border border-border bg-surface text-foreground shadow-xl overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ObsidianColorPanel
        color={color}
        opacity={opacity}
        showOpacity
        onChange={onChange}
        onRequestClose={onClose}
      />
    </div>,
    document.body,
  );
}
