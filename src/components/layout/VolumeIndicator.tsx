import { Popover } from '@heroui/react';

interface VolumeIndicatorProps {
  visible: boolean;
  opacity: number;
  onVisibleChange: (visible: boolean) => void;
  onOpacityChange: (opacity: number) => void;
}

/** TradingView-style indicator legend: title + hide + settings. */
export function VolumeIndicator({
  visible,
  opacity,
  onVisibleChange,
  onOpacityChange,
}: VolumeIndicatorProps) {
  // Only when enabled via Indicators — not a default chart chrome item
  if (!visible) return null;

  // Sit just under the OHLC readout (top-left), TradingView-style indicator stack
  const stackClass =
    'absolute left-3 top-7 z-20 pointer-events-auto flex items-center gap-0.5';

  return (
    <div
      className={stackClass}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[11px] bg-surface/90 border border-[color:var(--tv-panel-line)]">
        <span className="font-medium text-foreground">Volume</span>
        <span className="text-muted">·</span>
        <span className="text-muted">hist</span>

        <button
          type="button"
          className="ml-1 w-5 h-5 min-h-11 min-w-11 sm:min-h-5 sm:min-w-5 rounded flex items-center justify-center text-muted hover:text-foreground hover:bg-background/70"
          title="Hide Volume"
          aria-label="Hide Volume"
          onClick={() => onVisibleChange(false)}
        >
          <EyeIcon />
        </button>

        <Popover>
          {/* Trigger is the pressable — do not nest another <button> inside */}
          <Popover.Trigger
            title="Volume settings"
            aria-label="Volume settings"
            className="w-5 h-5 min-h-11 min-w-11 sm:min-h-5 sm:min-w-5 rounded inline-flex items-center justify-center text-muted hover:text-foreground hover:bg-background/70"
          >
            <GearIcon />
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
                  onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="tabular-nums text-xs w-8 text-right">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <label className="flex items-center gap-2 mt-3 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => onVisibleChange(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Visible on chart
              </label>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
