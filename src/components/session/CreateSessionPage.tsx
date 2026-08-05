import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Label } from '@heroui/react';
import { useAuth } from '@/auth/AuthContext';
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
  type OrderJournalView,
} from '@/orders/tradeJournal';
import {
  createSession,
  deleteSession,
  listSessions,
  validateSessionDates,
} from '@/sessions/sessionStore';
import { listStrategies } from '@/strategy/strategyStore';
import type { DownloadedDataset } from '@/types/dataset';
import type { RemoteDatasetMeta } from '@/types/remoteApi';
import type { BacktestSession, PairSymbol, SessionLeg } from '@/types/session';
import type { Timeframe } from '@/types/ui';

const DEFAULT_STARTING_BALANCE = 10_000;

interface CreateSessionPageProps {
  onStart: (session: BacktestSession) => void;
  /** Open Trades; pass session id to prefer that entry, or omit for latest. */
  onGoJournal?: (sessionId?: string) => void;
  onGoDashboard?: (sessionId?: string) => void;
  /** Increment to open the New Session modal (sidebar Create). */
  openCreateNonce?: number;
}

type SessFilter = 'all' | 'active' | 'completed';
type ViewMode = 'list' | 'grid';
type StatsMode = 'manual' | 'automatic';

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
  onGoJournal,
  onGoDashboard,
  openCreateNonce = 0,
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
  const [strategyId, setStrategyId] = useState('');
  const [strategyDesc, setStrategyDesc] = useState('');
  const [startingBalance, setStartingBalance] = useState(DEFAULT_STARTING_BALANCE);
  const [strategies, setStrategies] = useState(() => listStrategies());
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [sessions, setSessions] = useState(() => listSessions());
  const [modalOpen, setModalOpen] = useState(false);
  const [sessFilter, setSessFilter] = useState<SessFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statsMode, setStatsMode] = useState<StatsMode>('manual');
  const [statsOpen, setStatsOpen] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (modalOpen) setStrategies(listStrategies());
  }, [modalOpen]);

  useEffect(() => {
    if (openCreateNonce > 0) setModalOpen(true);
  }, [openCreateNonce]);

  // Re-read after login / account switch so we never show another user's list.
  useEffect(() => {
    setSessions(listSessions());
  }, [user?.id]);

  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.id === strategyId) ?? null,
    [strategies, strategyId],
  );

  const availablePairs = useMemo(
    () => pairs.filter((p) => !selectedPairs.includes(p)),
    [pairs, selectedPairs],
  );

  const sessionRows = useMemo(() => {
    return sessions.map((s) => {
      const view = getOrderJournalView(s.id);
      const stats = view ? computeOrderJournalStats(view) : null;
      const progress = sessionProgressPct(s);
      const status: SessFilter =
        progress >= 99.5 ? 'completed' : progress > 0 || (stats?.tradeCount ?? 0) > 0
          ? 'active'
          : 'all';
      return { session: s, view, stats, progress, status };
    });
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return sessionRows.filter((row) => {
      const s = row.session;
      if (q) {
        const hay = `${s.name} ${s.legs.map((l) => l.pair).join(' ')} ${s.timeframe}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (sessFilter === 'active') {
        return row.status === 'active' || (row.progress > 0 && row.progress < 99.5);
      }
      if (sessFilter === 'completed') return row.status === 'completed';
      return true;
    });
  }, [sessionRows, searchQ, sessFilter]);

  const continueSession = useMemo(() => {
    const withCursor = sessionRows
      .filter((r) => r.progress > 0 && r.progress < 99.5)
      .sort((a, b) => (b.session.cursorTime ?? 0) - (a.session.cursorTime ?? 0));
    return withCursor[0] ?? null;
  }, [sessionRows]);

  const aggregateStats = useMemo(() => {
    let wins = 0;
    let trades = 0;
    let sessionWins = 0;
    let sessionsWithTrades = 0;
    let timeMs = 0;
    const rows =
      statsMode === 'automatic'
        ? sessionRows.filter((r) => r.session.strategyId)
        : sessionRows.filter((r) => !r.session.strategyId);
    const pool = rows.length > 0 ? rows : sessionRows;
    for (const row of pool) {
      const st = row.stats;
      if (!st || st.tradeCount === 0) {
        timeMs += sessionTimeSpentMs(row.session, row.view);
        continue;
      }
      sessionsWithTrades += 1;
      if (st.netPnl > 0) sessionWins += 1;
      trades += st.tradeCount;
      wins += row.view?.trades.filter((t) => t.pnlAccount > 0).length ?? 0;
      timeMs += sessionTimeSpentMs(row.session, row.view);
    }
    return {
      timeLabel: timeMs > 0 ? formatDuration(timeMs) : '—',
      sessionWinPct:
        sessionsWithTrades > 0
          ? `${((sessionWins / sessionsWithTrades) * 100).toFixed(0)}%`
          : '—',
      tradeWinPct: trades > 0 ? `${((wins / trades) * 100).toFixed(1)}%` : '—',
    };
  }, [sessionRows, statsMode]);

  const addPair = (pair: PairSymbol) => {
    setSelectedPairs((prev) => {
      if (prev.includes(pair) || prev.length >= 4) return prev;
      return [...prev, pair];
    });
    setError(null);
  };

  const removePair = (pair: PairSymbol) => {
    setSelectedPairs((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((p) => p !== pair);
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
    const bal = Number(startingBalance);
    if (!Number.isFinite(bal) || bal <= 0) {
      setError('Starting balance must be a positive number.');
      return null;
    }
    const baseName = name.trim() || defaultName;
    const stratName = selectedStrategy?.name?.trim() || undefined;
    const label = stratName ? `${baseName} · ${stratName}` : baseName;
    const session = createSession({
      name: label,
      timeframe: effectiveTf,
      startDate: sessionStart,
      endDate: sessionEnd,
      legs,
      startingBalance: bal,
      ...(selectedStrategy
        ? { strategyId: selectedStrategy.id, strategyName: selectedStrategy.name }
        : {}),
      ...(strategyDesc.trim() ? { description: strategyDesc.trim() } : {}),
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
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <div className="min-h-full text-foreground">
      <div
        className={[
          'mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-5 sm:py-6 space-y-4',
          'pl-[max(1rem,env(safe-area-inset-left))]',
          'pr-[max(1rem,env(safe-area-inset-right))]',
          'pb-[max(2rem,env(safe-area-inset-bottom))]',
        ].join(' ')}
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Backtesting</h1>
        </header>

        {continueSession && (
          <button
            type="button"
            onClick={() => onStart(continueSession.session)}
            className={[
              'w-full flex items-center gap-3 rounded-lg border border-[color:var(--tv-panel-line)]',
              'bg-surface px-4 py-3 text-left hover:bg-background/60 transition-colors',
            ].join(' ')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[color:var(--accent-foreground)]">
              <PlayIcon />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-sm font-medium truncate">
                Continue &lsquo;{continueSession.session.name}&rsquo;
              </p>
              <div className="h-1 rounded-full bg-background overflow-hidden">
                <div
                  className="h-full bg-foreground/35 transition-[width]"
                  style={{ width: `${Math.round(continueSession.progress)}%` }}
                />
              </div>
            </div>
            <span className="text-xs tabular-nums text-muted shrink-0">
              {Math.round(continueSession.progress)}%
            </span>
          </button>
        )}

        <div className="rounded-lg border border-[color:var(--tv-panel-line)] bg-surface/80 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Stats
              </span>
              <div
                className="inline-flex rounded-md border border-border p-0.5 bg-background/60"
                role="group"
                aria-label="Stats mode"
              >
                {(['manual', 'automatic'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStatsMode(mode)}
                    className={[
                      'min-h-8 px-2.5 rounded text-xs font-semibold capitalize',
                      statsMode === mode
                        ? 'bg-foreground/12 text-foreground'
                        : 'text-muted hover:text-foreground',
                    ].join(' ')}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            {statsOpen && (
              <>
                <StatChip label="Time invested" value={aggregateStats.timeLabel} />
                <StatChip label="Session win %" value={aggregateStats.sessionWinPct} />
                <StatChip label="Trade win %" value={aggregateStats.tradeWinPct} />
              </>
            )}
            <button
              type="button"
              className="ml-auto min-h-9 min-w-9 text-muted hover:text-foreground"
              aria-label={statsOpen ? 'Collapse stats' : 'Expand stats'}
              onClick={() => setStatsOpen((v) => !v)}
            >
              <ChevronIcon open={statsOpen} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 border-b border-transparent" role="tablist" aria-label="Filter">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={sessFilter === f.id}
                onClick={() => setSessFilter(f.id)}
                className={[
                  'min-h-10 px-3 text-sm font-semibold border-b-2 -mb-px',
                  sessFilter === f.id
                    ? 'border-foreground/70 text-foreground'
                    : 'border-transparent text-muted hover:text-foreground',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            className={`${fieldClass} max-w-[14rem] min-h-9 py-1.5 ml-auto`}
            placeholder="Search…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          <div
            className="inline-flex rounded-md border border-border p-0.5"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              title="List view"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={[
                'min-h-9 min-w-9 flex items-center justify-center rounded',
                viewMode === 'list' ? 'bg-foreground/10 text-foreground' : 'text-muted',
              ].join(' ')}
            >
              <ListIcon />
            </button>
            <button
              type="button"
              title="Grid view"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              className={[
                'min-h-9 min-w-9 flex items-center justify-center rounded',
                viewMode === 'grid' ? 'bg-foreground/10 text-foreground' : 'text-muted',
              ].join(' ')}
            >
              <GridIcon />
            </button>
          </div>
        </div>

        {remoteStatus === 'error' && (
          <Card className="bg-surface border border-border">
            <Card.Content className="px-5 py-4 space-y-3">
              <p className="text-sm text-danger">{remoteError ?? 'Server unreachable.'}</p>
              <Button variant="secondary" className="shell-cta min-h-11" onPress={loadServer}>
                Retry
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
              <Button
                variant="secondary"
                className="shell-cta min-h-11"
                onPress={() => setModalOpen(true)}
              >
                + Create session
              </Button>
            </Card.Content>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="rounded-lg border border-[color:var(--tv-panel-line)] bg-surface/80 backdrop-blur-sm overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm text-left">
              <thead>
                <tr className="border-b border-[color:var(--tv-panel-line)] text-xs text-muted">
                  <th className="w-12 px-3 py-2.5 font-medium" />
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Symbol</th>
                  <th className="px-3 py-2.5 font-medium">Strategy</th>
                  <th className="px-3 py-2.5 font-medium text-right">Start balance</th>
                  <th className="px-3 py-2.5 font-medium text-right">Current balance</th>
                  <th className="px-3 py-2.5 font-medium text-right">Real. P&L</th>
                  <th className="px-3 py-2.5 font-medium text-right">Time spent</th>
                  <th className="w-12 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((row) => {
                  const s = row.session;
                  const startBal = s.startingBalance ?? DEFAULT_STARTING_BALANCE;
                  const curBal = row.stats?.finalBalance ?? startBal;
                  const pnl = row.stats?.netPnl ?? 0;
                  const trades = row.stats?.tradeCount ?? 0;
                  const modeLabel = s.strategyId ? 'Auto' : 'Manual';
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-[color:var(--tv-panel-line)] last:border-0 hover:bg-background/40"
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          aria-label={row.progress === 0 ? 'Start' : 'Resume'}
                          onClick={() => onStart(s)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[color:var(--accent-foreground)] hover:brightness-110"
                        >
                          <PlayIcon />
                        </button>
                      </td>
                      <td className="px-3 py-3 min-w-[10rem]">
                        <p className="font-semibold text-foreground truncate max-w-[14rem]">
                          {s.name}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {trades} {trades === 1 ? 'trade' : 'trades'}
                          <span className="mx-1.5 text-muted">·</span>
                          <span className="text-muted">{modeLabel}</span>
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.legs.map((l) => (
                            <span
                              key={l.pair}
                              className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums"
                            >
                              {pairChip(l.pair)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted truncate max-w-[10rem]">
                        {strategyNameFromSession(s)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatMoney(startBal)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatMoney(curBal)}
                      </td>
                      <td
                        className={[
                          'px-3 py-3 text-right tabular-nums font-semibold',
                          pnl > 0
                            ? 'text-success'
                            : pnl < 0
                              ? 'text-danger'
                              : 'text-muted',
                        ].join(' ')}
                      >
                        {formatMoney(pnl, true)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted">
                        {formatDuration(sessionTimeSpentMs(s, row.view))}
                      </td>
                      <td className="px-2 py-3 relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-9 min-w-9 px-0"
                          aria-label="More"
                          onPress={() => setMenuId(menuId === s.id ? null : s.id)}
                        >
                          ⋯
                        </Button>
                        {menuId === s.id && (
                          <div className="absolute right-2 top-full z-20 mt-1 w-40 rounded-md border border-border bg-surface shadow-lg py-1">
                            <MenuBtn
                              label={row.progress === 0 ? 'Start' : 'Resume'}
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
                              label="Dashboard"
                              onClick={() => {
                                setMenuId(null);
                                onGoDashboard?.(s.id);
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSessions.map((row) => {
              const s = row.session;
              const trades = row.stats?.tradeCount ?? 0;
              const pnl = row.stats?.netPnl ?? 0;
              return (
                <Card
                  key={s.id}
                  className="bg-surface border border-border overflow-hidden"
                >
                  <Card.Content className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        aria-label="Open"
                        onClick={() => onStart(s)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[color:var(--accent-foreground)]"
                      >
                        <PlayIcon />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{s.name}</p>
                        <p className="text-xs text-muted">
                          {trades} trades · {s.strategyId ? 'Auto' : 'Manual'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.legs.map((l) => (
                        <span
                          key={l.pair}
                          className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px]"
                        >
                          {pairChip(l.pair)}
                        </span>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Real. P&L</span>
                      <span
                        className={
                          pnl > 0
                            ? 'text-success font-semibold'
                            : pnl < 0
                              ? 'text-danger font-semibold'
                              : 'text-muted'
                        }
                      >
                        {formatMoney(pnl, true)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-background overflow-hidden">
                      <div
                        className="h-full bg-foreground/35"
                        style={{ width: `${Math.round(row.progress)}%` }}
                      />
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
                  <select
                    className={fieldClass}
                    value={strategyId}
                    onChange={(e) => setStrategyId(e.target.value)}
                  >
                    <option value="">
                      {strategies.length === 0
                        ? 'No strategies saved yet'
                        : 'No strategy'}
                    </option>
                    {strategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
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
                  <p className="text-sm text-muted">
                    No published datasets yet. An admin must download and publish
                    market data before you can create a session.
                  </p>
                )}
                {remoteStatus === 'ready' && datasets.length > 0 && (
                  <>
                    <Field
                      label={`Pairs (up to 4 · ${layoutHint(selectedPairs.length)})`}
                    >
                      <div className="space-y-2">
                        <select
                          className={fieldClass}
                          value=""
                          disabled={selectedPairs.length >= 4 || availablePairs.length === 0}
                          onChange={(e) => {
                            const p = e.target.value as PairSymbol;
                            if (p) addPair(p);
                          }}
                        >
                          <option value="">
                            {selectedPairs.length >= 4
                              ? 'Maximum 4 pairs'
                              : availablePairs.length === 0
                                ? 'No more pairs available'
                                : 'Add pair…'}
                          </option>
                          {availablePairs.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        {selectedPairs.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {selectedPairs.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className="inline-flex items-center gap-1.5 min-h-9 rounded-md border border-border bg-foreground/6 px-2.5 text-sm text-foreground"
                                onClick={() => removePair(p)}
                                title={
                                  selectedPairs.length <= 1
                                    ? 'At least one pair required'
                                    : `Remove ${p}`
                                }
                                disabled={selectedPairs.length <= 1}
                              >
                                <span>{p}</span>
                                {selectedPairs.length > 1 && (
                                  <span className="text-muted" aria-hidden>
                                    ×
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
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
                <Field label="Starting balance (USD) *">
                  <input
                    type="number"
                    min={1}
                    step={100}
                    className={fieldClass}
                    value={startingBalance}
                    onChange={(e) => setStartingBalance(Number(e.target.value))}
                  />
                </Field>
                <p className="text-xs text-muted">
                  Account balance used when the session opens on the chart.
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
                variant="secondary"
                className="shell-cta min-h-11 font-semibold"
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
  if (s.strategyName?.trim()) return s.strategyName.trim();
  const parts = s.name.split(' · ');
  return parts.length > 1 ? parts.slice(1).join(' · ') : '—';
}

function pairChip(pair: string): string {
  return pair.replace(/\//g, '');
}

function sessionProgressPct(s: BacktestSession): number {
  if (s.cursorTime == null || !(s.cursorTime > 0)) return 0;
  const start = Date.parse(`${s.startDate}T00:00:00Z`) / 1000;
  const end = Date.parse(`${s.endDate}T23:59:59Z`) / 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 35;
  }
  const t = ((s.cursorTime - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, t));
}

function sessionTimeSpentMs(
  s: BacktestSession,
  view: OrderJournalView | null,
): number {
  const trades = view?.trades;
  if (trades && trades.length > 0) {
    let minT = Infinity;
    let maxT = -Infinity;
    for (const t of trades) {
      if (t.entryTime < minT) minT = t.entryTime;
      if (t.exitTime > maxT) maxT = t.exitTime;
    }
    if (Number.isFinite(minT) && Number.isFinite(maxT) && maxT > minT) {
      // Replay wall span is huge; show a compact proxy from trade count.
      return Math.max(60_000, trades.length * 8 * 60_000);
    }
  }
  if (s.cursorTime) {
    const elapsed = Date.now() - s.createdAt;
    return Math.min(elapsed, 48 * 3600_000);
  }
  return 0;
}

function formatDuration(ms: number): string {
  if (!(ms > 0)) return '—';
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 48) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatMoney(n: number, _signed = false): string {
  void _signed;
  const abs = Math.abs(n);
  const body = abs.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: abs >= 100 ? 0 : 2,
  });
  if (n < 0) return `-${body.replace(/^-/, '')}`;
  return body;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[6rem]">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={['w-4 h-4 transition-transform', open ? 'rotate-180' : ''].join(' ')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  );
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
