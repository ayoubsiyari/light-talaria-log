import { Popover } from '@heroui/react';
import type { PairSymbol } from '@/types/session';

interface SymbolOption {
  pair: PairSymbol;
  /** Optional subtitle (e.g. dataset range). */
  hint?: string;
}

interface SymbolPickerProps {
  /** Active pane's pair. */
  symbol: PairSymbol | string;
  /** Session legs available to switch between. */
  options: readonly SymbolOption[];
  onSymbolChange: (pair: PairSymbol) => void;
  disabled?: boolean;
}

/**
 * TradingView-style symbol pill: click → list of session symbols for the active pane.
 */
export function SymbolPicker({
  symbol,
  options,
  onSymbolChange,
  disabled = false,
}: SymbolPickerProps) {
  const multi = options.length > 1;
  const label = String(symbol);

  if (!multi) {
    return (
      <div className="flex items-center gap-1 h-8 min-h-11 sm:min-h-8 px-2.5 rounded-md bg-background/80 text-[13px] font-semibold text-foreground shrink-0">
        <span className="truncate max-w-[10rem]">{label}</span>
      </div>
    );
  }

  return (
    <Popover>
      {/* Trigger is the pressable — do not nest another <button> inside */}
      <Popover.Trigger
        title="Change symbol"
        aria-label="Change symbol"
        aria-disabled={disabled || undefined}
        className={[
          'flex items-center gap-1 h-8 min-h-11 sm:min-h-8 px-2.5 rounded-md bg-background/80 text-[13px] font-semibold text-foreground hover:bg-background shrink-0',
          disabled ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
      >
        <span className="truncate max-w-[9rem] sm:max-w-[12rem]">{label}</span>
        <span className="text-muted text-[10px] leading-none">▾</span>
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="p-0 z-[100]">
        <Popover.Dialog className="w-[14rem] bg-surface border border-[color:var(--tv-panel-line)] rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.14)] overflow-hidden">
          <p className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted">
            Session symbols
          </p>
          <ul className="py-0.5 max-h-[min(50dvh,14rem)] overflow-y-auto">
            {options.map((opt) => {
              const active = opt.pair === symbol;
              return (
                <li key={opt.pair}>
                  <button
                    type="button"
                    onClick={() => onSymbolChange(opt.pair)}
                    className={[
                      'w-full flex items-center gap-2 h-8 min-h-11 sm:min-h-8 px-2.5 text-left text-[13px]',
                      active
                        ? 'bg-accent/15 text-accent font-semibold'
                        : 'text-foreground hover:bg-background/70',
                    ].join(' ')}
                  >
                    <span className="flex-1 truncate">{opt.pair}</span>
                    {active && (
                      <span className="text-[10px] text-accent shrink-0">Active</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-2.5 py-1.5 text-[10px] text-muted border-t border-[color:var(--tv-panel-line)]">
            Switches the selected chart pane
          </p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
