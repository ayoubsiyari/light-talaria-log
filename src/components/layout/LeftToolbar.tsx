import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  IconBrush,
  IconChannel,
  IconChevron,
  IconCursor,
  IconEye,
  IconEyeOff,
  IconFib,
  IconGann,
  IconLock,
  IconMagnet,
  IconMeasure,
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
  CATEGORY_DEFAULT_TOOL,
  TOOL_CATEGORIES,
  TOOLS,
  type DrawingToolId,
  type ToolCategoryId,
} from '@/drawings/toolRegistry';
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
}[] = [
  { id: 'lines', label: 'Lines', Icon: IconTrendLine, categories: ['lines'] },
  {
    id: 'channels',
    label: 'Channels & Pitchforks',
    Icon: IconPitchfork,
    categories: ['channels', 'pitchforks'],
  },
  {
    id: 'fib',
    label: 'Fibonacci & Gann',
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
    Icon: IconPattern,
    categories: ['patterns', 'elliott', 'cycles'],
  },
  {
    id: 'measure',
    label: 'Forecast, Volume & Measure',
    Icon: IconMeasure,
    categories: ['forecast', 'volume', 'measure'],
  },
];

interface LeftToolbarProps {
  activeTool: ChartToolId;
  onToolChange: (tool: ChartToolId) => void;
  onClearDrawings?: () => void;
  magnet: boolean;
  onMagnetChange: (v: boolean) => void;
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
  onClearDrawings,
  magnet,
  onMagnetChange,
  stayInDrawingMode,
  onStayInDrawingModeChange,
  drawingsLocked,
  onDrawingsLockedChange,
  drawingsHidden,
  onDrawingsHiddenChange,
}: LeftToolbarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [menuTop, setMenuTop] = useState(0);
  const [lastByCategory, setLastByCategory] = useState<Record<string, DrawingToolId>>(() => ({
    ...CATEGORY_DEFAULT_TOOL,
  }));
  const rootRef = useRef<HTMLElement>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // pointerdown + capture: chart canvas preventDefault() suppresses mousedown
  useEffect(() => {
    if (!openGroup) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [openGroup]);

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

  /** Icon click — activate last tool in the group (no menu). */
  const activateGroup = (categories: ToolCategoryId[]) => {
    const firstCat = categories[0]!;
    const last = lastByCategory[firstCat] ?? CATEGORY_DEFAULT_TOOL[firstCat];
    onToolChange(last);
    setOpenGroup(null);
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
      <div className="h-full w-full flex flex-col items-center py-1 gap-0.5 overflow-y-auto overscroll-contain">
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

        {TOOLBAR_GROUPS.map((g) => {
          const active =
            !!activeDrawing &&
            g.categories.some((c) => TOOLS[activeDrawing].category === c);
          const open = openGroup === g.id;
          return (
            <div
              key={g.id}
              ref={(node) => {
                groupRefs.current[g.id] = node;
              }}
              className="group/tool relative shrink-0"
              data-open={open ? 'true' : undefined}
            >
              <button
                type="button"
                title={g.label}
                aria-pressed={active}
                onClick={() => activateGroup(g.categories)}
                className={toolBtn(active || open)}
              >
                <g.Icon />
              </button>

              {/*
                TV-style arrow: hidden until hover (desktop), always on touch,
                stays visible while menu open. Anchored on the button’s right edge
                (inside the hit box) so the scroll container never clips it.
              */}
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
                  'absolute top-1 bottom-1 right-0 z-10 w-3.5',
                  'rounded-r-[3px] border-l border-[color:var(--tv-panel-line)]/70',
                  'bg-surface/95 text-muted',
                  'flex items-center justify-center',
                  'transition-opacity duration-100',
                  open
                    ? 'opacity-100 text-foreground bg-background'
                    : [
                        'opacity-0 pointer-events-none',
                        'group-hover/tool:opacity-100 group-hover/tool:pointer-events-auto',
                        // Touch: always show a tappable arrow strip
                        '[@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto',
                        '[@media(hover:none)]:w-4',
                        'hover:text-foreground hover:bg-background',
                      ].join(' '),
                ].join(' ')}
              >
                <IconChevron className="w-2.5 h-2.5 rotate-180" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          title="Zoom"
          aria-pressed={activeTool === 'zoom'}
          onClick={() => {
            onToolChange('zoom');
            setOpenGroup(null);
          }}
          className={toolBtn(activeTool === 'zoom')}
        >
          <IconZoom />
        </button>

        <div className="flex-1 min-h-2" />

        <button
          type="button"
          title="Magnet"
          aria-pressed={magnet}
          onClick={() => onMagnetChange(!magnet)}
          className={toolBtn(magnet)}
        >
          <IconMagnet />
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
          type="button"
          title="Clear drawings"
          onClick={onClearDrawings}
          className={toolBtn(false) + ' hover:text-danger'}
        >
          <IconTrash />
        </button>
      </div>

      {/* Flyout outside the scroll pane so it is never clipped */}
      {openGroup && openCategories.length > 0 && (
        <div
          className="absolute left-full z-50 ml-1 w-[min(16rem,calc(100vw-4rem))] max-h-[min(80vh,640px)] overflow-y-auto rounded-lg border border-[color:var(--tv-panel-line)] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.14)] py-1"
          style={{ top: menuTop }}
        >
          {openCategories.map((cat, idx) => (
            <div key={cat.id}>
              {cat.sections.map((sec) => (
                <div key={sec.title}>
                  <div
                    className={[
                      'px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted',
                      idx > 0 || sec !== cat.sections[0]
                        ? 'border-t border-[color:var(--tv-panel-line)] mt-1'
                        : '',
                    ].join(' ')}
                  >
                    {sec.title}
                  </div>
                  {sec.tools.map((tid) => {
                    const def = TOOLS[tid];
                    const Icon = CATEGORY_ICONS[def.category];
                    const selected = activeDrawing === tid;
                    return (
                      <button
                        key={tid}
                        type="button"
                        onClick={() => selectTool(tid)}
                        className={[
                          'w-full flex items-center gap-2.5 px-3 h-9 [@media(hover:none)]:min-h-11 text-left text-[13px]',
                          selected
                            ? 'bg-accent/15 text-accent'
                            : 'text-foreground hover:bg-background/80',
                        ].join(' ')}
                      >
                        <Icon className="w-5 h-5 shrink-0 opacity-80" />
                        <span className="truncate">{def.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </aside>
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
