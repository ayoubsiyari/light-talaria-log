import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bestAccount,
  computeLogbookStats,
  deskBook,
  deskNotices,
  filterByPeriod,
  homeDesks,
  kindLabel,
} from '@/logbook';
import type { LogbookAccount, LogbookStats, LogbookTrade, StatsPeriod } from '@/logbook/types';
import { DeskClocks } from './DeskClocks';
import { DeskDeck } from './DeskDeck';
import { DeskMarks } from './DeskMarks';
import { formatMoney, formatPct } from './format';
import { WeekPlan } from './WeekPlan';

interface JournalBoardProps {
  name: string;
  trades: LogbookTrade[];
  stats: LogbookStats;
  setups: string[];
  accounts: LogbookAccount[];
  onOpen: (id: string) => void;
  onLog: () => void;
  onCalculator: () => void;
  onCalendar: () => void;
  onLedger: () => void;
  onMetrics: () => void;
  onPlaybook: () => void;
  onAccounts: () => void;
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function JournalBoard({
  name,
  trades,
  stats,
  setups,
  accounts,
  onOpen,
  onLog,
  onCalculator,
  onCalendar,
  onLedger,
  onMetrics,
  onPlaybook,
  onAccounts,
}: JournalBoardProps) {
  const now = new Date();
  const week = useMemo(() => filterByPeriod(trades, 'week'), [trades]);
  const lastClosed = useMemo(() => {
    return [...trades]
      .filter((t) => t.status === 'closed')
      .sort((a, b) => (b.closeTime ?? 0) - (a.closeTime ?? 0))[0] ?? null;
  }, [trades]);

  const ruleN = stats.ruleFollowedCount + stats.ruleBrokenCount;
  const ruleRate = ruleN > 0 ? stats.ruleFollowedCount / ruleN : 0;
  const weekShare =
    stats.closedCount > 0
      ? Math.min(1, week.filter((t) => t.status === 'closed').length / Math.max(stats.closedCount, 1))
      : 0;
  const returnPct =
    stats.profitFactor != null ? Math.max(0, Math.min(1, stats.profitFactor / 3)) : 0;

  return (
    <div>
      <div className="jd-hero">
        <div>
          <h1 className="jd-hello">
            {greet()}, {name}
          </h1>
          <LiveClock />
        </div>
        <div className="jd-meters jd-hero-meters">
          <Meter label="Win rate" value={stats.winRate ?? 0} />
          <Meter label="Rules" value={ruleRate} />
          <Meter label="This week" value={weekShare} hash />
          <Meter label="Factor" value={returnPct} />
        </div>
        <div className="jd-kpis">
          <div>
            <div className="jd-kpi-n">{stats.closedCount}</div>
            <div className="jd-kpi-l">Closed</div>
          </div>
          <div>
            <div className="jd-kpi-n">{stats.openCount}</div>
            <div className="jd-kpi-l">Open</div>
          </div>
          <div>
            <div className="jd-kpi-n">{stats.wins}</div>
            <div className="jd-kpi-l">Wins</div>
          </div>
        </div>
      </div>

      <div className="jd-bento">
        <DeskDeck
          trade={lastClosed}
          onLog={onLog}
          onCalculator={onCalculator}
          onOpen={onOpen}
        />
        <Activity trades={week} onMetrics={onMetrics} />
        <DeskClocks />
        <HitCard stats={stats} accounts={accounts} trades={trades} />
        <div className="jd-notes-col">
          <DeskRulesFold accounts={accounts} trades={trades} onAccounts={onAccounts} />
          <PendingTape trades={trades} onOpen={onOpen} onLedger={onLedger} />
        </div>
        <div className="jd-fold-col">
          <DeskFold accounts={homeDesks(accounts)} trades={trades} onAccounts={onAccounts} />
          <PlaybookFold setups={setups} trades={trades} onPlaybook={onPlaybook} />
        </div>
        <WeekPlan
          trades={trades}
          now={now}
          hours={[8, 9, 10, 11, 12]}
          onOpen={onOpen}
          onCalendar={onCalendar}
        />
      </div>
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="jd-clock">
      {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      {' · '}
      {formatClock(now)}
    </p>
  );
}

function Meter({
  label,
  value,
  hash = false,
}: {
  label: string;
  value: number;
  hash?: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="jd-meter">
      <span className="jd-meter-name">{label}</span>
      <span className="jd-meter-pct">{pct}%</span>
      <div className="jd-meter-track">
        <div
          className={['jd-meter-fill', hash ? 'is-hash' : ''].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Activity({
  trades,
  onMetrics,
}: {
  trades: LogbookTrade[];
  onMetrics: () => void;
}) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const t of trades) {
    if (t.status !== 'closed' || t.closeTime == null) continue;
    counts[new Date(t.closeTime * 1000).getDay()] += 1;
  }
  const max = Math.max(1, ...counts);
  const closed = counts.reduce((a, b) => a + b, 0);
  const hot = counts.indexOf(Math.max(...counts));

  return (
    <article className="jd-card jd-activity">
      <div className="jd-card-head">
        <h2>Activity</h2>
        <button type="button" className="jd-icon-btn" onClick={onMetrics} aria-label="Open metrics">
          <ArrowIcon />
        </button>
      </div>
      <p className="jd-stat-xl">{closed}</p>
      <p className="jd-muted">Closes this week</p>
      <div className="jd-bars">
        {counts.map((n, i) => (
          <div key={`${DOW[i]}-${i}`} className="jd-bar-col">
            <div className="jd-bar-track">
              <div
                className={['jd-bar', i === hot && n > 0 ? 'is-hot' : ''].join(' ')}
                style={{ height: `${Math.max(8, (n / max) * 100)}%`, animationDelay: `${i * 60}ms` }}
              />
            </div>
            <span>{DOW[i]}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function HitCard({
  stats,
  accounts,
  trades,
}: {
  stats: LogbookStats;
  accounts: LogbookAccount[];
  trades: LogbookTrade[];
}) {
  const desk = useMemo(() => bestAccount(accounts, trades), [accounts, trades]);
  const deskTrades = useMemo(() => (desk ? deskBook(desk, trades) : []), [desk, trades]);
  const deskStats = useMemo(
    () => computeLogbookStats(deskTrades, stats.period),
    [deskTrades, stats.period],
  );
  const books = bookShares(deskStats);
  const target =
    desk?.kind === 'prop' && desk.balance != null && desk.balance > 0
      ? desk.rules?.profitTargetPct != null && desk.rules.profitTargetPct > 0
        ? desk.balance * (desk.rules.profitTargetPct / 100)
        : null
      : null;
  const showDesk = desk != null && deskStats.closedCount > 0;

  return (
    <article className="jd-card jd-hit">
      <SegRow
        title="Hit rate"
        value={formatPct(stats.winRate)}
        parts={hitParts(stats)}
        foot={
          stats.closedCount === 0
            ? 'Waiting on a close'
            : `${stats.wins} wins · ${stats.losses} losses`
        }
      />
      {desk && showDesk ? (
        <SegRow
          title={desk.name}
          value={formatMoney(deskStats.netPnl)}
          parts={[books.win, books.loss, books.rest]}
          foot={`${deskStats.closedCount} closes · ${kindLabel(desk.kind)}`}
        />
      ) : null}
      {showDesk && target != null ? (
        <SegRow
          title="Target"
          value={formatPct(Math.max(0, deskStats.netPnl / target))}
          parts={targetParts(deskStats.netPnl, target)}
          foot={`${formatMoney(deskStats.netPnl)} · ${formatMoney(target)} goal`}
        />
      ) : showDesk ? (
        <SegRow
          title="Factor"
          value={deskStats.profitFactor != null ? deskStats.profitFactor.toFixed(2) : '—'}
          parts={[books.win, books.loss, books.rest]}
          foot={
            deskStats.avgWin != null && deskStats.avgLoss != null
              ? `${formatMoney(deskStats.avgWin)} avg win · ${formatMoney(deskStats.avgLoss)} avg loss`
              : `${deskStats.closedCount} closes`
          }
        />
      ) : null}
    </article>
  );
}

function hitParts(stats: LogbookStats): [number, number, number] {
  const n = Math.max(1, stats.closedCount);
  const win = stats.wins / n;
  const loss = stats.losses / n;
  return [win, loss, Math.max(0, 1 - win - loss)];
}

function bookShares(stats: LogbookStats): { win: number; loss: number; rest: number } {
  const win = (stats.avgWin ?? 0) * stats.wins;
  const loss = Math.abs(stats.avgLoss ?? 0) * stats.losses;
  const rest = stats.scratches;
  if (win + loss + rest === 0) return { win: 0, loss: 0, rest: 1 };
  return { win, loss, rest };
}

function targetParts(net: number, target: number): [number, number, number] {
  if (!(target > 0)) return [0, 0, 1];
  const earned = Math.min(Math.max(net, 0), target);
  const remain = Math.max(target - earned, 0);
  const over = Math.max(net - target, 0);
  const under = net < 0 ? Math.abs(net) : 0;
  return [earned, over, remain + under];
}

function SegRow({
  title,
  value,
  parts,
  foot,
}: {
  title: string;
  value: string;
  parts: [number, number, number];
  foot: string;
}) {
  const [a, b, c] = parts;
  return (
    <div className="jd-seg-row">
      <div className="jd-card-head">
        <h2>{title}</h2>
        <span className="jd-seg-val">{value}</span>
      </div>
      <div className="jd-seg" aria-hidden="true">
        {a > 0 ? <i className="is-a" style={{ flex: Math.max(a, 0.08) }} /> : null}
        {b > 0 ? <i className="is-b" style={{ flex: Math.max(b, 0.08) }} /> : null}
        {c > 0 ? <i className="is-c" style={{ flex: Math.max(c, 0.08) }} /> : null}
      </div>
      <p className="jd-seg-foot">{foot}</p>
    </div>
  );
}

function PendingTape({
  trades,
  onOpen,
  onLedger,
}: {
  trades: LogbookTrade[];
  onOpen: (id: string) => void;
  onLedger: () => void;
}) {
  const open = trades.filter((t) => t.status === 'open');
  const recent = trades.filter((t) => t.status === 'closed').slice(0, 6);
  const rows =
    open.length > 0
      ? open.slice(0, 6).map((t) => ({ trade: t, done: false }))
      : recent.slice(0, 6).map((t) => ({ trade: t, done: true }));
  const title = open.length > 0 ? 'Open' : 'Recent';

  return (
    <section className="jd-dark">
      <div className="jd-card-head">
        <h2>{title}</h2>
        <button type="button" className="jd-muted" onClick={onLedger} style={{ background: 'none', border: 0, minHeight: 44, cursor: 'pointer', color: 'inherit' }}>
          {open.length}/{Math.max(open.length, trades.length)}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="jd-muted" style={{ marginTop: 16 }}>
          Nothing on the tape yet.
        </p>
      ) : (
        <ul className="jd-tape">
          {rows.map(({ trade, done }) => (
            <li key={trade.id}>
              <button type="button" onClick={() => onOpen(trade.id)}>
                <SideMark side={trade.side} />
                <span>
                  <b>{trade.symbol}</b>
                  <span className="jd-muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                    {formatChipWhen(trade)}
                  </span>
                </span>
                <CheckMark on={done} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatChipWhen(t: LogbookTrade): string {
  const unix = t.status === 'open' ? t.openTime : (t.closeTime ?? t.openTime);
  const d = new Date(unix * 1000);
  return `${d.toLocaleString(undefined, { month: 'short', day: 'numeric' })}, ${formatClock(d)}`;
}

function DeskRulesFold({
  accounts,
  trades,
  onAccounts,
}: {
  accounts: LogbookAccount[];
  trades: LogbookTrade[];
  onAccounts: () => void;
}) {
  const notes = useMemo(() => deskNotices(accounts, trades), [accounts, trades]);
  return (
    <aside className="jd-card jd-desk-notes">
      <div className="jd-card-head">
        <h2>Rules</h2>
        <button type="button" className="jd-icon-btn" onClick={onAccounts} aria-label="Open accounts">
          <ArrowIcon />
        </button>
      </div>
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            <button type="button" data-tone={n.tone} onClick={onAccounts}>
              <RuleMark warn={n.tone === 'warn'} />
              <span>{n.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function DeskFold({
  accounts,
  trades,
  onAccounts,
}: {
  accounts: LogbookAccount[];
  trades: LogbookTrade[];
  onAccounts: () => void;
}) {
  return (
    <aside className="jd-card">
      <div className="jd-card-head">
        <h2>Desks</h2>
        <button type="button" className="jd-icon-btn" onClick={onAccounts} aria-label="Open accounts">
          <ArrowIcon />
        </button>
      </div>
      {accounts.length === 0 ? (
        <p className="jd-muted" style={{ marginTop: 8 }}>
          Pin a desk on Accounts to show it here.
        </p>
      ) : (
        <ul className="jd-desks-list">
          {accounts.map((a) => (
            <li key={a.id}>
              <DeskMarks
                account={a}
                tickets={trades.filter((t) => t.accountId === a.id).length}
                trades={trades}
              />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function PlaybookFold({
  setups,
  trades,
  onPlaybook,
}: {
  setups: string[];
  trades: LogbookTrade[];
  onPlaybook: () => void;
}) {
  const names = setups;
  return (
    <aside className="jd-card jd-fold">
      {names.length === 0 ? (
        <p className="jd-muted">Setups you add here show up on the ticket.</p>
      ) : (
        names.map((name, i) => {
          const n = trades.filter((t) => (t.setup ?? '') === name).length;
          return (
            <details key={name} open={i === 0}>
              <summary>
                <span>{name}</span>
                <Chevron />
              </summary>
              <p>
                {n} ticket{n === 1 ? '' : 's'} tagged.
              </p>
            </details>
          );
        })
      )}
      <button type="button" className="jd-btn jd-btn-ghost jd-fold-go" onClick={onPlaybook}>
        Playbook
      </button>
    </aside>
  );
}

export function DeskSwitch({
  accounts,
  deskId,
  onDesk,
}: {
  accounts: { id: string; name: string }[];
  deskId: string;
  onDesk: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const picked = accounts.find((a) => a.id === deskId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const n = e.target;
      if (!(n instanceof Node)) return;
      if (root.current?.contains(n)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (accounts.length === 0) return null;

  const pick = (id: string) => {
    onDesk(id);
    setOpen(false);
  };

  return (
    <div className="jd-desk-dd" ref={root}>
      <button
        type="button"
        className="jd-desk-dd-btn"
        data-on={deskId ? '1' : '0'}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        {picked ? picked.name : 'Account'}
        <Chevron />
      </button>
      {open ? (
        <div className="jd-menu jd-desk-dd-menu" role="listbox" aria-label="Account">
          <button type="button" role="option" aria-selected={!deskId} data-on={!deskId ? '1' : '0'} onClick={() => pick('')}>
            All desks
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={deskId === a.id}
              data-on={deskId === a.id ? '1' : '0'}
              onClick={() => pick(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PeriodSwitch({
  period,
  onPeriod,
}: {
  period: StatsPeriod;
  onPeriod: (p: StatsPeriod) => void;
}) {
  return (
    <div className="jd-period" role="group" aria-label="Stats period">
      {(['week', 'month', 'all'] as StatsPeriod[]).map((p) => (
        <button
          key={p}
          type="button"
          data-on={period === p ? '1' : '0'}
          onClick={() => onPeriod(p)}
        >
          {p === 'all' ? 'All' : p === 'week' ? 'Week' : 'Month'}
        </button>
      ))}
    </div>
  );
}

function SideMark({ side }: { side: 'long' | 'short' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d={side === 'long' ? 'M10 15V5M10 5l-4 4M10 5l4 4' : 'M10 5v10M10 15l-4-4M10 15l4-4'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" opacity={on ? 1 : 0.4} />
      {on ? (
        <path d="M7 11.5l2.5 2.5L15 8.5" stroke="var(--jd-accent)" strokeWidth="1.5" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function RuleMark({ warn }: { warn: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {warn ? (
        <path
          d="M8 2.6 14 13.4H2L8 2.6Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      )}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M5 13L13 5M13 5H7M13 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
