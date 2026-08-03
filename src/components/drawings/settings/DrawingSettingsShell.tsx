import type { ReactNode } from 'react';
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
 * TV-style settings chrome: backdrop, header+pencil, underline tabs, scroll body, footer.
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'var(--backdrop, rgba(0,0,0,0.5))' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBackdrop();
      }}
    >
      <div
        className="w-full sm:max-w-[420px] rounded-t-xl sm:rounded-xl border border-border bg-surface text-foreground shadow-2xl overflow-hidden flex flex-col max-h-[min(92vh,640px)]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
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
