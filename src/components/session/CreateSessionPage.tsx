import { useMemo, useState } from 'react';
import { Button, Card, Label } from '@heroui/react';
import { AppPageHeader } from '@/components/layout/AppPageNav';
import { listDatasets } from '@/datasets/datasetStore';
import {
  clampDate,
  commonTimeframes,
  coverageForPair,
  overlapCoverage,
  pickDatasetForRange,
} from '@/sessions/sessionOverlap';
import { deleteJournalEntry } from '@/journal/journalStore';
import { clearOrderJournal, getOrderJournalView } from '@/orders/tradeJournal';
import {
  createSession,
  deleteSession,
  listSessions,
  validateSessionDates,
} from '@/sessions/sessionStore';
import type { BacktestSession, PairSymbol, SessionLeg } from '@/types/session';
import type { Timeframe } from '@/types/ui';

interface CreateSessionPageProps {
  onStart: (session: BacktestSession) => void;
  onGoDatasets: () => void;
  /** Open journal; pass session id to prefer that entry, or omit for latest. */
  onGoJournal?: (sessionId?: string) => void;
  onGoHome?: () => void;
}

const fieldClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent';

function uniquePairs(datasets: { pair: PairSymbol }[]): PairSymbol[] {
  return [...new Set(datasets.map((d) => d.pair))];
}

function layoutHint(n: number): string {
  if (n <= 1) return '1 chart';
  if (n === 2) return '2 charts side by side';
  if (n === 3) return 'up to 4-chart grid (3 panes)';
  return '4-chart grid';
}

export function CreateSessionPage({
  onStart,
  onGoDatasets,
  onGoJournal,
  onGoHome,
}: CreateSessionPageProps) {
  const [datasets] = useState(() => listDatasets());
  const pairs = useMemo(() => uniquePairs(datasets), [datasets]);

  const [selectedPairs, setSelectedPairs] = useState<PairSymbol[]>(() =>
    pairs[0] ? [pairs[0]] : [],
  );

  const availableTfs = useMemo(
    () => commonTimeframes(datasets, selectedPairs),
    [datasets, selectedPairs],
  );

  const [timeframe, setTimeframe] = useState<Timeframe | ''>(() => availableTfs[0] ?? '');

  // Keep timeframe valid when pair selection changes
  const effectiveTf: Timeframe | '' = useMemo(() => {
    if (timeframe && availableTfs.includes(timeframe)) return timeframe;
    return availableTfs[0] ?? '';
  }, [availableTfs, timeframe]);

  const overlap = useMemo(() => {
    if (!effectiveTf || selectedPairs.length === 0) return null;
    const coverages = selectedPairs.map((p) =>
      coverageForPair(datasets, p, effectiveTf),
    );
    return overlapCoverage(coverages);
  }, [datasets, effectiveTf, selectedPairs]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sync dates into overlap bounds whenever overlap changes
  const boundStart = overlap
    ? clampDate(startDate || overlap.startDate, overlap.startDate, overlap.endDate)
    : '';
  const boundEnd = overlap
    ? clampDate(endDate || overlap.endDate, overlap.startDate, overlap.endDate)
    : '';
  const sessionStart = boundStart && boundEnd && boundStart > boundEnd ? boundEnd : boundStart;
  const sessionEnd = boundStart && boundEnd && boundStart > boundEnd ? boundStart : boundEnd;

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState(() => listSessions());

  const togglePair = (pair: PairSymbol) => {
    setSelectedPairs((prev) => {
      if (prev.includes(pair)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((p) => p !== pair);
      }
      if (prev.length >= 4) return prev; // max 4 panes
      return [...prev, pair];
    });
    setError(null);
  };

  const refreshSessions = () => setSessions(listSessions());

  const defaultName = useMemo(() => {
    if (selectedPairs.length === 0 || !effectiveTf) return 'Session name';
    if (selectedPairs.length === 1) return `${selectedPairs[0]} · ${effectiveTf}`;
    return `${selectedPairs.join(' + ')} · ${effectiveTf}`;
  }, [effectiveTf, selectedPairs]);

  const canCreate =
    selectedPairs.length > 0 &&
    !!effectiveTf &&
    !!overlap &&
    !!sessionStart &&
    !!sessionEnd &&
    sessionStart <= sessionEnd;

  const handleCreate = () => {
    if (!effectiveTf || !overlap || !sessionStart || !sessionEnd) {
      setError('Select pairs with overlapping downloaded dates.');
      return;
    }
    const dateErr = validateSessionDates(sessionStart, sessionEnd);
    if (dateErr) {
      setError(dateErr);
      return;
    }

    const legs: SessionLeg[] = [];
    for (const pair of selectedPairs) {
      const ds = pickDatasetForRange(
        datasets,
        pair,
        effectiveTf,
        sessionStart,
        sessionEnd,
      );
      if (!ds) {
        setError(`No dataset covers ${sessionStart} → ${sessionEnd} for ${pair}.`);
        return;
      }
      legs.push({ pair, datasetId: ds.id });
    }

    setError(null);
    const session = createSession({
      name: name.trim() || defaultName,
      timeframe: effectiveTf,
      startDate: sessionStart,
      endDate: sessionEnd,
      legs,
    });
    refreshSessions();
    onStart(session);
  };

  return (
    <div className="min-h-full bg-background text-foreground overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <AppPageHeader
          current="sessions"
          title="Backtest session"
          description="Select one or more pairs from your downloads. Session dates are limited to the overlap shared by every selected pair. Prefer 1m data — the chart aggregates higher timeframes."
          onGoHome={onGoHome}
          onGoSessions={() => undefined}
          onGoDatasets={onGoDatasets}
          onGoJournal={onGoJournal ? () => onGoJournal() : undefined}
        />

        <Card className="bg-surface border border-border">
          <Card.Header className="px-6 pt-6 pb-2">
            <Card.Title className="text-lg">New session</Card.Title>
            <Card.Description className="text-muted text-sm">
              Only downloaded pairs appear here. Dates = overlap across your selection.
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-6 pb-6 space-y-4">
            {datasets.length === 0 ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted">
                  No datasets yet. Download OHLC from Dukascopy first.
                </p>
                <Button variant="primary" onPress={onGoDatasets}>
                  Go to Datasets
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted">Session name</Label>
                  <input
                    className={fieldClass}
                    placeholder={defaultName}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted">
                    Pairs{' '}
                    <span className="text-muted/80 font-normal">
                      (select up to 4 · {layoutHint(selectedPairs.length)})
                    </span>
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {pairs.map((p) => {
                      const checked = selectedPairs.includes(p);
                      return (
                        <label
                          key={p}
                          className={[
                            'flex items-center gap-2.5 min-h-11 px-3 py-2 rounded-md border text-sm cursor-pointer',
                            checked
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border bg-background text-foreground hover:border-accent/50',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePair(p)}
                            className="accent-[var(--accent)]"
                          />
                          <span className="truncate">{p}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted">Ticker (timeframe)</Label>
                  <select
                    className={fieldClass}
                    value={effectiveTf}
                    onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                    disabled={availableTfs.length === 0}
                  >
                    {availableTfs.length === 0 ? (
                      <option value="">No shared timeframe</option>
                    ) : (
                      availableTfs.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedPairs.length > 1 && availableTfs.length === 0 && (
                    <p className="text-xs text-danger">
                      Selected pairs share no common timeframe. Download matching TFs or deselect
                      a pair.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted">Start date</Label>
                    <input
                      type="date"
                      className={fieldClass}
                      value={sessionStart}
                      min={overlap?.startDate}
                      max={overlap?.endDate}
                      disabled={!overlap}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted">End date</Label>
                    <input
                      type="date"
                      className={fieldClass}
                      value={sessionEnd}
                      min={overlap?.startDate}
                      max={overlap?.endDate}
                      disabled={!overlap}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {overlap ? (
                  <p className="text-xs text-muted">
                    Overlap available:{' '}
                    <span className="text-foreground tabular-nums">
                      {overlap.startDate} → {overlap.endDate}
                    </span>
                    {selectedPairs.length > 1
                      ? ` · shared by ${selectedPairs.join(', ')}`
                      : null}
                  </p>
                ) : selectedPairs.length > 0 && effectiveTf ? (
                  <p className="text-sm text-danger" role="alert">
                    No overlapping dates for the selected pairs at {effectiveTf}. Download a
                    matching range or pick different pairs.
                  </p>
                ) : null}

                {error && (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button variant="primary" onPress={handleCreate} isDisabled={!canCreate}>
                    Start session
                  </Button>
                </div>
              </>
            )}
          </Card.Content>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Recent sessions
          </h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted">No sessions yet. Create one above.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {s.legs.map((l) => l.pair).join(' + ')} · {s.timeframe} · {s.startDate} →{' '}
                      {s.endDate}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 sm:min-h-8"
                    onPress={() => onStart(s)}
                  >
                    Open
                  </Button>
                  {onGoJournal && getOrderJournalView(s.id) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onPress={() => onGoJournal(s.id)}
                    >
                      Journal
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 sm:min-h-8"
                    onPress={() => {
                      deleteSession(s.id);
                      deleteJournalEntry(s.id);
                      clearOrderJournal(s.id);
                      refreshSessions();
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
