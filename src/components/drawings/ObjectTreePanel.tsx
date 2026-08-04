import { useEffect, useMemo } from 'react';
import { Button } from '@heroui/react';
import {
  IconEye,
  IconEyeOff,
  IconLock,
  IconTrash,
} from '@/components/icons/ToolIcons';
import type { Drawing } from '@/drawings/drawingStore';
import { getTool } from '@/drawings/toolRegistry';

export interface ObjectTreePanelProps {
  open: boolean;
  onClose: () => void;
  drawings: readonly Drawing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}

/**
 * Object tree — list all drawings; show/hide, lock, delete, select.
 * Mobile: bottom sheet. Desktop: centered dialog.
 */
export function ObjectTreePanel({
  open,
  onClose,
  drawings,
  selectedId,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDelete,
  onDeleteAll,
}: ObjectTreePanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const rows = useMemo(() => {
    // Newest on top (match paint z-order intuition)
    return [...drawings].reverse();
  }, [drawings]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Object tree"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[min(85vh,640px)] flex flex-col rounded-t-xl sm:rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Object tree</h2>
            <p className="text-xs text-muted">
              {drawings.length === 0
                ? 'No drawings yet'
                : `${drawings.length} drawing${drawings.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 min-w-11"
            onPress={onClose}
            aria-label="Close"
          >
            ✕
          </Button>
        </header>

        <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1">
          {rows.length === 0 ? (
            <li className="px-4 py-8 text-sm text-muted text-center">
              Draw on the chart, then manage objects here.
            </li>
          ) : (
            rows.map((d) => {
              const tool = getTool(d.type);
              const selected = d.id === selectedId;
              const hidden = d.visible === false;
              const locked = !!d.locked;
              const label = d.name?.trim() || d.text?.trim() || tool.label;
              return (
                <li key={d.id}>
                  <div
                    className={[
                      'flex items-center gap-1 px-2 py-1',
                      selected ? 'bg-accent/15' : 'hover:bg-background/70',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(d.id)}
                      className={[
                        'flex-1 min-w-0 min-h-11 px-2 text-left rounded-md',
                        hidden ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      <span className="block text-sm text-foreground truncate">
                        {label}
                      </span>
                      <span className="block text-[11px] text-muted truncate">
                        {tool.label}
                        {locked ? ' · locked' : ''}
                        {hidden ? ' · hidden' : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      title={hidden ? 'Show' : 'Hide'}
                      aria-label={hidden ? 'Show drawing' : 'Hide drawing'}
                      onClick={() => onToggleVisible(d.id)}
                      className="min-h-11 min-w-11 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-background/80"
                    >
                      {hidden ? <IconEyeOff /> : <IconEye />}
                    </button>
                    <button
                      type="button"
                      title={locked ? 'Unlock' : 'Lock'}
                      aria-label={locked ? 'Unlock drawing' : 'Lock drawing'}
                      onClick={() => onToggleLock(d.id)}
                      className={[
                        'min-h-11 min-w-11 rounded-md flex items-center justify-center hover:bg-background/80',
                        locked ? 'text-accent' : 'text-muted hover:text-foreground',
                      ].join(' ')}
                    >
                      <IconLock />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label="Delete drawing"
                      disabled={locked}
                      onClick={() => onDelete(d.id)}
                      className="min-h-11 min-w-11 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-background/80 disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        <footer className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-border safe-area-pb">
          <Button
            size="sm"
            variant="secondary"
            className="min-h-11 text-danger"
            isDisabled={drawings.length === 0}
            onPress={onDeleteAll}
          >
            Remove all
          </Button>
          <Button size="sm" variant="secondary" className="min-h-11" onPress={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}
