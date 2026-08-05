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
 * Compact strategy runner — params + Run. Marks conditions on the chart.
 * Mobile: ≥44px hits.
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
          aria-label={label ?? 'Cancel strategy run'}
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
          aria-label={label ?? 'Run strategy'}
        >
          <span className="sm:hidden">St</span>
          <span className="hidden sm:inline">Strategy</span>
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
            Run strategy
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

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-xs text-muted">Slippage (frac)</span>
              <input
                type="number"
                min={0}
                max={0.01}
                step={0.0001}
                className="w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-accent"
                value={params.costs.slippage}
                onChange={(e) =>
                  onParamsChange({
                    ...params,
                    costs: {
                      ...params.costs,
                      slippage: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Spread (price)</span>
              <input
                type="number"
                min={0}
                step={0.00001}
                className="w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-accent"
                value={params.costs.spread}
                onChange={(e) =>
                  onParamsChange({
                    ...params,
                    costs: {
                      ...params.costs,
                      spread: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
              />
            </label>
          </div>

          <p className="text-[11px] text-muted leading-snug">
            Long/short flips on each signal. Marks every condition on the chart. Caps at{' '}
            {MAX_BACKTEST_BARS.toLocaleString()} bars (newest). Saved under Trades → Strategy
            runs.
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
