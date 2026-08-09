import { useEffect, useMemo, useRef, useState } from 'react';
import type { Drawing, DrawingPoint } from '@/drawings/drawingStore';
import {
  normalizeVisRanges,
  type DrawingStyle,
  type VisRanges,
} from '@/drawings/drawingStyle';
import { chromeIconForTool } from '@/drawings/chromeToolIcon';
import { getTool } from '@/drawings/toolRegistry';
import { getToolSettings, resolveMeta } from '@/drawings/toolSettings';
import { ToolInputsPanel } from '@/components/drawings/settings/ToolInputsPanel';
import { DrawingSettingsShell } from '@/components/drawings/settings/DrawingSettingsShell';
import { TemplateMenu } from '@/components/drawings/settings/TemplateMenu';
import {
  ObsidianCoordsPane,
  ObsidianStylePane,
  ObsidianTextPane,
  ObsidianVisibilityPane,
} from '@/components/drawings/settings/obsidian';

type SettingsTab = 'style' | 'inputs' | 'text' | 'coordinates' | 'visibility';

interface DrawingSettingsModalProps {
  drawing: Drawing;
  /** Live preview — called on every draft change. */
  onLiveChange: (next: Drawing) => void;
  /** Cancel — restore snapshot then close. */
  onCancel: (snapshot: Drawing) => void;
  /** OK — keep current draft and close. */
  onOk: (next: Drawing) => void;
}

function cloneDrawing(d: Drawing): Drawing {
  return {
    ...d,
    points: d.points.map((p) => ({ ...p })),
    style: { ...d.style },
    meta: d.meta ? { ...d.meta } : undefined,
  };
}

/** Text tools open on Text; fib on Inputs; everything else Style. */
function initialSettingsTab(type: Drawing['type']): SettingsTab {
  if (getTool(type).needsText) return 'text';
  if (getToolSettings(type).toolPanel === 'fibLevels') return 'inputs';
  return 'style';
}

/**
 * Shared Obsidian/V9 settings modal for every drawing tool.
 * Live-previews on the chart; Cancel restores the open-time snapshot.
 */
export function DrawingSettingsModal({
  drawing,
  onLiveChange,
  onCancel,
  onOk,
}: DrawingSettingsModalProps) {
  const tool = getTool(drawing.type);
  const settings = useMemo(() => getToolSettings(drawing.type), [drawing.type]);
  const [tab, setTab] = useState<SettingsTab>(() => initialSettingsTab(drawing.type));
  const snapshotRef = useRef<Drawing>(cloneDrawing(drawing));
  const drawingIdRef = useRef(drawing.id);
  const skipLiveRef = useRef(false);

  const [draft, setDraft] = useState<Drawing>(() => ({
    ...cloneDrawing(drawing),
    meta: resolveMeta(drawing.type, drawing.meta),
  }));

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // New selection → reset snapshot + draft + tab.
  useEffect(() => {
    if (drawing.id === drawingIdRef.current) return;
    drawingIdRef.current = drawing.id;
    const next = {
      ...cloneDrawing(drawing),
      meta: resolveMeta(drawing.type, drawing.meta),
    };
    snapshotRef.current = cloneDrawing(next);
    skipLiveRef.current = true;
    setDraft(next);
    setTab(initialSettingsTab(drawing.type));
    setRenaming(false);
  }, [drawing]);

  // Stable callbacks — parent may recreate closures each render.
  const liveRef = useRef(onLiveChange);
  liveRef.current = onLiveChange;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Live preview — skip the frame after id-switch reset.
  useEffect(() => {
    if (skipLiveRef.current) {
      skipLiveRef.current = false;
      return;
    }
    liveRef.current(draft);
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelRef.current(snapshotRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showInputs = settings.showInputsTab;
  const showText = settings.showTextTab;
  const showCoords = settings.showCoordsTab !== false;

  const tabs = useMemo(() => {
    const list: { id: SettingsTab; label: string }[] = [
      { id: 'style', label: 'Style' },
    ];
    if (showInputs) list.push({ id: 'inputs', label: 'Inputs' });
    if (showText) list.push({ id: 'text', label: 'Text' });
    if (showCoords) list.push({ id: 'coordinates', label: 'Coordinates' });
    list.push({ id: 'visibility', label: 'Visibility' });
    return list;
  }, [showInputs, showText, showCoords]);

  const displayTitle = draft.name?.trim() || tool.label;

  const patchStyle = (partial: Partial<DrawingStyle>) => {
    setDraft((d) => {
      const style = { ...d.style, ...partial };
      const meta =
        typeof partial.textBold === 'boolean'
          ? { ...d.meta, bold: partial.textBold }
          : d.meta;
      return { ...d, style, meta };
    });
  };

  const patchMeta = (partial: Record<string, unknown>) => {
    setDraft((d) => {
      let points = d.points;
      // Risk/reward: move target (point 2) from entry/stop distance × RR.
      if (
        typeof partial.riskReward === 'number' &&
        (d.type === 'longPosition' || d.type === 'shortPosition') &&
        d.points[0] &&
        d.points[1] &&
        d.points[2]
      ) {
        const entry = d.points[0].price;
        const stop = d.points[1].price;
        const risk = stop - entry;
        const targetPrice = entry - risk * partial.riskReward;
        points = d.points.map((p, i) =>
          i === 2 ? { ...p, price: targetPrice } : p,
        );
      }
      // Text-tool Bold input mirrors Style textBold.
      let style = d.style;
      if (typeof partial.bold === 'boolean') {
        style = { ...d.style, textBold: partial.bold };
      }
      return { ...d, points, style, meta: { ...d.meta, ...partial } };
    });
  };

  const patchPoint = (index: number, partial: Partial<DrawingPoint>) => {
    setDraft((d) => {
      const points = d.points.map((p, i) => (i === index ? { ...p, ...partial } : p));
      return { ...d, points };
    });
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    setDraft((d) => ({
      ...d,
      name: trimmed && trimmed !== tool.label ? trimmed : undefined,
    }));
    setRenaming(false);
  };

  const applyTemplate = (t: { style: DrawingStyle; meta: Record<string, unknown> }) => {
    setDraft((d) => ({
      ...d,
      style: { ...t.style },
      meta: { ...t.meta },
    }));
  };

  const resetToSnapshot = () => {
    skipLiveRef.current = true;
    setDraft(cloneDrawing(snapshotRef.current));
  };

  const setVisRanges = (visRanges: VisRanges) => {
    patchMeta({ visRanges: normalizeVisRanges(visRanges) });
  };

  return (
    <DrawingSettingsShell
      title={displayTitle}
      iconName={chromeIconForTool(draft.type)}
      renaming={renaming}
      renameValue={renameValue}
      onRenameValueChange={setRenameValue}
      onStartRename={() => {
        setRenameValue(displayTitle);
        setRenaming(true);
      }}
      onCommitRename={commitRename}
      onCancelRename={() => setRenaming(false)}
      tabs={tabs}
      tab={tab}
      onTabChange={setTab}
      onClose={() => onCancel(snapshotRef.current)}
      onBackdrop={() => onCancel(snapshotRef.current)}
      headerTrailing={
        <TemplateMenu
          variant="icon"
          type={draft.type}
          style={draft.style}
          meta={draft.meta ?? {}}
          onApply={applyTemplate}
        />
      }
      footer={
        <>
          <button
            type="button"
            data-sett-dd=""
            onClick={resetToSnapshot}
            className="min-h-9 px-4 rounded-md text-sm text-foreground"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onOk(draft)}
            className="min-h-9 px-4 rounded-md bg-[color:var(--text)] text-[color:var(--surface)] text-sm font-semibold hover:opacity-90"
          >
            Done
          </button>
        </>
      }
    >
      {tab === 'style' && (
        <ObsidianStylePane
          draft={draft}
          patchStyle={patchStyle}
          patchMeta={patchMeta}
        />
      )}

      {tab === 'inputs' && showInputs && (
        <ToolInputsPanel
          type={draft.type}
          panel={settings.toolPanel}
          meta={draft.meta ?? {}}
          onMetaChange={patchMeta}
        />
      )}

      {tab === 'text' && showText && (
        <ObsidianTextPane
          draft={draft}
          patchStyle={patchStyle}
          onTextChange={(text) => setDraft((d) => ({ ...d, text }))}
        />
      )}

      {tab === 'coordinates' && showCoords && (
        <ObsidianCoordsPane draft={draft} patchPoint={patchPoint} />
      )}

      {tab === 'visibility' && (
        <ObsidianVisibilityPane
          draft={draft}
          onChange={(partial) => setDraft((d) => ({ ...d, ...partial }))}
          onVisRangesChange={setVisRanges}
        />
      )}
    </DrawingSettingsShell>
  );
}
