import { useState } from 'react';
import { Popover } from '@heroui/react';
import { IndicatorSettingsModal } from '@/components/indicators/IndicatorSettingsModal';
import {
  IconGear,
  IndicatorLegendRow,
} from '@/components/layout/IndicatorLegendRow';
import { formatIndicatorLabel, getIndicatorDef } from '@/indicators/defs';
import type { EnabledIndicator, IndicatorId } from '@/types/indicator';

export interface VolumeLegendProps {
  visible: boolean;
  opacity: number;
  onVisibleChange: (visible: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  /** Remove volume from chart (same as Indicators menu toggle off). */
  onRemove: () => void;
  swatchColor?: string;
}

interface OverlayIndicatorsProps {
  enabled: readonly EnabledIndicator[];
  /** When set, Volume uses the same legend chip as overlays. */
  volume?: VolumeLegendProps | null;
  onChange: (next: EnabledIndicator[]) => void;
}

/** Vertical TradingView-style indicator legend under OHLC. */
export function OverlayIndicators({
  enabled,
  volume = null,
  onChange,
}: OverlayIndicatorsProps) {
  const [settingsId, setSettingsId] = useState<IndicatorId | null>(null);

  const showVolume = !!volume?.visible;
  if (enabled.length === 0 && !showVolume) return null;

  const settingsItem = settingsId
    ? enabled.find((e) => e.id === settingsId)
    : null;

  const patch = (id: IndicatorId, next: Partial<EnabledIndicator>) => {
    onChange(enabled.map((e) => (e.id === id ? { ...e, ...next } : e)));
  };

  const remove = (id: IndicatorId) => {
    onChange(enabled.filter((e) => e.id !== id));
  };

  return (
    <>
      <div
        className="absolute left-2 top-7 z-20 pointer-events-auto flex flex-col items-start gap-0.5 max-w-[min(18rem,calc(100%-1rem))] max-h-[min(45dvh,20rem)] overflow-y-auto overscroll-contain"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {showVolume && volume && (
          <IndicatorLegendRow
            label="Volume · hist"
            title="Volume"
            swatchColor={volume.swatchColor ?? 'var(--up, var(--success, #26a69a))'}
            visible={volume.visible}
            onToggleVisible={() => volume.onVisibleChange(false)}
            onSettings={() => {}}
            onRemove={volume.onRemove}
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
                    <label className="block text-xs text-muted mb-1">
                      Opacity
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Math.round(volume.opacity * 100)}
                        onChange={(e) =>
                          volume.onOpacityChange(Number(e.target.value) / 100)
                        }
                        className="flex-1 accent-[var(--accent)]"
                      />
                      <span className="tabular-nums text-xs w-8 text-right">
                        {Math.round(volume.opacity * 100)}%
                      </span>
                    </div>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            }
          />
        )}

        {enabled.map((e) => {
          const def = getIndicatorDef(e.id);
          const visible = e.visible !== false;
          return (
            <IndicatorLegendRow
              key={e.id}
              label={formatIndicatorLabel(e.id, e.params)}
              title={def.label}
              swatchColor={e.colors?.[0]}
              visible={visible}
              onToggleVisible={() => patch(e.id, { visible: !visible })}
              onSettings={() => setSettingsId(e.id)}
              onRemove={() => remove(e.id)}
            />
          );
        })}
      </div>

      {settingsItem && (
        <IndicatorSettingsModal
          indicator={settingsItem}
          onClose={() => setSettingsId(null)}
          onSave={(next) => {
            onChange(enabled.map((e) => (e.id === next.id ? next : e)));
          }}
        />
      )}
    </>
  );
}
