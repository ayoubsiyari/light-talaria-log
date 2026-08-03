import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { IconPencil } from '@/components/icons/ToolIcons';
import { SettingsTabs, type SettingsTabItem } from '@/components/drawings/settings/SettingsTabs';

interface DrawingSettingsShellProps<T extends string> {
  title: string;
  renaming: boolean;
  renameValue: string;
  onRenameValueChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  tabs: readonly SettingsTabItem<T>[];
  tab: T;
  onTabChange: (id: T) => void;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  onBackdrop: () => void;
}

/**
 * TV-style settings chrome: draggable panel, header+pencil, underline tabs, footer.
 * Backdrop click still closes; drag from the header only.
 */
export function DrawingSettingsShell<T extends string>({
  title,
  renaming,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  tabs,
  tab,
  onTabChange,
  children,
  footer,
  onClose,
  onBackdrop,
}: DrawingSettingsShellProps<T>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (renaming) return;
      // Don't start drag from interactive controls in the header.
      const t = e.target as HTMLElement;
      if (t.closest('button, input, a')) return;
      // Mobile bottom-sheet: keep anchored; drag on sm+.
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
        return;
      }
      const panel = panelRef.current;
      if (!panel) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const rect = panel.getBoundingClientRect();
      // First drag: convert centered layout into absolute offset from viewport center.
      const baseX = offset?.x ?? 0;
      const baseY = offset?.y ?? 0;
      // If never dragged, seed from current visual position vs centered default.
      let origX = baseX;
      let origY = baseY;
      if (offset == null) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        origX = rect.left + rect.width / 2 - cx;
        origY = rect.top + rect.height / 2 - cy;
        setOffset({ x: origX, y: origY });
      }
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX,
        origY,
      };
    },
    [offset, renaming],
  );

  const onHeaderPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const panel = panelRef.current;
    const w = panel?.offsetWidth ?? 420;
    const h = panel?.offsetHeight ?? 480;
    const maxX = window.innerWidth / 2 - w / 2 - 8;
    const maxY = window.innerHeight / 2 - h / 2 - 8;
    const nextX = Math.max(-maxX, Math.min(maxX, d.origX + dx));
    const nextY = Math.max(-maxY, Math.min(maxY, d.origY + dy));
    setOffset({ x: nextX, y: nextY });
  }, []);

  const onHeaderPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  // Reset position when title changes (new drawing selected).
  useEffect(() => {
    setOffset(null);
  }, [title]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
      // Transparent hit layer only for backdrop close — panel is pointer-events-auto.
    >
      <button
        type="button"
        className="absolute inset-0 pointer-events-auto cursor-default border-0 p-0"
        style={{ backgroundColor: 'var(--backdrop, rgba(0,0,0,0.35))' }}
        aria-label="Close settings"
        onClick={onBackdrop}
      />
      <div
        ref={panelRef}
        className="pointer-events-auto relative w-full sm:max-w-[420px] rounded-t-xl sm:rounded-xl border border-border bg-surface text-foreground shadow-2xl overflow-hidden flex flex-col max-h-[min(92vh,640px)]"
        style={
          offset
            ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
            : undefined
        }
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 sm:cursor-grab active:sm:cursor-grabbing touch-none select-none"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => onRenameValueChange(e.target.value)}
                onBlur={onCommitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCommitRename();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    onCancelRename();
                  }
                }}
                className="min-h-11 sm:min-h-9 w-full max-w-[260px] rounded-md border border-accent bg-background px-2 text-base font-semibold text-foreground outline-none"
                aria-label="Drawing name"
              />
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
                <button
                  type="button"
                  className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 rounded-md text-muted hover:text-foreground hover:bg-background/70 flex items-center justify-center shrink-0"
                  onClick={onStartRename}
                  title="Rename"
                  aria-label="Rename drawing"
                >
                  <IconPencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            className="text-muted hover:text-foreground min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 rounded-md hover:bg-background/70 flex items-center justify-center shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <SettingsTabs tabs={tabs} value={tab} onChange={onTabChange} />

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">{children}</div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border bg-background/30">
          {footer}
        </div>
      </div>
    </div>
  );
}
