import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  addPlaybookSetup,
  computeLogbookStats,
  deleteLogbookTrade,
  ensureExampleLogbook,
  exportLogbookCsv,
  getLogbookAccount,
  getLogbookTrade,
  hydrateLogbook,
  importLogbookCsv,
  listLogbookAccounts,
  listLogbookTrades,
  listPlaybookSetups,
  mentorNoteForTrade,
  removeLogbookAccount,
  setLogbookAccountOnHome,
  removePlaybookSetup,
  restoreLogbookTrade,
  subscribeLogbook,
  upsertLogbookAccount,
  upsertLogbookTrade,
} from '@/logbook';
import type { LogbookDraft, LogbookTrade, StatsPeriod } from '@/logbook/types';
import { findSessionForSymbol } from '@/sessions/findSessionForSymbol';
import { AccountsPanel } from './AccountsPanel';
import { CalendarPanel } from './CalendarPanel';
import { DeskSwitch, JournalBoard, PeriodSwitch } from './JournalBoard';
import { LogbookSheet } from './LogbookSheet';
import './journalDash.css';
import { MetricsPanel } from './MetricsPanel';
import { PlaybookPanel } from './PlaybookPanel';
import { PositionCalculator } from './PositionCalculator';
import { TradeDetail } from './TradeDetail';
import { TradeForm, type TradeSaveOpts } from './TradeForm';
import { TradeList } from './TradeList';

export type LogbookView =
  | 'home'
  | 'ledger'
  | 'accounts'
  | 'metrics'
  | 'calendar'
  | 'playbook'
  | 'detail';

type Overlay = 'trade' | 'calculator';

const PANELS: { id: LogbookView; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'playbook', label: 'Playbook' },
];

const PAGE_SLUGS = new Set(['ledger', 'accounts', 'metrics', 'calendar', 'playbook']);

interface LogbookPageProps {
  routeKey?: string | null;
  onRouteKeyChange?: (key: string | null) => void;
  onOpenChart?: (
    sessionId: string,
    focus?: { time: number; tradeId?: string | null },
  ) => void;
  onGoSessions?: () => void;
}

function viewFromKey(key: string | null | undefined): {
  view: LogbookView;
  tradeId: string | null;
} {
  if (!key || key === 'new' || key === 'calculator') {
    return { view: 'home', tradeId: null };
  }
  if (PAGE_SLUGS.has(key)) return { view: key as LogbookView, tradeId: null };
  return { view: 'detail', tradeId: key };
}

export function LogbookPage({
  routeKey = null,
  onRouteKeyChange,
  onOpenChart,
  onGoSessions,
}: LogbookPageProps) {
  const { user } = useAuth();
  const parsed = viewFromKey(routeKey);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const [editId, setEditId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterSetup, setFilterSetup] = useState('');
  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'loss' | 'open'>('all');
  const [deskFilter, setDeskFilter] = useState('');
  const [sizePreset, setSizePreset] = useState<{ symbol: string; size: number } | null>(null);
  const [calcSeed, setCalcSeed] = useState<{
    symbol?: string;
    entry?: number;
    stop?: number;
    accountId?: string;
  }>({});
  const [stack, setStack] = useState<Overlay[]>([]);
  const [undo, setUndo] = useState<LogbookTrade | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeLogbook(() => setTick((n) => n + 1));
    setReady(false);
    setLoadError(null);
    void hydrateLogbook()
      .then(() => ensureExampleLogbook())
      .then(() => setReady(true))
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Could not open the journal.');
        setReady(true);
      });
    return unsub;
  }, [user?.id]);

  useEffect(() => {
    if (routeKey === 'new') {
      setEditId(null);
      setStack(['trade']);
      onRouteKeyChange?.(null);
    } else if (routeKey === 'calculator') {
      setStack(['calculator']);
      onRouteKeyChange?.(null);
    }
  }, [routeKey, onRouteKeyChange]);

  useEffect(() => {
    if (stack.length === 0) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stack.length]);

  const trades = useMemo(() => {
    void tick;
    return listLogbookTrades();
  }, [tick]);
  const desks = useMemo(() => {
    void tick;
    return listLogbookAccounts();
  }, [tick]);
  const setups = useMemo(() => {
    void tick;
    return listPlaybookSetups();
  }, [tick]);

  const deskTrades = useMemo(() => {
    if (!deskFilter) return trades;
    return trades.filter((t) => t.accountId === deskFilter);
  }, [trades, deskFilter]);
  const stats = useMemo(
    () => computeLogbookStats(trades, period),
    [trades, period],
  );
  const metricsStats = useMemo(
    () => computeLogbookStats(deskTrades, period),
    [deskTrades, period],
  );
  const tagChips = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of deskTrades) {
      for (const tag of t.tags) {
        seen.set(tag, (seen.get(tag) ?? 0) + 1);
      }
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [deskTrades]);
  const setupOptions = useMemo(() => {
    const names = new Set<string>();
    for (const t of deskTrades) {
      if (t.setup) names.add(t.setup);
    }
    for (const name of setups) names.add(name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [deskTrades, setups]);
  const filtersOn =
    filterQuery.trim() !== '' ||
    filterTag.trim() !== '' ||
    filterSetup.trim() !== '' ||
    filterResult !== 'all';

  const view = parsed.view;
  const tradeId = parsed.tradeId;
  const detail = tradeId ? getLogbookTrade(tradeId) : null;
  const editing = editId ? getLogbookTrade(editId) : null;
  const tradeOpen = stack.includes('trade');
  const calcOpen = stack.includes('calculator');
  const front = stack[stack.length - 1] ?? null;

  const go = (next: LogbookView, id: string | null = null) => {
    if (next === 'home') onRouteKeyChange?.(null);
    else if (next === 'detail' && id) onRouteKeyChange?.(id);
    else if (PAGE_SLUGS.has(next)) onRouteKeyChange?.(next);
    else onRouteKeyChange?.(null);
  };

  const openTrade = useCallback((id: string | null = null) => {
    setEditId(id);
    setStack((s) => (s.includes('trade') ? s : [...s, 'trade']));
  }, []);

  const closeTrade = useCallback(() => {
    setStack((s) => s.filter((x) => x !== 'trade' && x !== 'calculator'));
    setEditId(null);
    setSizePreset(null);
  }, []);

  const openCalculator = useCallback(
    (seed?: { symbol?: string; entry?: number; stop?: number; accountId?: string }) => {
      setCalcSeed(seed ?? {});
      setStack((s) => (s.includes('calculator') ? s : [...s, 'calculator']));
    },
    [],
  );

  const closeCalculator = useCallback(() => {
    setStack((s) => s.filter((x) => x !== 'calculator'));
  }, []);

  const save = async (draft: LogbookDraft, opts?: TradeSaveOpts) => {
    const saved = await upsertLogbookTrade(draft, opts);
    closeTrade();
    onRouteKeyChange?.(saved.id);
  };

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase().replace(/\s+/g, '');
    const tag = filterTag.trim().toLowerCase();
    const setup = filterSetup.trim().toLowerCase();
    return deskTrades.filter((t) => {
      if (q) {
        const display = (
          t.symbol +
          (t.setup ?? '') +
          t.side +
          t.tags.join('') +
          (t.accountName ?? '') +
          (t.platform ?? '') +
          (t.accountKind ?? '')
        )
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/\//g, '');
        if (!display.includes(q.replace(/\//g, ''))) return false;
      }
      if (tag && !t.tags.includes(tag)) return false;
      if (setup && (t.setup ?? '').toLowerCase() !== setup) return false;
      if (filterResult === 'open') return t.status === 'open';
      if (filterResult === 'win') return t.status === 'closed' && (t.netPnl ?? 0) > 0;
      if (filterResult === 'loss') return t.status === 'closed' && (t.netPnl ?? 0) < 0;
      return true;
    });
  }, [deskTrades, filterQuery, filterTag, filterSetup, filterResult]);

  const firstName = useMemo(() => {
    const raw = user?.displayName?.trim() || user?.email?.split('@')[0] || 'trader';
    return raw.split(/\s+/)[0] ?? 'trader';
  }, [user?.displayName, user?.email]);

  return (
    <div className={view === 'calendar' ? 'desk desk-fill' : 'desk'}>
      <div className="jd-shell">
        {view !== 'detail' && (
          <header className="jd-top">
            <div className="jd-top-filters">
              <PeriodSwitch period={period} onPeriod={setPeriod} />
              {view === 'metrics' || view === 'ledger' || view === 'calendar' ? (
                <DeskSwitch accounts={desks} deskId={deskFilter} onDesk={setDeskFilter} />
              ) : null}
            </div>
            <nav aria-label="Journal" className="jd-nav-wrap">
              <div className="jd-nav">
                {PANELS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-active={view === p.id ? '1' : '0'}
                    onClick={() => go(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </nav>
            <div className="jd-actions">
              <button type="button" className="jd-btn jd-btn-ghost" onClick={() => openCalculator()}>
                Calculator
              </button>
              <button type="button" className="jd-btn jd-btn-ink jd-log-desk" onClick={() => openTrade()}>
                Log trade
              </button>
            </div>
          </header>
        )}
        {undo && (
          <div className="jd-undo" role="status">
            <span>Deleted {undo.symbol}.</span>
            <button
              type="button"
              className="jd-btn jd-btn-ink"
              onClick={() => {
                void restoreLogbookTrade(undo).then(() => {
                  setUndo(null);
                  onRouteKeyChange?.(undo.id);
                });
              }}
            >
              Undo
            </button>
          </div>
        )}

      {!ready && <p className="text-sm text-muted">Opening journal…</p>}
      {loadError && (
        <p className="text-sm text-danger" role="alert">
          {loadError}
        </p>
      )}

      {ready && view === 'home' && (
        <JournalBoard
          name={firstName}
          trades={trades}
          stats={stats}
          setups={setups}
          accounts={desks}
          onOpen={(id) => go('detail', id)}
          onLog={() => openTrade()}
          onCalculator={() => openCalculator()}
          onCalendar={() => go('calendar')}
          onLedger={() => go('ledger')}
          onMetrics={() => go('metrics')}
          onPlaybook={() => go('playbook')}
          onAccounts={() => go('accounts')}
        />
      )}
      {ready && view === 'detail' && detail && (
        <TradeDetail
          trade={detail}
          account={detail.accountId ? getLogbookAccount(detail.accountId) : null}
          note={mentorNoteForTrade(detail, trades)}
          onBack={() => go('home')}
          onEdit={() => openTrade(detail.id)}
          onDelete={() => {
            if (!window.confirm('Delete this trade? You can undo for a moment.')) return;
            void deleteLogbookTrade(detail.id).then((gone) => {
              setUndo(gone);
              go('home');
            });
          }}
          onViewChart={
            onOpenChart && findSessionForSymbol(detail.symbol)
              ? () => {
                  const session = findSessionForSymbol(detail.symbol);
                  if (!session) return;
                  onOpenChart(session.id, { time: detail.openTime, tradeId: detail.id });
                }
              : onGoSessions
          }
          chartLabel={
            findSessionForSymbol(detail.symbol) ? 'View on chart' : 'Open Sessions'
          }
        />
      )}
      {ready && view === 'detail' && !detail && (
        <p className="text-sm text-muted">
          That trade is gone.{' '}
          <button type="button" className="underline" onClick={() => go('home')}>
            Back to journal
          </button>
        </p>
      )}
      {ready && view === 'ledger' && (
        <div className="jd-card jd-ledger">
          <div className="jd-card-head">
            <h2>Ledger</h2>
            <div className="jd-ledger-actions">
              <button
                type="button"
                className="jd-btn jd-btn-ghost"
                onClick={() => {
                  const csv = exportLogbookCsv();
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'talaria-journal.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={trades.length === 0}
              >
                Export
              </button>
              <button
                type="button"
                className="jd-btn jd-btn-ghost"
                onClick={() => csvRef.current?.click()}
              >
                Import
              </button>
              <input
                ref={csvRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  void file.text().then(async (text) => {
                    const res = await importLogbookCsv(text);
                    if (res.imported === 0) {
                      window.alert(res.errors[0] ?? 'No valid tickets in that file.');
                    }
                  });
                }}
              />
            </div>
          </div>
          <div className="jd-ledger-bar">
            <input
              className="jd-field jd-ledger-search"
              placeholder="Search ticker, account, setup…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Search ledger"
            />
            <div className="jd-period" role="group" aria-label="Result">
              {(
                [
                  ['all', 'All'],
                  ['win', 'Wins'],
                  ['loss', 'Losses'],
                  ['open', 'Open'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  data-on={filterResult === id ? '1' : '0'}
                  onClick={() => setFilterResult(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {setupOptions.length > 0 ? (
              <select
                className="jd-field jd-ledger-setup"
                value={filterSetup}
                onChange={(e) => setFilterSetup(e.target.value)}
                aria-label="Setup"
              >
                <option value="">All setups</option>
                {setupOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {tagChips.length > 0 ? (
            <div className="jd-chips jd-ledger-chips" role="group" aria-label="Tags">
              {tagChips.map(([tag, n]) => (
                <button
                  key={tag}
                  type="button"
                  className="jd-chip-btn"
                  data-on={filterTag === tag ? '1' : '0'}
                  onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                >
                  {tag} · {n}
                </button>
              ))}
            </div>
          ) : null}
          {filtersOn ? (
            <button
              type="button"
              className="jd-text-btn jd-ledger-clear"
              onClick={() => {
                setFilterQuery('');
                setFilterTag('');
                setFilterSetup('');
                setFilterResult('all');
              }}
            >
              Clear filters
            </button>
          ) : null}
          <TradeList
            trades={filtered}
            onOpen={(id) => go('detail', id)}
            empty={
              filtersOn
                ? 'No trades match these filters.'
                : 'No tickets in the ledger yet. Log one from Home.'
            }
          />
        </div>
      )}
      {ready && view === 'metrics' && (
        <MetricsPanel
          stats={metricsStats}
          period={period}
          accounts={desks}
          deskId={deskFilter}
        />
      )}
      {ready && view === 'calendar' && (
        <CalendarPanel trades={deskTrades} onOpen={(id) => go('detail', id)} />
      )}
      {ready && view === 'accounts' && (
        <AccountsPanel
          accounts={desks}
          trades={trades}
          onSave={async (input) => {
            await upsertLogbookAccount(input);
          }}
          onRemove={async (id) => {
            await removeLogbookAccount(id);
          }}
          onPin={async (id, onHome) => {
            await setLogbookAccountOnHome(id, onHome);
          }}
        />
      )}
      {ready && view === 'playbook' && (
        <div className="jd-card">
          <PlaybookPanel
            setups={setups}
            onAdd={async (name) => {
              await addPlaybookSetup(name);
            }}
            onRemove={async (name) => {
              if (!window.confirm(`Remove “${name}” from the playbook? Tickets stay.`)) {
                return;
              }
              await removePlaybookSetup(name);
            }}
          />
        </div>
      )}

      {ready && tradeOpen && (
        <LogbookSheet
          title={editing ? 'Edit trade' : 'Log a trade'}
          onClose={closeTrade}
          wide
          dim
          trapEscape={front === 'trade'}
        >
          <TradeForm
            key={editId ?? 'new'}
            initial={editing}
            setups={setups}
            accounts={desks}
            preset={sizePreset}
            onCancel={closeTrade}
            onSave={save}
            onCreateAccount={async (input) => upsertLogbookAccount(input)}
            onOpenCalculator={openCalculator}
          />
        </LogbookSheet>
      )}
      {ready && calcOpen && (
        <LogbookSheet
          title="Position calculator"
          onClose={closeCalculator}
          zIndex={100020}
          dim={!tradeOpen}
          trapEscape={front === 'calculator'}
        >
          <PositionCalculator
            key={`${calcSeed.accountId ?? ''}-${calcSeed.symbol ?? ''}-${calcSeed.entry ?? ''}-${calcSeed.stop ?? ''}`}
            account={
              (calcSeed.accountId && desks.find((a) => a.id === calcSeed.accountId)) || null
            }
            initialSymbol={calcSeed.symbol || 'EURUSD'}
            initialEntry={calcSeed.entry ?? null}
            initialStop={calcSeed.stop ?? null}
            onUseSize={(symbol, size) => {
              setSizePreset({ symbol, size });
              setStack((s) => {
                const without = s.filter((x) => x !== 'calculator');
                return without.includes('trade') ? without : [...without, 'trade'];
              });
            }}
          />
        </LogbookSheet>
      )}
      {ready && view !== 'detail' && (
        <div className="jd-log-dock">
          <button type="button" className="jd-btn jd-btn-ink" onClick={() => openTrade()}>
            Log trade
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
