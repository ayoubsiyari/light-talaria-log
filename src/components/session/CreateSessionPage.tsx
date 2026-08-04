import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Label } from '@heroui/react';
import {
  registerRemoteDataset,
  remoteToDownloadedStub,
} from '@/datasets/datasetStore';
import { fetchHealth, listRemoteDatasets } from '@/datasets/remoteApi';
import {
  clampDate,
  commonTimeframes,
  coverageForPair,
  defaultLastMonthsCoverage,
  overlapCoverage,
  pickDatasetForRange,
} from '@/sessions/sessionOverlap';
import { deleteJournalEntry } from '@/journal/journalStore';
import {
  clearOrderJournal,
  computeOrderJournalStats,
  getOrderJournalView,
} from '@/orders/tradeJournal';
import {
  createSession,
  deleteSession,
  listSessions,
  validateSessionDates,
} from '@/sessions/sessionStore';
import type { DownloadedDataset } from '@/types/dataset';
import type { RemoteDatasetMeta } from '@/types/remoteApi';
import type { BacktestSession, PairSymbol, SessionLeg } from '@/types/session';
import type { Timeframe } from '@/types/ui';

interface CreateSessionPageProps {
  onStart: (session: BacktestSession) => void;
  onGoDatasets: () => void;
  /** Open trades/journal; pass session id to prefer that entry, or omit for latest. */
  onGoJournal?: (sessionId?: string) => void;
  onGoDashboard?: (sessionId?: string) => void;
  onGoHome?: () => void;
  /** Inside AppShell — hide duplicate top nav. */
  embedded?: boolean;
}

type SessFilter = 'all' | 'not-started' | 'active' | 'completed';

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

function remotesToDatasets(remotes: RemoteDatasetMeta[]): DownloadedDataset[] {
  const out: DownloadedDataset[] = [];
  for (const r of remotes) {
    if (r.status === 'failed') continue;
    try {
      out.push(remoteToDownloadedStub(r));
    } catch {
      // Unsupported symbol — skip
    }
  }
  return out;
}

export function CreateSessionPage({
  onStart,
  onGoDatasets,
  onGoJournal,
  onGoDashboard,
  onGoHome,
  embedded = false,
}: CreateSessionPageProps) {
  const [remoteStatus, setRemoteStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<RemoteDatasetMeta[]>([]);
  const [datasets, setDatasets] = useState<DownloadedDataset[]>([]);

  const loadServer = () => {
    setRemoteStatus('loading');
    setRemoteError(null);
    void (async () => {
      try {
        await fetchHealth();
        const list = await listRemoteDatasets();
        setRemotes(list);
        setDatasets(remotesToDatasets(list));
        setRemoteStatus('ready');
      } catch (err) {
        setRemotes([]);
        setDatasets([]);
        setRemoteStatus('error');
        setRemoteError(
          err instanceof Error
            ? err.message
            : 'Server API unreachable. Use npm run dev and publish data from Datasets.',
        );
      }
    })();
  };

  useEffect(() => {
    loadServer();
  }, []);

  const pairs = useMemo(() => uniquePairs(datasets), [datasets]);

  const [selectedPairs, setSelectedPairs] = useState<PairSymbol[]>([]);

  // Seed selection when server catalog first loads
  useEffect(() => {
    if (selectedPairs.length === 0 && pairs[0]) {
      setSelectedPairs([pairs[0]]);
    }
  }, [pairs, selectedPairs.length]);

  const availableTfs = useMemo(
    () => commonTimeframes(datasets, selectedPairs),
    [datasets, selectedPairs],
  );

  const [timeframe, setTimeframe] = useState<Timeframe | ''>('');

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

  // Default to last 3 months of shared coverage (not the full history).
  const preferredRange = useMemo(
    () => (overlap ? defaultLastMonthsCoverage(overlap, 3) : null),
    [overlap],
  );

  useEffect(() => {
    if (!preferredRange) return;
    // Seed once while empty; keep user edits after they touch the fields.
    if (!startDate && !endDate) {
      setStartDate(preferredRange.startDate);
      setEndDate(preferredRange.endDate);
    }
  }, [preferredRange, startDate, endDate]);

  const boundStart = overlap
    ? clampDate(
        startDate || preferredRange?.startDate || overlap.startDate,
        overlap.startDate,
        overlap.endDate,
      )
    : '';
  const boundEnd = overlap
    ? clampDate(
        endDate || preferredRange?.endDate || overlap.endDate,
        overlap.startDate,
        overlap.endDate,
      )
    : '';
  const sessionStart = boundStart && boundEnd && boundStart > boundEnd ? boundEnd : boundStart;
  const sessionEnd = boundStart && boundEnd && boundStart > boundEnd ? boundStart : boundEnd;

  const [name, setName] = useState('');
  const [strategyName, setStrategyName] = useState('');
  const [strategyDesc, setStrategyDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState(() => listSessions());
  const [modalOpen, setModalOpen] = useState(false);
  const [sessFilter, setSessFilter] = useState<SessFilter>('all');
  const [searchQ, setSearchQ] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return sessions.filter((s) => {
      if (q) {
        const hay = `${s.name} ${s.legs.map((l) => l.pair).join(' ')} ${s.timeframe}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const view = getOrderJournalView(s.id);
      const trades = view?.trades.length ?? 0;
      const progress = trades > 0 ? Math.min(100, trades) : s.cursorTime ? 50 : 0;
      if (sessFilter === 'not-started') return progress === 0;
      if (sessFilter === 'active') return progress > 0 && progress < 100;
      if (sessFilter === 'completed') return progress >= 100;
      return true;
    });
  }, [sessions, searchQ, sessFilter]);

  const togglePair = (pair: PairSymbol) => {
    setSelectedPairs((prev) => {
      if (prev.includes(pair)) {
        if (prev.length === 1) return prev;
        return prev.filter((p) => p !== pair);
      }
      if (prev.length >= 4) return prev;
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
    remoteStatus === 'ready' &&
    selectedPairs.length > 0 &&
    !!effectiveTf &&
    !!overlap &&
    !!sessionStart &&
    !!sessionEnd &&
    sessionStart <= sessionEnd;

  const buildSession = (): BacktestSession | null => {
    if (!effectiveTf || !overlap || !sessionStart || !sessionEnd) {
      setError('Select pairs with overlapping server coverage.');
      return null;
    }
    const dateErr = validateSessionDates(sessionStart, sessionEnd);
    if (dateErr) {
      setError(dateErr);
      return null;
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
        setError(`No server dataset covers ${sessionStart} → ${sessionEnd} for ${pair}.`);
        return null;
      }
      const full = remotes.find((r) => r.id === ds.id);
      if (full) registerRemoteDataset(full);
      else
        registerRemoteDataset({
          id: ds.id,
          symbol: ds.pair,
          baseTimeframe: ds.timeframe,
          name: `${ds.pair} ${ds.timeframe}`,
          visibility: 'public_read',
          status: 'ready',
          timeStart: Math.floor(Date.parse(`${ds.startDate}T00:00:00Z`) / 1000),
          timeEnd: Math.floor(Date.parse(`${ds.endDate}T23:59:59Z`) / 1000),
          rowCounts: { [ds.timeframe]: ds.rowCount },
          timeframes: [ds.timeframe],
        });
      legs.push({ pair, datasetId: ds.id });
    }

    setError(null);
    const baseName = name.trim() || defaultName;
    const label =
      strategyName.trim()
        ? `${baseName} · ${strategyName.trim()}`
        : baseName;
    const session = createSession({
      name: label,
      timeframe: effectiveTf,
      startDate: sessionStart,
      endDate: sessionEnd,
      legs,
    });
    refreshSessions();
    return session;
  };

  const handleSaveOnly = () => {
    const s = buildSession();
    if (s) setModalOpen(false);
  };

  const handleStart = () => {
    const s = buildSession();
    if (s) {
      setModalOpen(false);
      onStart(s);
    }
  };

  const filters: { id: SessFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'not-started', label: 'Not started' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <div className="min-h-full bg-background text-foreground overflow-auto">
      <div className="max-w-[1288px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            {!embedded && onGoHome && (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 -ml-2 px-2 text-xs uppercase tracking-[0.2em] text-muted"
                onPress={onGoHome}
              >
                Talaria-Log
              </Button>
            )}
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Backtest</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Sessions</h1>
            <p className="text-sm text-muted max-w-xl">
              V8b-style session hub — real server datasets, Resume opens the chart engine.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-11" onPress={onGoDatasets}>
              Datasets
            </Button>
            <Button
              variant="secondary"
              className="min-h-11"
              onPress={loadServer}
              isDisabled={remoteStatus === 'loading'}
            >
              {remoteStatus === 'loading' ? 'Loading…' : 'Refresh'}
            </Button>
            <Button variant="primary" className="min-h-11" onPress={() => setModalOpen(true)}>
              New session
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${fieldClass} max-w-xs`}
            placeholder="Search name or pair…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={sessFilter === f.id}
                onClick={() => setSessFilter(f.id)}
                className={[
                  'min-h-11 px-3 rounded-md text-xs font-semibold',
                  sessFilter === f.id
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted hover:bg-background/70',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {remoteStatus === 'error' && (
          <Card className="bg-surface border border-border">
            <Card.Content className="px-5 py-4 space-y-3">
              <p className="text-sm text-danger">{remoteError ?? 'Server unreachable.'}</p>
              <Button variant="primary" className="min-h-11" onPress={onGoDatasets}>
                Go to Datasets
              </Button>
            </Card.Content>
          </Card>
        )}

        {filteredSessions.length === 0 ? (
          <Card className="bg-surface border border-border">
            <Card.Content className="px-6 py-12 text-center space-y-4">
              <p className="text-sm text-muted">
                {sessions.length === 0
                  ? 'No sessions yet. Create a backtest session to start.'
                  : 'No sessions match this filter.'}
              </p>
              <Button variant="primary" className="min-h-11" onPress={() => setModalOpen(true)}>
                New session
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredSessions.map((s) => {
              const view = getOrderJournalView(s.id);
              const stats = view ? computeOrderJournalStats(view) : null;
              const trades = stats?.tradeCount ?? 0;
              const progress = trades > 0 ? Math.min(100, 40 + trades) : s.cursorTime ? 35 : 0;
              const created = new Date(s.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              return (
                <Card
                  key={s.id}
                  className="bg-surface border border-border overflow-hidden border-t-2 border-t-accent"
                >
                  <Card.Content className="p-0">
                    <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-[color:var(--tv-panel-line)]">
                      <Button
                        size="sm"
                        variant="primary"
                        className="min-h-11 min-w-11 px-0"
                        aria-label={progress === 0 ? 'Start' : 'Resume'}
                        onPress={() => onStart(s)}
                      >
                        ▶
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11 min-w-11 px-0"
                        aria-label="Dashboard"
                        onPress={() => onGoDashboard?.(s.id) ?? onGoJournal?.(s.id)}
                      >
                        ▦
                      </Button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate text-muted">{s.name}</p>
                        <p className="text-[10px] text-muted">{created}</p>
                      </div>
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11 min-w-11 px-0"
                          aria-label="More"
                          onPress={() => setMenuId(menuId === s.id ? null : s.id)}
                        >
                          ⋯
                        </Button>
                        {menuId === s.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-surface shadow-lg py-1">
                            <MenuBtn
                              label={progress === 0 ? 'Start' : 'Resume'}
                              onClick={() => {
                                setMenuId(null);
                                onStart(s);
                              }}
                            />
                            <MenuBtn
                              label="Trades"
                              onClick={() => {
                                setMenuId(null);
                                onGoJournal?.(s.id);
                              }}
                            />
                            <MenuBtn
                              label="Delete"
                              danger
                              onClick={() => {
                                setMenuId(null);
                                deleteSession(s.id);
                                deleteJournalEntry(s.id);
                                clearOrderJournal(s.id);
                                refreshSessions();
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-3 py-3 space-y-2 text-xs">
                      <p className="font-semibold text-foreground truncate">
                        {strategyNameFromSession(s)}
                      </p>
                      <p className="text-muted truncate">
                        {s.legs.map((l) => l.pair).join(', ')} · {s.timeframe}
                      </p>
                      <p className="text-muted tabular-nums">
                        {s.startDate} → {s.endDate}
                      </p>
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <Metric
                          label="Trades"
                          value={trades ? String(trades) : '—'}
                        />
                        <Metric
                          label="Win %"
                          value={
                            stats?.winRate != null ? `${stats.winRate.toFixed(0)}%` : '—'
                          }
                        />
                        <Metric
                          label="P&L"
                          value={
                            stats
                              ? `${stats.netPnl >= 0 ? '+' : ''}${stats.netPnl.toFixed(0)}`
                              : '—'
                          }
                          tone={
                            stats == null
                              ? undefined
                              : stats.netPnl >= 0
                                ? 'success'
                                : 'danger'
                          }
                        />
                      </div>
                      <div className="h-1.5 rounded-full bg-background overflow-hidden">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                    </div>
                  </Card.Content>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[100010] flex items-center justify-center bg-background/80 p-3">
          <div className="w-full max-w-2xl max-h-[min(90vh,840px)] overflow-auto rounded-lg border border-border bg-surface shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3 border-b border-[color:var(--tv-panel-line)] bg-surface">
              <h2 className="text-lg font-semibold">New backtest session</h2>
              <Button variant="ghost" className="min-h-11" onPress={() => setModalOpen(false)}>
                Close
              </Button>
            </div>
            <div className="px-5 py-5 space-y-6">
              <Section title="Session info">
                <Field label="Session name *">
                  <input
                    className={fieldClass}
                    placeholder={defaultName}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Strategy / playbook">
                  <input
                    className={fieldClass}
                    placeholder="Optional strategy name"
                    value={strategyName}
                    onChange={(e) => setStrategyName(e.target.value)}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className={`${fieldClass} min-h-20`}
                    value={strategyDesc}
                    onChange={(e) => setStrategyDesc(e.target.value)}
                    placeholder="Notes for this run…"
                  />
                </Field>
              </Section>

              <Section title="Session settings">
                {remoteStatus === 'loading' && (
                  <p className="text-sm text-muted">Loading server datasets…</p>
                )}
                {remoteStatus === 'ready' && datasets.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted">No server datasets yet.</p>
                    <Button variant="primary" className="min-h-11" onPress={onGoDatasets}>
                      Datasets
                    </Button>
                  </div>
                )}
                {remoteStatus === 'ready' && datasets.length > 0 && (
                  <>
                    <Field
                      label={`Pairs (up to 4 · ${layoutHint(selectedPairs.length)})`}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {pairs.map((p) => {
                          const checked = selectedPairs.includes(p);
                          return (
                            <label
                              key={p}
                              className={[
                                'flex items-center gap-2.5 min-h-11 px-3 py-2 rounded-md border text-sm cursor-pointer',
                                checked
                                  ? 'border-accent bg-accent/10'
                                  : 'border-border bg-background',
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
                    </Field>
                    <Field label="Timeframe">
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
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Start date *">
                        <input
                          type="date"
                          className={fieldClass}
                          value={sessionStart}
                          min={overlap?.startDate}
                          max={overlap?.endDate}
                          disabled={!overlap}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </Field>
                      <Field label="End date *">
                        <input
                          type="date"
                          className={fieldClass}
                          value={sessionEnd}
                          min={overlap?.startDate}
                          max={overlap?.endDate}
                          disabled={!overlap}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </Field>
                    </div>
                    {overlap && (
                      <p className="text-xs text-muted">
                        Coverage {overlap.startDate} → {overlap.endDate} (default last 3 months).
                      </p>
                    )}
                  </>
                )}
              </Section>

              <Section title="Options">
                <p className="text-sm text-muted">
                  Real-world costs and prop rules land with the chart order engine. Datasets
                  remain the source of bars.
                </p>
              </Section>

              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-[color:var(--tv-panel-line)] bg-surface">
              <Button variant="ghost" className="min-h-11" onPress={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                className="min-h-11"
                isDisabled={!canCreate}
                onPress={handleSaveOnly}
              >
                Save
              </Button>
              <Button
                variant="primary"
                className="min-h-11"
                isDisabled={!canCreate}
                onPress={handleStart}
              >
                Start session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function strategyNameFromSession(s: BacktestSession): string {
  const parts = s.name.split(' · ');
  return parts.length > 1 ? parts.slice(1).join(' · ') : s.legs.map((l) => l.pair).join(' + ');
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted">{label}</Label>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase">{label}</p>
      <p
        className={[
          'font-semibold tabular-nums',
          tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : '',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}

function MenuBtn({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left min-h-11 px-3 text-sm',
        danger ? 'text-danger' : 'text-foreground hover:bg-background/70',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
