import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  BreakdownRow,
  ClosePoint,
  LogbookAccount,
  LogbookStats,
  StatsPeriod,
} from '@/logbook/types';
import { EquitySpark } from './EquitySpark';
import { formatPct, formatR } from './format';

export function MetricsPanel({
  stats,
  period,
  accounts,
  deskId,
}: {
  stats: LogbookStats;
  period: StatsPeriod;
  accounts: LogbookAccount[];
  deskId: string;
}) {
  const net = useCountUp(stats.netPnl);
  const ruleN = stats.ruleFollowedCount + stats.ruleBrokenCount;
  const ruleRate = ruleN > 0 ? stats.ruleFollowedCount / ruleN : 0;
  const factor = stats.profitFactor;
  const streakKind = stats.streak.kind;
  const streakLabel =
    streakKind === 'none' ? 'Streak' : streakKind === 'win' ? 'Win streak' : 'Loss streak';
  const periodPhrase = period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'All time';
  const deskName = accounts.find((a) => a.id === deskId)?.name ?? null;
  const scope = deskName ? `${periodPhrase} · ${deskName}` : periodPhrase;

  return (
    <div className="jd-metrics-page">
      <section className="jd-hero jd-metrics-hero">
        <div className="jd-metrics-net">
          <div className={stats.closedCount === 0 ? 'jd-metrics-net-n jd-muted' : `jd-metrics-net-n ${toneClass(stats.netPnl)}`}>
            {stats.closedCount === 0 ? '—' : prettyMoney(net, 0)}
          </div>
          <div className="jd-metrics-net-l">
            <span>Net P&L</span>
            <span className="jd-metrics-net-dot" aria-hidden="true" />
            <span>{scope}</span>
          </div>
          {stats.closedCount === 0 && stats.openCount === 0 ? (
            <p className="jd-muted jd-metrics-hero-note">
              Metrics wait on a close. Log an exit and this page starts counting.
            </p>
          ) : stats.closedCount === 0 ? (
            <p className="jd-muted jd-metrics-hero-note">
              No closes in {scope.toLowerCase()}.
            </p>
          ) : (
            <div className="jd-metrics-aside">
              <div>
                <div className={['jd-metrics-aside-n', toneClass(stats.bestClose)].join(' ')}>
                  {prettyMoney(stats.bestClose, 0)}
                </div>
                <div className="jd-kpi-l">Best</div>
              </div>
              <div>
                <div className={['jd-metrics-aside-n', toneClass(stats.peakEquity)].join(' ')}>
                  {prettyMoney(stats.peakEquity, 0)}
                </div>
                <div className="jd-kpi-l">High</div>
              </div>
              <div>
                <div className={['jd-metrics-aside-n', toneClass(stats.lastClose?.pnl)].join(' ')}>
                  {prettyMoney(stats.lastClose?.pnl, 0)}
                </div>
                <div className="jd-kpi-l">
                  {stats.lastClose ? `Last · ${stats.lastClose.symbol}` : 'Last'}
                </div>
              </div>
            </div>
          )}
        </div>
        <TiltCard className="jd-metrics-meters" key={`${period}-${deskId}`}>
          <div className="jd-meters">
            <Meter
              label="Win rate"
              value={stats.winRate ?? 0}
              display={formatPct(stats.winRate)}
              mark={0.5}
            />
            <Meter label="Rules" value={ruleRate} display={formatPct(ruleRate)} mark={0.5} />
            <Meter
              label="Factor"
              value={factor != null ? Math.max(0, Math.min(1, factor / 5)) : 0}
              display={factor != null ? factor.toFixed(2) : '—'}
              mark={0.2}
            />
          </div>
        </TiltCard>
        <div className="jd-metrics-count">
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
              <div className="jd-kpi-n">{stats.losses}</div>
              <div className="jd-kpi-l">Losses</div>
            </div>
          </div>
        </div>
      </section>

      {stats.closedCount > 0 && (
        <>
          <TiltCard className="jd-metrics-more">
            <Stat k="Avg win" v={prettyMoney(stats.avgWin, 0)} up />
            <Stat k="Avg loss" v={prettyMoney(stats.avgLoss, 0)} down />
            <Stat k="Per trade" v={prettyMoney(stats.expectancy, 0)} tone={stats.expectancy} />
            <Stat k="Payoff" v={stats.payoff != null ? `${stats.payoff.toFixed(2)}×` : '—'} />
            <Stat k="Avg R" v={formatR(stats.avgR)} />
            <Stat k="Drawdown" v={prettyMoney(-stats.maxDrawdown, 0)} down={stats.maxDrawdown > 0} />
            <Stat k="Avg hold" v={formatHold(stats.avgHoldSec)} />
            <Stat k={streakLabel} v={streakKind === 'none' ? '—' : String(stats.streak.length)} />
          </TiltCard>

          <TiltCard className="jd-metrics-equity">
            <div className="jd-card-head">
              <h2>Equity</h2>
              <span className={toneClass(stats.netPnl)}>{prettyMoney(stats.netPnl, 0)}</span>
            </div>
            <EquitySpark
              key={period}
              equity={stats.equity}
              className="jd-equity-svg"
              formatValue={(n) => prettyMoney(n, 0)}
            />
          </TiltCard>

          <CloseBars key={period} closes={stats.closes} />
          <WeekdayBars key={`d-${period}`} rows={stats.byWeekday} />
          <SessionBars rows={stats.bySession} />
          <Breakdown title="By setup" rows={stats.bySetup} className="jd-metrics-setup" />
          <SideSplit rows={stats.bySide} />
          <Breakdown title="By emotion" rows={stats.byEmotion} className="jd-metrics-emotion" />
        </>
      )}
    </div>
  );
}

function TiltCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <article className={['jd-card', 'jd-tilt', className].filter(Boolean).join(' ')}>
      {children}
    </article>
  );
}

function Stat({
  k,
  v,
  tone,
  up,
  down,
}: {
  k: string;
  v: string;
  tone?: number | null;
  up?: boolean;
  down?: boolean;
}) {
  const cls =
    up || (tone != null && tone > 0)
      ? 'text-success'
      : down || (tone != null && tone < 0)
        ? 'text-danger'
        : '';
  return (
    <div className="jd-metrics-stat">
      <div className={['jd-metrics-n', cls].join(' ')}>{v}</div>
      <div className="jd-kpi-l">{k}</div>
    </div>
  );
}

function GraphTip({
  title,
  value,
  meta,
  tone,
}: {
  title: string;
  value: string;
  meta?: string;
  tone?: number | null;
}) {
  return (
    <div className="jd-tip" role="status">
      <span className="jd-tip-k">{title}</span>
      <span className={['jd-tip-v', toneClass(tone)].join(' ')}>{value}</span>
      {meta ? <span className="jd-tip-m">{meta}</span> : null}
    </div>
  );
}

function BarTipHit({
  label,
  row,
  children,
}: {
  label: string;
  row: BreakdownRow | null;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const pnl = row?.netPnl ?? 0;
  return (
    <div
      className="jd-bar-col jd-tip-hit"
      onPointerEnter={() => setOn(true)}
      onPointerLeave={() => setOn(false)}
    >
      {children}
      {on && (
        <GraphTip
          title={label}
          value={prettyMoney(pnl)}
          meta={
            row
              ? `${row.count === 1 ? '1 trade' : `${row.count} trades`} · ${formatPct(row.winRate)} wins`
              : 'No trades'
          }
          tone={pnl}
        />
      )}
    </div>
  );
}

function Meter({
  label,
  value,
  display,
  mark,
}: {
  label: string;
  value: number;
  display: string;
  mark?: number;
}) {
  return (
    <div className="jd-meter">
      <div className="jd-meter-n">{display}</div>
      <div className="jd-kpi-l">{label}</div>
      <MeterRail value={value} mark={mark} />
    </div>
  );
}

function MeterRail({ value, mark }: { value: number; mark?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="jd-meter-rail">
      <div className="jd-meter-track">
        <div className="jd-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="jd-meter-knob" style={{ left: `${pct}%` }} />
      {mark != null && <span className="jd-meter-mark" style={{ left: `${mark * 100}%` }} />}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  className,
}: {
  title: string;
  rows: BreakdownRow[];
  className?: string;
}) {
  const shown = [...rows].sort((a, b) => b.netPnl - a.netPnl);
  const max = Math.max(1, ...shown.map((r) => Math.abs(r.netPnl)));
  return (
    <TiltCard className={className}>
      <div className="jd-card-head">
        <h2>{title}</h2>
      </div>
      {shown.length === 0 ? (
        <p className="jd-muted" style={{ marginTop: 8 }}>
          Nothing here yet.
        </p>
      ) : (
        <ul className="jd-break jd-break-slim">
          {shown.map((r, i) => (
            <li key={r.key} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="jd-break-top">
                <b>{r.key}</b>
                <span className={toneClass(r.netPnl)}>{prettyMoney(r.netPnl, 0)}</span>
              </div>
              <div className="jd-break-meta">
                {r.count === 1 ? '1 trade' : `${r.count} trades`}
                {' · '}
                {formatPct(r.winRate)} wins
              </div>
              <div className="jd-meter-track">
                <div
                  className={['jd-meter-fill', r.netPnl < 0 ? 'is-down' : ''].join(' ')}
                  style={{
                    width: `${Math.max(10, (Math.abs(r.netPnl) / max) * 100)}%`,
                    animationDelay: `${80 + i * 50}ms`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </TiltCard>
  );
}

const DOW_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const SESSION_ORDER = ['Asia', 'London', 'New York', 'Late'];
const SESSION_SHORT = ['Asia', 'Lon', 'NY', 'Late'];

function WeekdayBars({ rows }: { rows: BreakdownRow[] }) {
  const byName = new Map(rows.map((r) => [r.key, r]));
  const days = DOW_ORDER.map((name) => byName.get(name) ?? null);
  const scores = days.map((d) => Math.abs(d?.netPnl ?? 0));
  const max = Math.max(1, ...scores);
  const hot = scores.indexOf(Math.max(...scores));
  return (
    <TiltCard className="jd-metrics-days">
      <div className="jd-card-head">
        <h2>Weekdays</h2>
      </div>
      <div className="jd-bars jd-bars-short">
        {days.map((d, i) => {
          const pnl = d?.netPnl ?? 0;
          return (
            <BarTipHit key={`${DOW_SHORT[i]}-${i}`} label={DOW_ORDER[i]!} row={d}>
              <div className="jd-bar-track">
                <div
                  className={['jd-bar', i === hot && scores[i]! > 0 ? 'is-hot' : ''].join(' ')}
                  style={{
                    height: `${Math.max(8, (scores[i]! / max) * 100)}%`,
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <span>{DOW_SHORT[i]}</span>
              <span className={['jd-bar-val', toneClass(pnl)].join(' ')}>
                {compactMoney(pnl)}
              </span>
            </BarTipHit>
          );
        })}
      </div>
    </TiltCard>
  );
}

function SessionBars({ rows }: { rows: BreakdownRow[] }) {
  const byName = new Map(rows.map((r) => [r.key, r]));
  const sessions = SESSION_ORDER.map((name) => byName.get(name) ?? null);
  const scores = sessions.map((d) => Math.abs(d?.netPnl ?? 0));
  const max = Math.max(1, ...scores);
  const hot = scores.indexOf(Math.max(...scores));
  const lead = sessions[hot];
  return (
    <TiltCard className="jd-metrics-session">
      <div className="jd-card-head">
        <h2>Session</h2>
        {lead && scores[hot]! > 0 ? (
          <span className={toneClass(lead.netPnl)}>{prettyMoney(lead.netPnl, 0)}</span>
        ) : null}
      </div>
      <div className="jd-bars jd-bars-short">
        {sessions.map((d, i) => {
          const pnl = d?.netPnl ?? 0;
          return (
            <BarTipHit key={SESSION_ORDER[i]} label={SESSION_ORDER[i]!} row={d}>
              <div className="jd-bar-track">
                <div
                  className={['jd-bar', i === hot && scores[i]! > 0 ? 'is-hot' : ''].join(' ')}
                  style={{
                    height: `${Math.max(8, (scores[i]! / max) * 100)}%`,
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              </div>
              <span>{SESSION_SHORT[i]}</span>
              <span className={['jd-bar-val', toneClass(pnl)].join(' ')}>
                {compactMoney(pnl)}
              </span>
            </BarTipHit>
          );
        })}
      </div>
    </TiltCard>
  );
}

function SideSplit({ rows }: { rows: BreakdownRow[] }) {
  const long = rows.find((r) => r.key === 'Long');
  const short = rows.find((r) => r.key === 'Short');
  const longN = long?.count ?? 0;
  const shortN = short?.count ?? 0;
  return (
    <TiltCard className="jd-metrics-side">
      <div className="jd-card-head">
        <h2>Side</h2>
      </div>
      <div className="jd-metrics-side-grid">
        <div>
          <div className={['jd-metrics-n', toneClass(long?.netPnl)].join(' ')}>
            {prettyMoney(long?.netPnl ?? 0, 0)}
          </div>
          <div className="jd-kpi-l">Long · {longN}</div>
        </div>
        <div>
          <div className={['jd-metrics-n', toneClass(short?.netPnl)].join(' ')}>
            {prettyMoney(short?.netPnl ?? 0, 0)}
          </div>
          <div className="jd-kpi-l">Short · {shortN}</div>
        </div>
      </div>
      <div className="jd-seg jd-seg-tight" aria-hidden="true">
        <i style={{ flex: Math.max(longN, 0.08) }} />
        <i style={{ flex: Math.max(shortN, 0.08) }} />
      </div>
      {(long?.avgR != null || short?.avgR != null) && (
        <p className="jd-muted" style={{ marginTop: 10 }}>
          {long?.avgR != null ? `${formatR(long.avgR)} long` : '—'}
          {' · '}
          {short?.avgR != null ? `${formatR(short.avgR)} short` : '—'}
        </p>
      )}
    </TiltCard>
  );
}

function CloseBars({ closes }: { closes: readonly ClosePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = closes.length;
  const last = closes[n - 1];
  const shown = hover != null ? closes[hover] : last;
  if (n === 0) {
    return (
      <TiltCard className="jd-metrics-closes">
        <div className="jd-card-head">
          <h2>Closes</h2>
        </div>
        <p className="jd-muted" style={{ marginTop: 8 }}>
          Need a close for this tape.
        </p>
      </TiltCard>
    );
  }
  const w = 360;
  const h = 140;
  const mid = h / 2;
  const max = Math.max(1, ...closes.map((c) => Math.abs(c.pnl)));
  const gap = 4;
  const barW = Math.max(6, (w - gap * (n + 1)) / n);
  const hi = hover ?? n - 1;
  const left = ((gap + hi * (barW + gap) + barW / 2) / w) * 100;
  return (
    <TiltCard className="jd-metrics-closes">
      <div className="jd-card-head">
        <h2>Closes</h2>
        {shown ? (
          <span className={toneClass(shown.pnl)}>
            {shown.symbol} {prettyMoney(shown.pnl, 0)}
          </span>
        ) : null}
      </div>
      <div
        className="jd-graph jd-close-svg"
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label="P&L of recent closes"
          preserveAspectRatio="none"
        >
          <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--jd-line)" strokeWidth="1" />
          {closes.map((c, i) => {
            const bh = Math.max(4, (Math.abs(c.pnl) / max) * (mid - 10));
            const x = gap + i * (barW + gap);
            const y = c.pnl >= 0 ? mid - bh : mid;
            return (
              <g key={`${c.symbol}-${i}`}>
                <rect
                  className={['jd-close-bar', c.pnl >= 0 ? 'is-up' : 'is-down'].join(' ')}
                  x={x}
                  y={y}
                  width={barW}
                  height={bh}
                  rx="3"
                  fill={c.pnl >= 0 ? 'var(--jd-up)' : 'var(--jd-down)'}
                  style={{ animationDelay: `${i * 45}ms` }}
                  pointerEvents="none"
                />
                <rect
                  x={x - gap / 2}
                  y={0}
                  width={barW + gap}
                  height={h}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
        {hover != null && shown && (
          <div className="jd-tip jd-tip-follow" style={{ left: `${left}%`, top: shown.pnl >= 0 ? '18%' : '58%' }} role="status">
            <span className="jd-tip-k">
              {shown.symbol} · {shown.side}
            </span>
            <span className={['jd-tip-v', toneClass(shown.pnl)].join(' ')}>
              {prettyMoney(shown.pnl)}
            </span>
            {shown.r != null ? <span className="jd-tip-m">{formatR(shown.r)}</span> : null}
          </div>
        )}
      </div>
    </TiltCard>
  );
}

function compactMoney(n: number): string {
  if (n === 0) return '—';
  const a = Math.abs(n);
  if (a >= 1000) {
    const signed = n > 0 ? '+' : '-';
    return `${signed}${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  }
  return prettyMoney(n, 0);
}

function prettyMoney(n: number | null | undefined, digits?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const d = digits ?? (Math.abs(n) >= 100 ? 0 : 2);
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function formatHold(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
}

function toneClass(n: number | null | undefined): string {
  if (n == null || n === 0) return '';
  return n > 0 ? 'text-success' : 'text-danger';
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useCountUp(value: number): number {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const seen = useRef(false);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      fromRef.current = value;
      seen.current = true;
      return;
    }
    const from = seen.current ? fromRef.current : 0;
    seen.current = true;
    fromRef.current = value;
    if (from === value) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 700;
    const ease = (p: number) => 1 - (1 - p) ** 3;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setShown(from + (value - from) * ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return shown;
}
