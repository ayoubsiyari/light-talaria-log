import { Popover } from '@heroui/react';
import {
  IconGear,
  IndicatorLegendRow,
} from '@/components/layout/IndicatorLegendRow';

interface VolumeIndicatorProps {
  visible: boolean;
  opacity: number;
  onVisibleChange: (visible: boolean) => void;
  onOpacityChange: (opacity: number) => void;
}

/**
 * Standalone Volume legend (e.g. ChartWorkspace).
 * ChartPane prefers OverlayIndicators’ volume row so it stacks with SMA/etc.
 */
export function VolumeIndicator({
  visible,
  opacity,
  onVisibleChange,
  onOpacityChange,
}: VolumeIndicatorProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute left-2 top-7 z-20 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <IndicatorLegendRow
        label="Volume · hist"
        title="Volume"
        swatchColor="var(--up, var(--success, #26a69a))"
        visible={visible}
        onToggleVisible={() => onVisibleChange(false)}
        onSettings={() => {}}
        onRemove={() => onVisibleChange(false)}
        settingsSlot={
          <Popover>
            <Popover.Trigger
              title="Volume settings"
              aria-label="Volume settings"
              className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7 rounded inline-flex items-center justify-center text-muted hover:text-foreground hover:bg-background/70"
            >
              <IconGear />
            </Popover.Trigger>
            <Popover.Content className="p-0 z-[100]">
              <Popover.Dialog className="w-56 bg-surface border border-border rounded-lg shadow-lg p-3">
                <Popover.Heading className="text-sm font-semibold mb-3">
                  Volume settings
                </Popover.Heading>
                <label className="block text-xs text-muted mb-1">Opacity</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(opacity * 100)}
                    onChange={(e) =>
                      onOpacityChange(Number(e.target.value) / 100)
                    }
                    className="flex-1 accent-[var(--accent)]"
                  />
                  <span className="tabular-nums text-xs w-8 text-right">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        }
      />
    </div>
  );
}
