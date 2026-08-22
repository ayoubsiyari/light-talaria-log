import { kindLabel, propProgress, propRuleChips } from '@/logbook/accounts';
import type { LogbookAccount, LogbookAccountKind, LogbookTrade } from '@/logbook/types';

export function DeskMarks({
  account,
  tickets,
  trades = [],
}: {
  account: LogbookAccount;
  tickets?: number;
  trades?: readonly LogbookTrade[];
}) {
  const chips = account.kind === 'prop' ? propRuleChips(account.rules) : [];
  const prog = propProgress(account, trades);
  const fill = prog != null ? Math.max(0, Math.min(1, prog.pct)) : 0;
  return (
    <div className="jd-desks-row">
      <div className="jd-desks-top">
        <p className="jd-name">{account.name}</p>
        {prog != null ? (
          <span
            className={['jd-desks-n tabular-nums', prog.pct < 0 ? 'is-down' : ''].filter(Boolean).join(' ')}
          >
            {Math.round(prog.pct * 100)}%
          </span>
        ) : tickets != null ? (
          <span className="jd-desks-n tabular-nums">{tickets}</span>
        ) : null}
      </div>
      <div className="jd-desks-marks">
        <span className={`jd-desks-pill is-${account.kind}`}>
          <KindMark kind={account.kind} />
          {kindLabel(account.kind)}
        </span>
        <span className="jd-desks-pill is-plat">
          <PlatMark />
          {account.platform}
        </span>
      </div>
      {chips.length > 0 ? (
        <div className="jd-desks-chips">
          {chips.map((c) => (
            <span key={c.id} className="jd-desks-chip">
              <b>{c.value}</b>
              <i>{c.label}</i>
            </span>
          ))}
        </div>
      ) : null}
      {prog ? (
        <div
          className="jd-acct-prog"
          data-down={prog.pct < 0 ? '1' : '0'}
          aria-label={`${Math.round(prog.pct * 100)}% of profit target`}
        >
          <i style={{ width: `${fill * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function KindMark({ kind }: { kind: LogbookAccountKind }) {
  if (kind === 'prop') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M6 1.4 10 3v3.2c0 2.2-1.7 3.6-4 4.4-2.3-.8-4-2.2-4-4.4V3l4-1.6Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'live') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="4.1" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.1" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.6" />
    </svg>
  );
}

function PlatMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1.4" y="2" width="9.2" height="6.2" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
