import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  IconBrush,
  IconChannel,
  IconChevron,
  IconCursor,
  IconEmoji,
  IconEye,
  IconEyeOff,
  IconFib,
  IconGann,
  IconLock,
  IconMagnet,
  IconMeasure,
  IconObjectTree,
  IconPattern,
  IconPitchfork,
  IconShapes,
  IconStayDraw,
  IconText,
  IconTrash,
  IconTrendLine,
  IconZoom,
} from '@/components/icons/ToolIcons';
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
import type { ChartToolId } from '@/types/ui';

type CategoryIcon = (p: { className?: string }) => ReactNode;

const CATEGORY_ICONS: Record<ToolCategoryId, CategoryIcon> = {
  lines: IconTrendLine,
  channels: IconChannel,
  pitchforks: IconPitchfork,
  fibonacci: IconFib,
  gann: IconGann,
  brushes: IconBrush,
  arrows: IconTrendLine,
  shapes: IconShapes,
  text: IconText,
  patterns: IconPattern,
  elliott: IconPattern,
  cycles: IconPattern,
  forecast: IconMeasure,
  volume: IconMeasure,
  measure: IconMeasure,
};

/** Group related categories under one toolbar button (TV-style). */
const TOOLBAR_GROUPS: {
  id: string;
  label: string;
  Icon: CategoryIcon;
  categories: ToolCategoryId[];
  /** Hide this group button until “More tools” is enabled. */
  moreOnly?: boolean;
}[] = [
  { id: 'lines', label: 'Lines', Icon: IconTrendLine, categories: ['lines'] },
  {
    id: 'channels',
    label: 'Channels',
    Icon: IconPitchfork,
    /** Pitchforks are beta — only listed when “More tools” is on. */
    categories: ['channels', 'pitchforks'],
  },
  {
    id: 'fib',
    label: 'Fibonacci',
    Icon: IconFib,
    categories: ['fibonacci', 'gann'],
  },
  {
    id: 'shapes',
    label: 'Brushes, Arrows & Shapes',
    Icon: IconBrush,
    categories: ['brushes', 'arrows', 'shapes'],
  },
  { id: 'text', label: 'Text', Icon: IconText, categories: ['text'] },
  {
    id: 'patterns',
    label: 'Patterns & Elliott',
    Icon: IconEmoji,
    categories: ['patterns', 'elliott', 'cycles'],
    /** Entire group is approximate/beta — hidden until More tools. */
    moreOnly: true,
  },
  {
    id: 'measure',
    label: 'Measure & Forecast',
    Icon: IconMeasure,
    categories: ['measure', 'forecast', 'volume'],
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

  // pointerdown + capture: chart canvas preventDefault() suppresses mousedown
  useEffect(() => {
    if (!openGroup && !removeMenuOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpenGroup(null);
        setRemoveMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [openGroup, removeMenuOpen]);

  // Align flyout with the open group button (outside scroll clip).
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

  /** Icon click — activate last *visible* tool in the group (no menu). */
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

  /** Arrow click — open/close the TV-style flyout. */
  const toggleGroupMenu = (groupId: string) => {
    setOpenGroup((cur) => (cur === groupId ? null : groupId));
  };

  return (
    <aside
      ref={rootRef}
      className="chrome-toolbar tv-panel-r relative w-[52px] [@media(hover:none)]:w-[56px] shrink-0 z-40 overflow-visible"
    >
      <div className="h-full w-full flex flex-col items-center px-0.5 py-1 gap-0.5 overflow-y-auto overscroll-contain">
        <button
          type="button"
          title="Cursor"
          aria-pressed={activeTool === 'cursor'}
          onClick={() => {
            onToolChange('cursor');
            setOpenGroup(null);
          }}
          className={toolBtn(activeTool === 'cursor')}
        >
          <IconCursor />
        </button>

        {visibleGroups.map((g) => {
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
              className="group/tool relative shrink-0 w-full flex justify-center"
              data-open={open ? 'true' : undefined}
            >
              {/*
                TV: one hover chip; chevron is a right-hand extension of that chip
                (same fill), never a second tab painted over the icon.
              */}
              <div
                className={[
                  'flex items-stretch rounded-[4px] transition-colors max-w-full',
                  lit
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted group-hover/tool:bg-background/70 group-hover/tool:text-foreground',
                ].join(' ')}
              >
                <button
                  type="button"
                  title={g.label}
                  aria-pressed={active}
                  onClick={() => activateGroup(g.categories)}
                  className="w-9 h-10 [@media(hover:none)]:w-10 [@media(hover:none)]:h-11 flex items-center justify-center shrink-0 [&_svg]:w-5 [&_svg]:h-5"
                >
                  <g.Icon />
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
                    'flex items-center justify-center shrink-0',
                    'border-0 bg-transparent p-0 shadow-none',
                    'text-current',
                    'transition-[width,opacity,margin] duration-100 ease-out',
                    open
                      ? 'w-3 opacity-100'
                      : [
                          'w-0 opacity-0 m-0 pointer-events-none overflow-hidden',
                          'group-hover/tool:w-3 group-hover/tool:opacity-80 group-hover/tool:pointer-events-auto',
                          '[@media(hover:none)]:w-3.5 [@media(hover:none)]:opacity-80 [@media(hover:none)]:pointer-events-auto',
                        ].join(' '),
                  ].join(' ')}
                >
                  <IconChevron className="w-2.5 h-2.5 shrink-0 opacity-80" />
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          title="Zoom marquee — drag a region to zoom"
          aria-pressed={activeTool === 'zoom'}
          onClick={() => {
            onToolChange('zoom');
            setOpenGroup(null);
            setRemoveMenuOpen(false);
          }}
          className={toolBtn(activeTool === 'zoom')}
        >
          <IconZoom />
        </button>

        <div className="flex-1 min-h-2" />

        <button
          type="button"
          title="Object tree"
          aria-label="Object tree"
          onClick={() => {
            onOpenObjectTree?.();
            setOpenGroup(null);
            setRemoveMenuOpen(false);
          }}
          className={toolBtn(false)}
        >
          <IconObjectTree />
          {drawingCount > 0 && (
            <span className="absolute bottom-0.5 right-0.5 min-w-[10px] text-[8px] font-semibold leading-none text-accent">
              {drawingCount > 99 ? '99+' : drawingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          title={`${magnetModeLabel(magnetMode)} (click to cycle)`}
          aria-pressed={magnetMode !== 'off'}
          aria-label={magnetModeLabel(magnetMode)}
          onClick={() => onMagnetModeChange(nextMagnetMode(magnetMode))}
          className={toolBtn(magnetMode !== 'off')}
        >
          <IconMagnet />
          {magnetMode === 'weak' && (
            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold leading-none text-accent">
              W
            </span>
          )}
          {magnetMode === 'strong' && (
            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold leading-none text-accent">
              S
            </span>
          )}
        </button>
        <button
          type="button"
          title="Stay in drawing mode"
          aria-pressed={stayInDrawingMode}
          onClick={() => onStayInDrawingModeChange(!stayInDrawingMode)}
          className={toolBtn(stayInDrawingMode)}
        >
          <IconStayDraw />
        </button>
        <button
          type="button"
          title={drawingsLocked ? 'Unlock drawings' : 'Lock drawings'}
          aria-pressed={drawingsLocked}
          onClick={() => onDrawingsLockedChange(!drawingsLocked)}
          className={toolBtn(drawingsLocked)}
        >
          <IconLock />
        </button>
        <button
          type="button"
          title={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
          aria-pressed={drawingsHidden}
          onClick={() => onDrawingsHiddenChange(!drawingsHidden)}
          className={toolBtn(drawingsHidden)}
        >
          {drawingsHidden ? <IconEyeOff /> : <IconEye />}
        </button>
        <button
          ref={removeBtnRef}
          type="button"
          title="Remove drawings"
          aria-expanded={removeMenuOpen}
          onClick={() => {
            setRemoveMenuOpen((v) => !v);
            setOpenGroup(null);
          }}
          className={toolBtn(removeMenuOpen) + ' hover:text-danger'}
        >
          <IconTrash />
        </button>
      </div>

      {removeMenuOpen && (
        <div className="absolute left-full bottom-2 z-50 ml-1 w-[min(14rem,calc(100vw-4rem))] rounded-lg border border-[color:var(--tv-panel-line)] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.14)] py-1">
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
            className="w-full flex items-center gap-2 px-3 min-h-11 text-left text-[13px] text-danger hover:bg-background/80 disabled:opacity-40 disabled:pointer-events-none"
          >
            <IconTrash className="w-4 h-4 shrink-0" />
            <span>
              Remove all drawings
              {drawingCount > 0 ? ` (${drawingCount})` : ''}
            </span>
          </button>
        </div>
      )}

      {/* Flyout outside the scroll pane so it is never clipped */}
      {openGroup && openCategories.length > 0 && (
        <div
          className="absolute left-full z-50 ml-1 w-[min(16rem,calc(100vw-4rem))] max-h-[min(80vh,640px)] flex flex-col rounded-lg border border-[color:var(--tv-panel-line)] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
          style={{ top: menuTop }}
        >
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
                      idx > 0 ? 'border-t border-[color:var(--tv-panel-line)] mt-1' : '',
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
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted border-t border-[color:var(--tv-panel-line)] mt-1">
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
          <div className="shrink-0 border-t border-[color:var(--tv-panel-line)] px-2 py-1.5">
            <button
              type="button"
              role="switch"
              aria-checked={showMoreTools}
              onClick={() => setShowMore(!showMoreTools)}
              className="w-full min-h-11 px-2 rounded-md flex items-center justify-between gap-2 text-left text-[12px] text-muted hover:text-foreground hover:bg-background/70"
            >
              <span>More tools (approx / beta)</span>
              <span
                className={[
                  'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                  showMoreTools
                    ? 'bg-accent/20 text-accent'
                    : 'bg-background text-muted',
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
  const Icon = CATEGORY_ICONS[def.category];
  return (
    <button
      type="button"
      onClick={() => onSelect(tid)}
      className={[
        'w-full flex items-center gap-2.5 px-3 h-9 [@media(hover:none)]:min-h-11 text-left text-[13px]',
        selected
          ? 'bg-accent/15 text-accent'
          : 'text-foreground hover:bg-background/80',
      ].join(' ')}
    >
      <Icon className="w-5 h-5 shrink-0 opacity-80" />
      <span className="truncate flex-1 min-w-0">{def.label}</span>
      {badge && (
        <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted border border-[color:var(--tv-panel-line)] rounded px-1 py-0.5">
          {badge}
        </span>
      )}
    </button>
  );
}

function toolBtn(active: boolean): string {
  return [
    'relative w-10 h-10 [@media(hover:none)]:w-11 [@media(hover:none)]:h-11 rounded-[4px] flex items-center justify-center transition-colors shrink-0 [&_svg]:w-5 [&_svg]:h-5',
    active
      ? 'bg-accent/15 text-accent'
      : 'text-muted hover:text-foreground hover:bg-background/70',
  ].join(' ');
}
