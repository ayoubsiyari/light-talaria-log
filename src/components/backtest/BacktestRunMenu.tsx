import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import {
  BACKTEST_STRATEGY_LABELS,
  type AutomationDirection,
  type AutomationRules,
  type BacktestParams,
  type BacktestStrategyId,
} from '@/types/backtest';
import { MAX_BACKTEST_BARS } from '@/utils/constants';

interface BacktestRunMenuProps {
  running?: boolean;
  /** True when a finished run still has marks on the chart. */
  hasResult?: boolean;
  label?: string;
  disabled?: boolean;
  params: BacktestParams;
  onParamsChange: (next: BacktestParams) => void;
  onRun: () => void;
  onCancel?: () => void;
  /** Clear marks + auto indicators from the chart. */
  onStop?: () => void;
}

const field =
  'w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent tabular-nums';

/**
 * Strategy automation menu — Run / Stop, base strategy, rules (RSI, trend, SL/TP…).
 */
export function BacktestRunMenu({
  running = false,
  hasResult = false,
  label,
  disabled = false,
  params,
  onParamsChange,
  onRun,
  onCancel,
  onStop,
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

  const patchRules = (patch: Partial<AutomationRules>) => {
    onParamsChange({ ...params, rules: { ...params.rules, ...patch } });
  };

  const rules = params.rules;

  return (
    <div ref={rootRef} className="relative shrink-0 flex items-center gap-0.5">
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
        <>
          {hasResult && onStop && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-h-7 [@media(hover:none)]:min-h-11 px-2 text-xs shrink-0 text-danger"
              onPress={onStop}
              aria-label="Stop and clear strategy marks"
            >
              Stop
            </Button>
          )}
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
        </>
      )}

      {open && !running && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className={[
            'absolute right-0 top-full mt-1 z-50',
            'w-[min(100vw-1rem,22rem)] max-h-[min(80vh,36rem)] overflow-y-auto',
            'rounded-lg border border-border bg-surface shadow-lg',
            'p-3 space-y-3',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-2">
            <p
              id={titleId}
              className="text-xs font-semibold text-muted uppercase tracking-wide"
            >
              Strategy automation
            </p>
            {hasResult && onStop && (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 sm:min-h-8 text-danger"
                onPress={() => {
                  onStop();
                  setOpen(false);
                }}
              >
                Stop & clear
              </Button>
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-muted">Base strategy</span>
            <select
              className={field}
              value={params.strategyId}
              onChange={(e) => setStrategy(e.target.value as BacktestStrategyId)}
            >
              {(
                Object.keys(BACKTEST_STRATEGY_LABELS) as BacktestStrategyId[]
              )
                .filter((id) => id !== 'graph')
                .map((id) => (
                  <option key={id} value={id}>
                    {BACKTEST_STRATEGY_LABELS[id]}
                  </option>
                ))}
            </select>
          </label>

          {params.strategyId === 'sma_cross' ? (
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Fast SMA"
                value={params.sma.fastPeriod}
                min={2}
                max={200}
                onChange={(v) =>
                  onParamsChange({
                    ...params,
                    sma: { ...params.sma, fastPeriod: v },
                  })
                }
              />
              <NumField
                label="Slow SMA"
                value={params.sma.slowPeriod}
                min={3}
                max={400}
                onChange={(v) =>
                  onParamsChange({
                    ...params,
                    sma: { ...params.sma, slowPeriod: v },
                  })
                }
              />
            </div>
          ) : (
            <NumField
              label="Channel period"
              value={params.donchian.period}
              min={2}
              max={200}
              onChange={(v) =>
                onParamsChange({
                  ...params,
                  donchian: { period: v },
                })
              }
            />
          )}

          <section className="space-y-2 rounded-md border border-border bg-background/50 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Automation rules
            </p>

            <label className="block space-y-1">
              <span className="text-xs text-muted">Direction</span>
              <select
                className={field}
                value={rules.direction}
                onChange={(e) =>
                  patchRules({ direction: e.target.value as AutomationDirection })
                }
              >
                <option value="both">Long & short</option>
                <option value="long">Long only</option>
                <option value="short">Short only</option>
              </select>
            </label>

            <label className="flex items-center gap-2 min-h-11 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={rules.trendFilter}
                onChange={(e) => patchRules({ trendFilter: e.target.checked })}
              />
              <span className="text-sm">Trend filter (price vs SMA)</span>
            </label>

            <label className="flex items-center gap-2 min-h-11 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={rules.rsiEnabled}
                onChange={(e) => patchRules({ rsiEnabled: e.target.checked })}
              />
              <span className="text-sm">RSI gate</span>
            </label>

            {rules.rsiEnabled && (
              <div className="grid grid-cols-3 gap-2">
                <NumField
                  label="RSI period"
                  value={rules.rsiPeriod}
                  min={2}
                  max={100}
                  onChange={(v) => patchRules({ rsiPeriod: v })}
                />
                <NumField
                  label="Long ≤"
                  value={rules.rsiLongBelow}
                  min={1}
                  max={99}
                  onChange={(v) => patchRules({ rsiLongBelow: v })}
                />
                <NumField
                  label="Short ≥"
                  value={rules.rsiShortAbove}
                  min={1}
                  max={99}
                  onChange={(v) => patchRules({ rsiShortAbove: v })}
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <NumField
                label="Cooldown bars"
                value={rules.cooldownBars}
                min={0}
                max={500}
                onChange={(v) => patchRules({ cooldownBars: v })}
              />
              <PctField
                label="Stop loss %"
                value={rules.stopLossPct}
                onChange={(v) => patchRules({ stopLossPct: v })}
              />
              <PctField
                label="Take profit %"
                value={rules.takeProfitPct}
                onChange={(v) => patchRules({ takeProfitPct: v })}
              />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Slippage (frac)"
              value={params.costs.slippage}
              min={0}
              max={0.01}
              step={0.0001}
              onChange={(v) =>
                onParamsChange({
                  ...params,
                  costs: { ...params.costs, slippage: v },
                })
              }
            />
            <NumField
              label="Spread (price)"
              value={params.costs.spread}
              min={0}
              step={0.00001}
              onChange={(v) =>
                onParamsChange({
                  ...params,
                  costs: { ...params.costs, spread: v },
                })
              }
            />
          </div>

          <p className="text-[11px] text-muted leading-snug">
            Run paints condition marks on the chart. Stop clears them. Caps at{' '}
            {MAX_BACKTEST_BARS.toLocaleString()} bars · saved under Trades → Strategy runs.
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

function NumField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1 min-w-0">
      <span className="text-xs text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className={field}
        value={value}
        onChange={(e) => {
          let v = Number(e.target.value);
          if (!Number.isFinite(v)) v = 0;
          if (min != null) v = Math.max(min, v);
          if (max != null) v = Math.min(max, v);
          onChange(step >= 1 ? Math.floor(v) : v);
        }}
      />
    </label>
  );
}

/** UI shows percent; storage is fraction. */
function PctField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (fraction: number) => void;
}) {
  return (
    <label className="block space-y-1 min-w-0">
      <span className="text-xs text-muted">{label}</span>
      <input
        type="number"
        min={0}
        max={50}
        step={0.1}
        className={field}
        value={Number((value * 100).toFixed(2))}
        onChange={(e) => {
          const pct = Math.max(0, Number(e.target.value) || 0);
          onChange(pct / 100);
        }}
      />
    </label>
  );
}
