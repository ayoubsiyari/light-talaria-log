import { Popover } from '@heroui/react';
import { usePinnedTimeframes } from '@/hooks/usePinnedTimeframes';
import type { Timeframe } from '@/types/ui';

/** All intervals offered in the pin menu (toolbar shows favorites only). */
export const ALL_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

const TF_LABELS: Record<Timeframe, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '1h': '1 hour',
  '4h': '4 hours',
  '1D': '1 day',
};

interface TimeframePickerProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  availableTimeframes?: readonly Timeframe[];
}

/**
 * TradingView-style intervals: pinned favorites in the bar + dropdown with ★ pins.
 */
export function TimeframePicker({
  timeframe,
  onTimeframeChange,
  availableTimeframes,
}: TimeframePickerProps) {
  const { pinned, isPinned, togglePin } = usePinnedTimeframes();

  const isEnabled = (tf: Timeframe) =>
    !availableTimeframes || availableTimeframes.length === 0
      ? true
      : availableTimeframes.includes(tf);

  // Favorites in bar; always include active TF so the selection stays visible
  const barTfs = (() => {
    const list = pinned.filter((tf) => ALL_TIMEFRAMES.includes(tf));
    if (!list.includes(timeframe)) return [...list, timeframe];
    return list;
  })();

  return (
    <div className="flex items-center gap-0.5 min-w-0">
      <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {barTfs.map((tf) => {
          const active = tf === timeframe;
          const enabled = isEnabled(tf);
          return (
            <button
              key={tf}
              type="button"
              disabled={!enabled}
              title={
                enabled
                  ? TF_LABELS[tf]
                  : `${tf} needs a finer base (download 1m)`
              }
              onClick={() => {
                if (enabled) onTimeframeChange(tf);
              }}
              className={[
                'shrink-0 h-7 min-w-7 px-1.5 rounded text-xs font-medium transition-colors',
                '[@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11',
                active
                  ? 'bg-accent text-accent-foreground'
                  : enabled
                    ? 'text-muted hover:text-foreground hover:bg-background/60'
                    : 'text-muted/40 cursor-not-allowed',
              ].join(' ')}
            >
              {tf}
            </button>
          );
        })}
      </div>

      <Popover>
        {/* Trigger is the pressable — do not nest another <button> inside */}
        <Popover.Trigger
          title="All intervals"
          aria-label="All intervals"
          className="shrink-0 h-7 w-6 min-h-11 min-w-11 sm:min-h-7 sm:min-w-6 rounded inline-flex items-center justify-center text-muted hover:text-foreground hover:bg-background/60 text-[10px]"
        >
          ▾
        </Popover.Trigger>
        <Popover.Content placement="bottom end" className="p-0 z-[100]">
          <Popover.Dialog className="w-[12.5rem] bg-surface border border-[color:var(--tv-panel-line)] rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.14)] overflow-hidden">
            <p className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted">
              Intervals
            </p>
            <ul className="py-0.5 max-h-[min(50dvh,16rem)] overflow-y-auto">
              {ALL_TIMEFRAMES.map((tf) => {
                const active = tf === timeframe;
                const enabled = isEnabled(tf);
                const pinned = isPinned(tf);
                return (
                  <li key={tf} className="flex items-center gap-0.5 px-1">
                    <button
                      type="button"
                      disabled={!enabled}
                      onClick={() => {
                        if (enabled) onTimeframeChange(tf);
                      }}
                      className={[
                        'flex-1 flex items-center gap-2 h-7 px-1.5 rounded text-left text-[12px]',
                        active
                          ? 'bg-accent/15 text-accent font-medium'
                          : enabled
                            ? 'text-foreground hover:bg-background/70'
                            : 'text-muted/40 cursor-not-allowed',
                      ].join(' ')}
                    >
                      <span className="w-8 tabular-nums font-medium">{tf}</span>
                      <span className="truncate text-muted text-[11px]">
                        {TF_LABELS[tf]}
                      </span>
                    </button>
                    <button
                      type="button"
                      title={pinned ? 'Unpin from toolbar' : 'Pin to toolbar'}
                      aria-label={pinned ? `Unpin ${tf}` : `Pin ${tf}`}
                      aria-pressed={pinned}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(tf);
                      }}
                      className={[
                        'shrink-0 h-7 w-7 rounded flex items-center justify-center',
                        pinned
                          ? 'text-accent hover:bg-background/70'
                          : 'text-muted/50 hover:text-muted hover:bg-background/70',
                      ].join(' ')}
                    >
                      <StarIcon filled={pinned} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="px-2.5 py-1.5 text-[10px] text-muted border-t border-[color:var(--tv-panel-line)]">
              ★ Pin favorites to the toolbar
            </p>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="fill-current">
        <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9L12 2.5z" />
      </svg>
    );
  }
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9L12 2.5z" />
    </svg>
  );
}
