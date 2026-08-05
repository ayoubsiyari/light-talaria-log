/**
 * Compact chart overlay after a puzzle Run — scorecard, explain, watch, A/B.
 * Collapses on narrow viewports; never covers the full plot.
 */
import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { computeJournalStats } from '@/journal/journalStats';
import type { BacktestEvent, BacktestResult } from '@/types/backtest';

interface StrategyRunHudProps {
  result: BacktestResult;
  compareResult?: BacktestResult | null;
  explainEvent?: BacktestEvent | null;
  onClearExplain?: () => void;
  watchEnabled?: boolean;
  onWatchChange?: (on: boolean) => void;
  onRunAsB?: () => void;
  onClearCompare?: () => void;
  onStop?: () => void;
}

export function StrategyRunHud({
  result,
  compareResult = null,
  explainEvent = null,
  onClearExplain,
  watchEnabled = false,
  onWatchChange,
  onRunAsB,
  onClearCompare,
  onStop,
}: StrategyRunHudProps) {
  const [open, setOpen] = useState(true);
  const stats = useMemo(() => computeJournalStats(result), [result]);
  const compareStats = useMemo(
    () => (compareResult ? computeJournalStats(compareResult) : null),
    [compareResult],
  );

  const wr =
    stats.winRate == null ? '—' : `${(stats.winRate * 100).toFixed(0)}%`;
  const ret = `${stats.equityReturnPct >= 0 ? '+' : ''}${stats.equityReturnPct.toFixed(2)}%`;

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-30 flex flex-col items-stretch gap-2 sm:bottom-3 sm:left-3 sm:right-auto sm:max-w-sm">
      {explainEvent && (
        <Card className="pointer-events-auto bg-surface/95 border border-border shadow-md backdrop-blur-sm">
          <Card.Content className="px-3 py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Why this mark
                </p>
                <p className="text-sm font-semibold truncate">{explainEvent.label}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 min-w-11 shrink-0"
                onPress={() => onClearExplain?.()}
              >
                ✕
              </Button>
            </div>
            <p className="text-xs text-foreground/90 whitespace-pre-wrap">
              {explainEvent.explain || explainEvent.label}
            </p>
            {explainEvent.pieceIds && explainEvent.pieceIds.length > 0 && (
              <p className="text-[11px] text-muted break-all">
                Ids: {explainEvent.pieceIds.join(', ')}
              </p>
            )}
            <p className="text-[11px] text-muted tabular-nums">
              {explainEvent.kind}
              {explainEvent.side ? ` · ${explainEvent.side}` : ''}
              {explainEvent.lane ? ` · lane ${explainEvent.lane.toUpperCase()}` : ''}
            </p>
          </Card.Content>
        </Card>
      )}

      <Card className="pointer-events-auto bg-surface/95 border border-border shadow-md backdrop-blur-sm">
        <Card.Content className="px-3 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="min-h-11 min-w-0 flex-1 text-left"
              onClick={() => setOpen((v) => !v)}
            >
              <p className="text-[11px] uppercase tracking-wide text-muted">
                Scorecard
              </p>
              <p className="text-sm font-semibold truncate">
                {result.strategyName || 'Strategy run'}
              </p>
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 shrink-0"
              onPress={() => setOpen((v) => !v)}
            >
              {open ? 'Hide' : 'Show'}
            </Button>
          </div>

          {open && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Trades" value={String(stats.tradeCount)} />
                <Stat label="Win rate" value={wr} />
                <Stat label="Return" value={ret} accent={stats.equityReturnPct >= 0} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Wins" value={String(stats.wins)} />
                <Stat label="Losses" value={String(stats.losses)} />
                <Stat
                  label="Payoff"
                  value={
                    stats.payoffR == null ? '—' : `${stats.payoffR.toFixed(2)}R`
                  }
                />
              </div>

              {compareStats && (
                <div className="rounded-md border border-border/80 px-2 py-2 space-y-1">
                  <p className="text-[11px] text-muted">
                    B · {compareResult?.strategyName || 'Compare'}
                  </p>
                  <p className="text-xs tabular-nums">
                    {compareStats.tradeCount} trades ·{' '}
                    {compareStats.winRate == null
                      ? '—'
                      : `${(compareStats.winRate * 100).toFixed(0)}%`}{' '}
                    WR ·{' '}
                    {`${compareStats.equityReturnPct >= 0 ? '+' : ''}${compareStats.equityReturnPct.toFixed(2)}%`}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {onWatchChange && (
                  <Button
                    size="sm"
                    variant={watchEnabled ? 'primary' : 'secondary'}
                    className="min-h-11"
                    onPress={() => onWatchChange(!watchEnabled)}
                  >
                    {watchEnabled ? 'Watch on' : 'Watch tip'}
                  </Button>
                )}
                {onRunAsB && !compareResult && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="min-h-11"
                    onPress={onRunAsB}
                  >
                    Run as B
                  </Button>
                )}
                {compareResult && onClearCompare && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    onPress={onClearCompare}
                  >
                    Clear B
                  </Button>
                )}
                {onStop && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 text-danger"
                    onPress={onStop}
                  >
                    Stop
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted leading-snug">
                Tap a diamond or triangle for why it fired.
                {watchEnabled
                  ? ' Watch re-runs on the tip bar (throttled).'
                  : ''}
              </p>
            </>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md bg-background/60 px-1 py-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${
          accent === true
            ? 'text-success'
            : accent === false
              ? 'text-danger'
              : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
