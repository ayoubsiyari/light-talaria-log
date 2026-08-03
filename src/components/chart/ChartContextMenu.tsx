import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CrosshairMode } from '@/chart';

const CROSSHAIR_MODES: { id: CrosshairMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'magnet', label: 'Magnet' },
  { id: 'magnetOhlc', label: 'Magnet OHLC' },
  { id: 'hidden', label: 'Hidden' },
];

export interface ChartContextMenuState {
  x: number;
  y: number;
}

interface ChartContextMenuProps {
  state: ChartContextMenuState;
  crosshairMode: CrosshairMode;
  onCrosshairModeChange: (m: CrosshairMode) => void;
  onOpenChartSettings: () => void;
  onClose: () => void;
}

/**
 * TradingView-style chart right-click menu (crosshair + open settings).
 */
export function ChartContextMenu({
  state,
  crosshairMode,
  onCrosshairModeChange,
  onOpenChartSettings,
  onClose,
}: ChartContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });
  const [crossOpen, setCrossOpen] = useState(true);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = state.x;
    let top = state.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setPos({ left, top });
  }, [state.x, state.y, crossOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label="Chart menu"
      className="fixed z-[60] min-w-[200px] rounded-md border border-border bg-surface text-foreground shadow-2xl py-1 text-sm"
      style={{ left: pos.left, top: pos.top }}
    >
      <button
        type="button"
        role="menuitem"
        className="w-full flex items-center justify-between gap-3 px-3 min-h-10 text-left hover:bg-background/80"
        onClick={() => setCrossOpen((v) => !v)}
      >
        <span>Crosshair</span>
        <span className="text-muted text-xs tabular-nums">
          {CROSSHAIR_MODES.find((m) => m.id === crosshairMode)?.label ?? 'Normal'}
          <span className="ml-1 opacity-70">{crossOpen ? '▾' : '▸'}</span>
        </span>
      </button>

      {crossOpen && (
        <div className="border-t border-border/60 py-0.5" role="group" aria-label="Crosshair mode">
          {CROSSHAIR_MODES.map((m) => {
            const active = crosshairMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={[
                  'w-full flex items-center gap-2 px-3 pl-5 min-h-9 text-left hover:bg-background/80',
                  active ? 'text-accent' : 'text-foreground',
                ].join(' ')}
                onClick={() => {
                  onCrosshairModeChange(m.id);
                  onClose();
                }}
              >
                <span className="w-3.5 text-center text-xs">{active ? '✓' : ''}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="my-1 border-t border-border/60" />

      <button
        type="button"
        role="menuitem"
        className="w-full px-3 min-h-10 text-left hover:bg-background/80"
        onClick={() => {
          onOpenChartSettings();
          onClose();
        }}
      >
        Chart settings…
      </button>
    </div>
  );
}
