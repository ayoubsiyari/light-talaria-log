import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconChevron } from '@/components/icons/ToolIcons';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import {
  magnetModeLabel,
  nextMagnetMode,
  type MagnetMode,
} from '@/drawings/magnet';
import {
  CATEGORY_DEFAULT_TOOL,
  TOOL_CATEGORIES,
  TOOLS,
  type DrawingToolId,
  type ToolCategoryId,
} from '@/drawings/toolRegistry';
import {
  isDefaultFlyoutTool,
  maturityBadge,
  readShowMoreTools,
  writeShowMoreTools,
} from '@/drawings/toolMaturity';
import { chromeIconForTool } from '@/drawings/chromeToolIcon';
import type { ChartToolId } from '@/types/ui';

/** TradingView rail sections — dividers create space between groups. */
type RailSection = 'draw' | 'measure';

/** Group related categories under one toolbar button (TV ordering). */
const TOOLBAR_GROUPS: {
  id: string;
  label: string;
  /** V9 ChromeIcon name for the group button. */
  chromeIcon: string;
  categories: ToolCategoryId[];
  section: RailSection;
  /** Hide this group button until “More tools” is enabled. */
  moreOnly?: boolean;
}[] = [
  {
    id: 'lines',
    label: 'Lines',
    chromeIcon: 'trendline',
    categories: ['lines'],
    section: 'draw',
  },
  {
    id: 'channels',
    label: 'Channels',
    chromeIcon: 'channel',
    categories: ['channels', 'pitchforks'],
    section: 'draw',
  },
  {
    id: 'fib',
    label: 'Fibonacci',
    chromeIcon: 'fib',
    categories: ['fibonacci', 'gann'],
    section: 'draw',
  },
  {
    id: 'shapes',
    label: 'Shapes',
    chromeIcon: 'rect',
    categories: ['shapes'],
    section: 'draw',
  },
  {
    id: 'brushes',
    label: 'Brushes & Arrows',
    chromeIcon: 'draw',
    categories: ['brushes', 'arrows'],
    section: 'draw',
  },
  {
    id: 'patterns',
    label: 'Patterns',
    chromeIcon: 'wave',
    categories: ['patterns', 'elliott', 'cycles'],
    section: 'draw',
    moreOnly: true,
  },
  {
    id: 'text',
    label: 'Text',
    chromeIcon: 'text',
    categories: ['text'],
    section: 'draw',
  },
  {
    id: 'measure',
    label: 'Measure & Forecast',
    chromeIcon: 'measure',
    categories: ['measure', 'forecast', 'volume'],
    section: 'measure',
  },
];

interface LeftToolbarProps {
  activeTool: ChartToolId;
  onToolChange: (tool: ChartToolId) => void;
  /** Open object tree panel. */
  onOpenObjectTree?: () => void;
  /** Remove all drawings (after confirm in toolbar menu). */
  onClearDrawings?: () => void;
  drawingCount?: number;
  magnetMode: MagnetMode;
  onMagnetModeChange: (v: MagnetMode) => void;
  stayInDrawingMode: boolean;
  onStayInDrawingModeChange: (v: boolean) => void;
  drawingsLocked: boolean;
  onDrawingsLockedChange: (v: boolean) => void;
  drawingsHidden: boolean;
  onDrawingsHiddenChange: (v: boolean) => void;
}

export function LeftToolbar({
  activeTool,
  onToolChange,
  onOpenObjectTree,
  onClearDrawings,
  drawingCount = 0,
  magnetMode,
  onMagnetModeChange,
  stayInDrawingMode,
  onStayInDrawingModeChange,
  drawingsLocked,
  onDrawingsLockedChange,
  drawingsHidden,
  onDrawingsHiddenChange,
}: LeftToolbarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [removeMenuOpen, setRemoveMenuOpen] = useState(false);
  const [cursorMenuOpen, setCursorMenuOpen] = useState(false);
  const [magnetMenuOpen, setMagnetMenuOpen] = useState(false);
  const [visMenuOpen, setVisMenuOpen] = useState(false);
  const [cursorStyle, setCursorStyle] = useState<'cross' | 'dot' | 'arrow'>('cross');
  const [indicatorsHidden, setIndicatorsHidden] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(() => readShowMoreTools());
  const [menuTop, setMenuTop] = useState(0);
  const [lastByCategory, setLastByCategory] = useState<Record<string, DrawingToolId>>(() => ({
    ...CATEGORY_DEFAULT_TOOL,
  }));
  const rootRef = useRef<HTMLElement>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const removeBtnRef = useRef<HTMLButtonElement>(null);

  const setShowMore = (on: boolean) => {
    setShowMoreTools(on);
    writeShowMoreTools(on);
  };

  const toolVisible = (id: DrawingToolId) =>
    showMoreTools || isDefaultFlyoutTool(id);

  const categoryHasVisibleTools = (catId: ToolCategoryId) => {
    const cat = TOOL_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return false;
    return cat.sections.some((sec) => sec.tools.some(toolVisible));
  };

  const visibleGroups = useMemo(
    () =>
      TOOLBAR_GROUPS.filter((g) => {
        if (g.moreOnly && !showMoreTools) return false;
        return g.categories.some(categoryHasVisibleTools);
      }),
    // toolVisible closes over showMoreTools
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showMoreTools],
  );

  const drawGroups = useMemo(
    () => visibleGroups.filter((g) => g.section === 'draw'),
    [visibleGroups],
  );
  const measureGroups = useMemo(
    () => visibleGroups.filter((g) => g.section === 'measure'),
    [visibleGroups],
  );

  useEffect(() => {
    if (!openGroup && !removeMenuOpen && !cursorMenuOpen && !magnetMenuOpen && !visMenuOpen) {
      return;
    }
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpenGroup(null);
        setRemoveMenuOpen(false);
        setCursorMenuOpen(false);
        setMagnetMenuOpen(false);
        setVisMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [openGroup, removeMenuOpen, cursorMenuOpen, magnetMenuOpen, visMenuOpen]);

  useLayoutEffect(() => {
    if (!openGroup || !rootRef.current) return;
    const el = groupRefs.current[openGroup];
    if (!el) return;
    const rootRect = rootRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setMenuTop(elRect.top - rootRect.top);
  }, [openGroup]);

  const activeDrawing =
    activeTool !== 'cursor' && activeTool !== 'zoom' ? (activeTool as DrawingToolId) : null;

  const openCategories = useMemo(() => {
    const g = TOOLBAR_GROUPS.find((x) => x.id === openGroup);
    if (!g) return [];
    return TOOL_CATEGORIES.filter((c) => g.categories.includes(c.id));
  }, [openGroup]);

  const selectTool = (id: DrawingToolId) => {
    const def = TOOLS[id];
    setLastByCategory((prev) => ({ ...prev, [def.category]: id }));
    onToolChange(id);
    setOpenGroup(null);
  };

  const activateGroup = (categories: ToolCategoryId[]) => {
    for (const cat of categories) {
      const last = lastByCategory[cat] ?? CATEGORY_DEFAULT_TOOL[cat];
      if (toolVisible(last)) {
        onToolChange(last);
        setOpenGroup(null);
        return;
      }
      const catDef = TOOL_CATEGORIES.find((c) => c.id === cat);
      const firstVisible = catDef?.sections
        .flatMap((s) => s.tools)
        .find(toolVisible);
      if (firstVisible) {
        onToolChange(firstVisible);
        setOpenGroup(null);
        return;
      }
    }
  };

  const toggleGroupMenu = (groupId: string) => {
    setOpenGroup((cur) => (cur === groupId ? null : groupId));
  };

  const renderGroupButton = (g: (typeof TOOLBAR_GROUPS)[number]) => {
    const active =
      !!activeDrawing &&
      g.categories.some((c) => TOOLS[activeDrawing].category === c);
    const open = openGroup === g.id;
    const lit = active || open;
    return (
      <div
        key={g.id}
        ref={(node) => {
          groupRefs.current[g.id] = node;
        }}
        className="group/tool relative w-full"
        data-open={open ? 'true' : undefined}
      >
        <button
          type="button"
          title={g.label}
          aria-pressed={lit}
          data-active={lit ? 'true' : undefined}
          onClick={() => activateGroup(g.categories)}
          className="v8b-tool"
        >
          <ChromeIcon n={g.chromeIcon} s={18} />
        </button>
        <button
          type="button"
          title={`${g.label} menu`}
          aria-label={`${g.label} menu`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            toggleGroupMenu(g.id);
          }}
          className={[
            'absolute right-0 top-0 h-[34px] w-2.5 flex items-center justify-center',
            'border-0 bg-transparent p-0 text-muted',
            'opacity-0 pointer-events-none',
            'group-hover/tool:opacity-80 group-hover/tool:pointer-events-auto',
            '[@media(hover:none)]:opacity-80 [@media(hover:none)]:pointer-events-auto',
            open ? 'opacity-100 pointer-events-auto text-accent' : '',
          ].join(' ')}
        >
          <IconChevron className="w-2 h-2 shrink-0" />
        </button>
      </div>
    );
  };

  const magnetIcon =
    magnetMode === 'off'
      ? 'magnetOff'
      : magnetMode === 'weak'
        ? 'magnetWeak'
        : magnetMode === 'strong'
          ? 'magnetStrong'
          : 'magnet';

  return (
    <aside
      ref={rootRef}
      data-v9-chrome="1"
      data-v9-rail="1"
      className="chrome-toolbar v8b-rail relative shrink-0 z-40 self-stretch overflow-visible bg-[color:var(--chrome-toolbar,var(--surface))] [@media(hover:none)]:w-12"
    >
      <div className="h-full w-full flex flex-col items-stretch py-1 px-0.5 overflow-y-auto overscroll-contain">
        {/* 1 — Cursor + drawing tools */}
        <div className="v8b-rail-section">
          <div className="group/tool relative w-full">
            <button
              type="button"
              title="Cursor"
              aria-pressed={activeTool === 'cursor'}
              data-brand-icon="1"
              data-rail-item="cursor"
              onClick={() => {
                onToolChange('cursor');
                setOpenGroup(null);
                setCursorMenuOpen(false);
              }}
              className="v8b-tool"
            >
              <ChromeIcon
                n={
                  cursorStyle === 'dot'
                    ? 'cursorDot'
                    : cursorStyle === 'arrow'
                      ? 'cursorArrow'
                      : 'crosshair'
                }
                s={18}
              />
            </button>
            <button
              type="button"
              title="Cursor menu"
              aria-label="Cursor menu"
              aria-expanded={cursorMenuOpen}
              data-rail-caret=""
              onClick={(e) => {
                e.stopPropagation();
                setCursorMenuOpen((v) => !v);
                setOpenGroup(null);
                setMagnetMenuOpen(false);
                setVisMenuOpen(false);
                setRemoveMenuOpen(false);
              }}
              className={[
                'absolute right-0 top-0 h-[34px] w-2.5 flex items-center justify-center',
                'border-0 bg-transparent p-0 text-muted',
                'opacity-0 pointer-events-none',
                'group-hover/tool:opacity-80 group-hover/tool:pointer-events-auto',
                '[@media(hover:none)]:opacity-80 [@media(hover:none)]:pointer-events-auto',
                cursorMenuOpen ? 'opacity-100 pointer-events-auto text-accent' : '',
              ].join(' ')}
            >
              <IconChevron className="w-2 h-2 shrink-0" />
            </button>
          </div>
          {drawGroups.map(renderGroupButton)}
        </div>

        <div className="v8b-rail-divider" aria-hidden />

        {/* 2 — Measure + zoom (TV) */}
        <div className="v8b-rail-section">
          {measureGroups.map(renderGroupButton)}
          <button
            type="button"
            title="Zoom marquee — drag a region to zoom"
            aria-pressed={activeTool === 'zoom'}
            data-brand-icon="1"
            onClick={() => {
              onToolChange('zoom');
              setOpenGroup(null);
              setRemoveMenuOpen(false);
            }}
            className="v8b-tool"
          >
            <ChromeIcon n="measure" s={18} />
          </button>
        </div>

        <div className="v8b-rail-divider" aria-hidden />

        {/* 3 — Magnet / stay / lock / visibility / undo */}
        <div className="v8b-rail-section">
          <div className="group/tool relative w-full">
            <button
              type="button"
              title={`${magnetModeLabel(magnetMode)} (click to cycle)`}
              aria-pressed={magnetMode !== 'off'}
              aria-label={magnetModeLabel(magnetMode)}
              data-brand-icon="1"
              onClick={() => onMagnetModeChange(nextMagnetMode(magnetMode))}
              className="v8b-tool"
            >
              <ChromeIcon n={magnetIcon} s={18} />
            </button>
            <button
              type="button"
              title="Magnet menu"
              aria-label="Magnet menu"
              aria-expanded={magnetMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMagnetMenuOpen((v) => !v);
                setCursorMenuOpen(false);
                setVisMenuOpen(false);
                setOpenGroup(null);
                setRemoveMenuOpen(false);
              }}
              className={[
                'absolute right-0 top-0 h-[34px] w-2.5 flex items-center justify-center',
                'border-0 bg-transparent p-0 text-muted',
                'opacity-0 pointer-events-none',
                'group-hover/tool:opacity-80 group-hover/tool:pointer-events-auto',
                '[@media(hover:none)]:opacity-80 [@media(hover:none)]:pointer-events-auto',
                magnetMenuOpen ? 'opacity-100 pointer-events-auto text-accent' : '',
              ].join(' ')}
            >
              <IconChevron className="w-2 h-2 shrink-0" />
            </button>
          </div>
          <button
            type="button"
            title="Stay in drawing mode"
            aria-pressed={stayInDrawingMode}
            data-brand-icon="1"
            onClick={() => onStayInDrawingModeChange(!stayInDrawingMode)}
            className="v8b-tool"
          >
            <ChromeIcon n="pin" s={18} />
          </button>
          <button
            type="button"
            title={drawingsLocked ? 'Unlock drawings' : 'Lock drawings'}
            aria-pressed={drawingsLocked}
            data-brand-icon="1"
            onClick={() => onDrawingsLockedChange(!drawingsLocked)}
            className="v8b-tool"
          >
            <ChromeIcon n="lock" s={18} />
          </button>
          <div className="group/tool relative w-full">
            <button
              type="button"
              title={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
              aria-pressed={drawingsHidden || indicatorsHidden}
              data-brand-icon="1"
              onClick={() => onDrawingsHiddenChange(!drawingsHidden)}
              className="v8b-tool"
            >
              <ChromeIcon
                n={drawingsHidden || indicatorsHidden ? 'eyeHide' : 'eye'}
                s={18}
              />
            </button>
            <button
              type="button"
              title="Visibility menu"
              aria-label="Visibility menu"
              aria-expanded={visMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setVisMenuOpen((v) => !v);
                setMagnetMenuOpen(false);
                setCursorMenuOpen(false);
                setOpenGroup(null);
                setRemoveMenuOpen(false);
              }}
              className={[
                'absolute right-0 top-0 h-[34px] w-2.5 flex items-center justify-center',
                'border-0 bg-transparent p-0 text-muted',
                'opacity-0 pointer-events-none',
                'group-hover/tool:opacity-80 group-hover/tool:pointer-events-auto',
                '[@media(hover:none)]:opacity-80 [@media(hover:none)]:pointer-events-auto',
                visMenuOpen ? 'opacity-100 pointer-events-auto text-accent' : '',
              ].join(' ')}
            >
              <IconChevron className="w-2 h-2 shrink-0" />
            </button>
          </div>
          <button
            type="button"
            title="Undo (⌘Z)"
            aria-label="Undo drawings"
            data-brand-icon="1"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('talaria:drawings-undo'))
            }
            className="v8b-tool"
          >
            <ChromeIcon n="undo" s={18} />
          </button>
          <button
            type="button"
            title="Redo (⇧⌘Z)"
            aria-label="Redo drawings"
            data-brand-icon="1"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('talaria:drawings-redo'))
            }
            className="v8b-tool"
          >
            <ChromeIcon n="redo" s={18} />
          </button>
          <button
            type="button"
            title="Object tree"
            aria-label="Object tree"
            data-brand-icon="1"
            onClick={() => {
              onOpenObjectTree?.();
              setOpenGroup(null);
              setRemoveMenuOpen(false);
            }}
            className="v8b-tool relative"
          >
            <ChromeIcon n="layers" s={18} />
            {drawingCount > 0 && (
              <span className="absolute bottom-0.5 right-0.5 min-w-[10px] text-[8px] font-semibold leading-none text-accent">
                {drawingCount > 99 ? '99+' : drawingCount}
              </span>
            )}
          </button>
        </div>

        <div className="v8b-rail-divider" aria-hidden />

        {/* 4 — Remove */}
        <div className="v8b-rail-section">
          <button
            ref={removeBtnRef}
            type="button"
            title="Remove drawings"
            aria-expanded={removeMenuOpen}
            data-active={removeMenuOpen ? 'true' : undefined}
            data-brand-icon="1"
            onClick={() => {
              setRemoveMenuOpen((v) => !v);
              setOpenGroup(null);
            }}
            className="v8b-tool hover:!text-[color:var(--down)]"
          >
            <ChromeIcon n="trash" s={18} />
          </button>
        </div>

        <div className="flex-1 min-h-2" />

        <div data-v9-rail-foot="" className="v8b-rail-section pb-1">
          <button
            type="button"
            title="Chrome preset (stub)"
            aria-label="Chrome preset"
            data-brand-icon="1"
            className="v8b-tool text-[10px] font-bold tabular-nums"
            onClick={() => {
              /* stub cycle */
            }}
          >
            1/4
          </button>
        </div>
      </div>

      {cursorMenuOpen && (
        <div
          data-v9-chrome="1"
          data-sdrop="1"
          className="v9-flyout absolute left-full top-2 z-50 ml-1 w-[min(12rem,calc(100vw-4rem))] rounded-[var(--radius-panel,8px)] border border-[color:var(--line)] bg-[color:var(--surface-raised)] py-1 overflow-hidden"
        >
          <div className="v9-flyout-accent" aria-hidden />
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
            Cursor
          </p>
          {(
            [
              { id: 'cross' as const, label: 'Cross', icon: 'crosshair' },
              { id: 'dot' as const, label: 'Dot', icon: 'cursorDot' },
              { id: 'arrow' as const, label: 'Arrow', icon: 'cursorArrow' },
            ] as const
          ).map((row) => (
            <button
              key={row.id}
              type="button"
              data-menu-row=""
              data-active={cursorStyle === row.id && activeTool === 'cursor' ? '1' : undefined}
              className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] hover:bg-[color:var(--surface-sunken)]"
              onClick={() => {
                setCursorStyle(row.id);
                onToolChange('cursor');
                setCursorMenuOpen(false);
              }}
            >
              <ChromeIcon n={row.icon} s={16} />
              <span>{row.label}</span>
            </button>
          ))}
          <button
            type="button"
            data-menu-row=""
            className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] hover:bg-[color:var(--surface-sunken)] opacity-50"
            title="Eraser — stub"
            disabled
          >
            <ChromeIcon n="eraser" s={16} />
            <span>Eraser</span>
            <span className="ml-auto text-[9px] text-muted">Soon</span>
          </button>
        </div>
      )}

      {magnetMenuOpen && (
        <div
          data-v9-chrome="1"
          data-sdrop="1"
          className="v9-flyout absolute left-full z-50 ml-1 w-[min(12rem,calc(100vw-4rem))] rounded-[var(--radius-panel,8px)] border border-[color:var(--line)] bg-[color:var(--surface-raised)] py-1 overflow-hidden"
          style={{ top: 120 }}
        >
          <div className="v9-flyout-accent" aria-hidden />
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
            Magnet
          </p>
          {(
            [
              { id: 'off' as const, label: 'Off', icon: 'magnetOff' },
              { id: 'weak' as const, label: 'Weak', icon: 'magnetWeak' },
              { id: 'strong' as const, label: 'Strong', icon: 'magnetStrong' },
            ] as const
          ).map((row) => (
            <button
              key={row.id}
              type="button"
              data-menu-row=""
              data-active={magnetMode === row.id ? '1' : undefined}
              className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] hover:bg-[color:var(--surface-sunken)]"
              onClick={() => {
                onMagnetModeChange(row.id);
                setMagnetMenuOpen(false);
              }}
            >
              <ChromeIcon n={row.icon} s={16} />
              <span>{row.label}</span>
            </button>
          ))}
        </div>
      )}

      {visMenuOpen && (
        <div
          data-v9-chrome="1"
          data-sdrop="1"
          className="v9-flyout absolute left-full z-50 ml-1 w-[min(14rem,calc(100vw-4rem))] rounded-[var(--radius-panel,8px)] border border-[color:var(--line)] bg-[color:var(--surface-raised)] py-1 overflow-hidden"
          style={{ top: 160 }}
        >
          <div className="v9-flyout-accent" aria-hidden />
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
            Visibility
          </p>
          <button
            type="button"
            data-menu-row=""
            className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] hover:bg-[color:var(--surface-sunken)]"
            onClick={() => {
              onDrawingsHiddenChange(!drawingsHidden);
              setVisMenuOpen(false);
            }}
          >
            <ChromeIcon n="eye" s={16} />
            <span>{drawingsHidden ? 'Show drawings' : 'Hide drawings'}</span>
          </button>
          <button
            type="button"
            data-menu-row=""
            className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] hover:bg-[color:var(--surface-sunken)]"
            onClick={() => {
              setIndicatorsHidden((v) => !v);
              window.dispatchEvent(
                new CustomEvent('talaria:toggle-indicators-hidden', {
                  detail: { hidden: !indicatorsHidden },
                }),
              );
              setVisMenuOpen(false);
            }}
          >
            <ChromeIcon n="eyeInd" s={16} />
            <span>
              {indicatorsHidden ? 'Show indicators' : 'Hide indicators'}
            </span>
          </button>
          <button
            type="button"
            data-menu-row=""
            className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] hover:bg-[color:var(--surface-sunken)]"
            onClick={() => {
              const hide = !(drawingsHidden && indicatorsHidden);
              onDrawingsHiddenChange(hide);
              setIndicatorsHidden(hide);
              window.dispatchEvent(
                new CustomEvent('talaria:toggle-indicators-hidden', {
                  detail: { hidden: hide },
                }),
              );
              setVisMenuOpen(false);
            }}
          >
            <ChromeIcon n="eyeAll" s={16} />
            <span>Hide all</span>
          </button>
        </div>
      )}

      {removeMenuOpen && (
        <div
          data-v9-chrome="1"
          data-sdrop="1"
          className="v9-flyout absolute left-full bottom-2 z-50 ml-1 w-[min(14rem,calc(100vw-4rem))] rounded-[var(--radius-panel,8px)] border border-[color:var(--line)] bg-[color:var(--surface-raised)] py-1 overflow-hidden"
        >
          <div className="v9-flyout-accent" aria-hidden />
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
            Remove
          </p>
          <button
            type="button"
            disabled={drawingCount === 0 || !onClearDrawings}
            onClick={() => {
              onClearDrawings?.();
              setRemoveMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] text-[color:var(--down)] hover:bg-[color:var(--surface-sunken)] disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChromeIcon n="trash" s={16} />
            <span>
              Remove all drawings
              {drawingCount > 0 ? ` (${drawingCount})` : ''}
            </span>
          </button>
        </div>
      )}

      {openGroup && openCategories.length > 0 && (
        <div
          data-v9-chrome="1"
          data-sdrop="1"
          className="v9-flyout absolute left-full z-50 ml-1 w-[min(16rem,calc(100vw-4rem))] max-h-[min(80vh,640px)] flex flex-col rounded-[var(--radius-panel,8px)] border border-[color:var(--line)] bg-[color:var(--surface-raised)] overflow-hidden"
          style={{ top: menuTop }}
        >
          <div className="v9-flyout-accent shrink-0" aria-hidden />
          <div className="overflow-y-auto overscroll-contain py-1 min-h-0 flex-1">
            {openCategories.map((cat, idx) => {
              const primary = cat.sections.flatMap((s) =>
                s.tools.filter((t) => isDefaultFlyoutTool(t)),
              );
              const extra = cat.sections.flatMap((s) =>
                s.tools.filter((t) => !isDefaultFlyoutTool(t)),
              );
              const shownPrimary = primary.filter(toolVisible);
              const shownExtra = showMoreTools ? extra : [];
              if (shownPrimary.length === 0 && shownExtra.length === 0) {
                return null;
              }
              return (
                <div key={cat.id}>
                  <div
                    className={[
                      'px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted',
                      idx > 0 ? 'border-t border-[color:var(--line)] mt-1' : '',
                    ].join(' ')}
                  >
                    {cat.label}
                  </div>
                  {shownPrimary.map((tid) => (
                    <ToolFlyoutRow
                      key={tid}
                      tid={tid}
                      selected={activeDrawing === tid}
                      onSelect={selectTool}
                    />
                  ))}
                  {shownExtra.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted border-t border-[color:var(--line)] mt-1">
                        More — approximate
                      </div>
                      {shownExtra.map((tid) => (
                        <ToolFlyoutRow
                          key={tid}
                          tid={tid}
                          selected={activeDrawing === tid}
                          onSelect={selectTool}
                          badge={maturityBadge(tid)}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-[color:var(--line)] px-2 py-1.5">
            <button
              type="button"
              role="switch"
              aria-checked={showMoreTools}
              onClick={() => setShowMore(!showMoreTools)}
              className="w-full min-h-11 px-2 rounded-[var(--radius-control,6px)] flex items-center justify-between gap-2 text-left text-[12px] text-muted hover:text-foreground hover:bg-[color:var(--surface-sunken)]"
            >
              <span>More tools (approx / beta)</span>
              <span
                className={[
                  'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                  showMoreTools
                    ? 'bg-[color:var(--accent-quiet)] text-[color:var(--accent)]'
                    : 'bg-[color:var(--surface-sunken)] text-muted',
                ].join(' ')}
              >
                {showMoreTools ? 'On' : 'Off'}
              </span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function ToolFlyoutRow({
  tid,
  selected,
  onSelect,
  badge,
}: {
  tid: DrawingToolId;
  selected: boolean;
  onSelect: (id: DrawingToolId) => void;
  badge?: string | null;
}) {
  const def = TOOLS[tid];
  return (
    <button
      type="button"
      onClick={() => onSelect(tid)}
      className={[
        'relative w-full flex items-center gap-2.5 px-3 h-9 [@media(hover:none)]:min-h-11 text-left text-[13px]',
        selected
          ? 'bg-[color:var(--accent-quiet)] text-[color:var(--accent)] font-semibold'
          : 'text-foreground hover:bg-[color:var(--surface-sunken)]',
      ].join(' ')}
    >
      {selected && (
        <span
          className="absolute left-0 top-[15%] bottom-[15%] w-0.5 rounded-sm bg-[color:var(--accent)]"
          aria-hidden
        />
      )}
      <span className="shrink-0 opacity-90 inline-flex" aria-hidden>
        <ChromeIcon
          n={chromeIconForTool(tid)}
          s={17}
          cl={selected ? 'var(--accent)' : 'currentColor'}
        />
      </span>
      <span className="truncate flex-1 min-w-0">{def.label}</span>
      {badge && (
        <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted border border-[color:var(--line)] rounded px-1 py-0.5">
          {badge}
        </span>
      )}
    </button>
  );
}
