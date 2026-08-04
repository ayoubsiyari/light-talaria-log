import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import {
  BACKTEST_STRATEGY_LABELS,
  type BacktestParams,
  type BacktestStrategyId,
} from '@/types/backtest';
import { MAX_BACKTEST_BARS } from '@/utils/constants';

interface BacktestRunMenuProps {
  running?: boolean;
  label?: string;
  disabled?: boolean;
  params: BacktestParams;
  onParamsChange: (next: BacktestParams) => void;
  onRun: () => void;
  onCancel?: () => void;
}

/**
 * Compact strategy + params popover + Run. Mobile: full-width sheet-like panel, ≥44px hits.
 */
export function BacktestRunMenu({
  running = false,
  label,
  disabled = false,
  params,
  onParamsChange,
  onRun,
  onCancel,
}: BacktestRunMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (running) setOpen(false);
  }, [running]);

  const setStrategy = (strategyId: BacktestStrategyId) => {
    onParamsChange({ ...params, strategyId });
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      {running ? (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 min-h-7 [@media(hover:none)]:min-h-11 px-2 sm:px-2.5 text-xs shrink-0"
          onPress={onCancel}
          aria-label={label ?? 'Cancel backtest'}
        >
          Cancel
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 min-h-7 [@media(hover:none)]:min-h-11 px-2 sm:px-2.5 text-xs shrink-0"
          isDisabled={disabled}
          onPress={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={label ?? 'Backtest strategy'}
        >
          <span className="sm:hidden">BT</span>
          <span className="hidden sm:inline">Backtest</span>
        </Button>
      )}

      {open && !running && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className={[
            'absolute right-0 top-full mt-1 z-50',
            'w-[min(100vw-1rem,20rem)] rounded-lg border border-border bg-surface shadow-lg',
            'p-3 space-y-3',
          ].join(' ')}
        >
          <p id={titleId} className="text-xs font-semibold text-muted uppercase tracking-wide">
            Strategy backtest
          </p>

          <label className="block space-y-1">
            <span className="text-xs text-muted">Strategy</span>
            <select
              className="w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
              value={params.strategyId}
              onChange={(e) => setStrategy(e.target.value as BacktestStrategyId)}
            >
              {(Object.keys(BACKTEST_STRATEGY_LABELS) as BacktestStrategyId[]).map((id) => (
                <option key={id} value={id}>
                  {BACKTEST_STRATEGY_LABELS[id]}
                </option>
              ))}
            </select>
          </label>

          {params.strategyId === 'sma_cross' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-xs text-muted">Fast SMA</span>
                <input
                  type="number"
                  min={2}
                  max={200}
                  className="w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-accent"
                  value={params.sma.fastPeriod}
                  onChange={(e) =>
                    onParamsChange({
                      ...params,
                      sma: {
                        ...params.sma,
                        fastPeriod: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">Slow SMA</span>
                <input
                  type="number"
                  min={3}
                  max={400}
                  className="w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-accent"
                  value={params.sma.slowPeriod}
                  onChange={(e) =>
                    onParamsChange({
                      ...params,
                      sma: {
                        ...params.sma,
                        slowPeriod: Math.max(2, Math.floor(Number(e.target.value) || 2)),
                      },
                    })
                  }
                />
              </label>
            </div>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs text-muted">Channel period</span>
              <input
                type="number"
                min={2}
                max={200}
                className="w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-accent"
                value={params.donchian.period}
                onChange={(e) =>
                  onParamsChange({
                    ...params,
                    donchian: {
                      period: Math.max(2, Math.floor(Number(e.target.value) || 2)),
                    },
                  })
                }
              />
            </label>
          )}

          <p className="text-[11px] text-muted leading-snug">
            Caps at {MAX_BACKTEST_BARS.toLocaleString()} bars (newest). Saved to Journal.
          </p>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 flex-1"
              onPress={() => setOpen(false)}
            >
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11 flex-1"
              isDisabled={disabled}
              onPress={() => {
                setOpen(false);
                onRun();
              }}
            >
              Run
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
