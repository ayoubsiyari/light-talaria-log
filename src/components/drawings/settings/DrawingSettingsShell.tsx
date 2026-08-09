import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import { SettingsTabs, type SettingsTabItem } from '@/components/drawings/settings/SettingsTabs';

interface DrawingSettingsShellProps<T extends string> {
  title: string;
  /** ChromeIcon name for the tool (settings header). */
  iconName?: string;
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
  /** Header-right template control (Obsidian: next to close). */
  headerTrailing?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  onBackdrop: () => void;
}

/**
 * Obsidian drawing settings chrome (Talaria V9 / data-sett-v3).
 * Styled by src/v9/chrome-settings.css — keep data-* attrs in sync.
 */
export function DrawingSettingsShell<T extends string>({
  title,
  iconName = 'trendline',
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
  headerTrailing,
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
      const t = e.target as HTMLElement;
      if (t.closest('button, input, a, [data-tpl-trigger], [data-tpl-menu]')) return;
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
        return;
      }
      const panel = panelRef.current;
      if (!panel) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const rect = panel.getBoundingClientRect();
      const baseX = offset?.x ?? 0;
      const baseY = offset?.y ?? 0;
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
    const w = panel?.offsetWidth ?? 448;
    const h = panel?.offsetHeight ?? 480;
    const maxX = window.innerWidth / 2 - w / 2 - 8;
    const maxY = window.innerHeight / 2 - h / 2 - 8;
    setOffset({
      x: Math.max(-maxX, Math.min(maxX, d.origX + dx)),
      y: Math.max(-maxY, Math.min(maxY, d.origY + dy)),
    });
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

  useEffect(() => {
    setOffset(null);
  }, [title]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
      {/* Obsidian: no heavy dim — light click-catcher only */}
      <button
        type="button"
        className="absolute inset-0 pointer-events-auto cursor-default border-0 p-0 bg-transparent"
        aria-label="Close settings"
        onClick={onBackdrop}
      />
      <div
        ref={panelRef}
        data-v9-chrome="1"
        data-sett-v3="1"
        data-tool-sett-v2="1"
        data-chrome-win="tool-sett"
        className="pointer-events-auto relative flex flex-col max-sm:rounded-t-xl max-sm:w-full max-sm:max-h-[min(92vh,700px)]"
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
          data-win-header=""
          className="sm:cursor-grab active:sm:cursor-grabbing touch-none select-none"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <div data-win-icon="" aria-hidden>
            <ChromeIcon n={iconName} s={16} cl="var(--accent)" />
          </div>

          <div data-sett-titles="">
            {renaming ? (
              <input
                data-sett-rename=""
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
                aria-label="Drawing name"
              />
            ) : (
              <button
                type="button"
                data-win-title=""
                className="text-left border-0 bg-transparent p-0 cursor-text"
                onDoubleClick={onStartRename}
                title="Double-click to rename"
              >
                {title}
              </button>
            )}
            <span data-sett-sub="">Drawing settings</span>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {headerTrailing}
            <button
              type="button"
              data-brand-icon="1"
              className="inline-flex items-center justify-center text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
              onClick={onClose}
              aria-label="Close"
            >
              <ChromeIcon n="x" s={16} />
            </button>
          </div>
        </div>

        <SettingsTabs tabs={tabs} value={tab} onChange={onTabChange} />

        <div data-tool-sett-body="" data-sett-body="">
          <div data-tool-sett-pane="" data-sett-pane="" className="space-y-0.5">
            {children}
          </div>
        </div>

        <div data-sett-foot="" data-win-foot="" className="flex items-center justify-end gap-2 px-3 py-3 border-t border-[color:var(--line)] shrink-0">
          {footer}
        </div>
      </div>
    </div>
  );
}
