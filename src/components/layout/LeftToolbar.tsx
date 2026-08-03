import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const [lastByCategory, setLastByCategory] = useState<Record<string, DrawingToolId>>(() => ({
    ...CATEGORY_DEFAULT_TOOL,
  }));
  const rootRef = useRef<HTMLElement>(null);

  // pointerdown + capture: chart canvas preventDefault() suppresses mousedown
  useEffect(() => {
    if (!openGroup) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
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
    setOpenGroup(null); // close after picking a tool (ready to draw)
  };

  const toggleGroup = (groupId: string, categories: ToolCategoryId[]) => {
    if (openGroup === groupId) {
      setOpenGroup(null);
      return;
    }
    // Quick re-select last tool when clicking the icon again while closed
    const firstCat = categories[0]!;
    const last = lastByCategory[firstCat] ?? CATEGORY_DEFAULT_TOOL[firstCat];
    if (activeDrawing && categories.some((c) => TOOLS[activeDrawing].category === c)) {
      setOpenGroup(groupId);
      return;
    }
    onToolChange(last);
    setOpenGroup(groupId);
  };

  return (
    // overflow-visible so flyouts can escape to the right (overflow-y-auto clipped them)
    <aside
      ref={rootRef}
      className="chrome-toolbar tv-panel-r relative w-[38px] [@media(hover:none)]:w-[52px] shrink-0 z-40 overflow-visible"
    >
      <div className="h-full w-full flex flex-col items-center py-0.5 gap-0 overflow-y-auto overscroll-contain">
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
            <div key={g.id} className="relative shrink-0">
              <button
                type="button"
                title={g.label}
                aria-pressed={active}
                aria-expanded={open}
                onClick={() => toggleGroup(g.id, g.categories)}
                className={toolBtn(active || open)}
              >
                <g.Icon />
                <span className="absolute right-px top-1/2 -translate-y-1/2 text-muted opacity-70">
                  <IconChevron className="w-2 h-2" />
                </span>
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

      {openGroup && openCategories.length > 0 && (
        <div className="absolute left-full top-0.5 z-50 ml-0 w-[min(16rem,calc(100vw-3.5rem))] max-h-[min(80vh,640px)] overflow-y-auto rounded-lg border border-[color:var(--tv-panel-line)] bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.12)] py-1">
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
                        <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
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
    // Desktop ≈ TV 28px hits in 38px rail; phone keeps 44px.
    'relative w-7 h-7 [@media(hover:none)]:w-11 [@media(hover:none)]:h-11 rounded-[3px] flex items-center justify-center transition-colors shrink-0',
    active
      ? 'bg-accent/15 text-accent'
      : 'text-muted hover:text-foreground hover:bg-background/70',
  ].join(' ');
}
