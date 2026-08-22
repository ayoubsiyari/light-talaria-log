import type { MentorInsight } from '@/logbook/types';
import type { LogbookAccount, LogbookTrade } from '@/logbook/types';
import { formatPropRules, kindLabel, tradeDeskLine } from '@/logbook/accounts';
import { formatMoney, formatR, formatWhen, pnlClass } from './format';

interface TradeDetailProps {
  trade: LogbookTrade;
  account: LogbookAccount | null;
  note: MentorInsight | null;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
  onViewChart?: () => void;
  chartLabel?: string;
}

export function TradeDetail({
  trade,
  account,
  note,
  onEdit,
  onDelete,
  onBack,
  onViewChart,
  chartLabel = 'View on chart',
}: TradeDetailProps) {
  return (
    <div className="jd-stack">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="jd-btn jd-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="jd-btn jd-btn-ink" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="jd-btn jd-btn-ghost" onClick={onDelete}>
          Delete
        </button>
        {onViewChart && (
          <button type="button" className="jd-btn jd-btn-ghost" onClick={onViewChart}>
            {chartLabel}
          </button>
        )}
      </div>

      <header className="jd-card">
        <h2 className="jd-hello" style={{ fontSize: '2rem' }}>
          {trade.symbol}{' '}
          <span className={trade.side === 'long' ? 'text-success' : 'text-danger'}>
            {trade.side}
          </span>
        </h2>
        <p className={`jd-stat-xl ${pnlClass(trade.netPnl)}`}>
          {trade.status === 'open' ? 'Open' : formatMoney(trade.netPnl)}{' '}
          <span className="jd-muted">{formatR(trade.rMultiple)}</span>
        </p>
      </header>

      {note && (
        <section className="jd-card">
          <p className="font-semibold">{note.headline}</p>
          <p className="jd-muted" style={{ marginTop: 8 }}>{note.evidence}</p>
          <p style={{ marginTop: 8 }}>{note.action}</p>
        </section>
      )}

      <dl className="jd-card">
        <Row k="Account" v={tradeDeskLine(trade)} />
        <Row k="Type" v={kindLabel(trade.accountKind)} />
        <Row k="Platform" v={trade.platform ?? '—'} />
        <Row k="Status" v={trade.status} />
        <Row k="Open" v={formatWhen(trade.openTime)} />
        <Row k="Close" v={trade.closeTime ? formatWhen(trade.closeTime) : '—'} />
        <Row k="Entry" v={String(trade.entryPrice)} />
        <Row k="Exit" v={trade.exitPrice != null ? String(trade.exitPrice) : '—'} />
        <Row k="Size" v={String(trade.size)} />
        <Row k="Stop" v={trade.stopPrice != null ? String(trade.stopPrice) : '—'} />
        <Row k="Target" v={trade.targetPrice != null ? String(trade.targetPrice) : '—'} />
        <Row k="Commission" v={formatMoney(trade.commission)} />
        <Row k="Setup" v={trade.setup ?? '—'} />
        <Row k="Tags" v={trade.tags.length ? trade.tags.join(', ') : '—'} />
        <Row k="Grade" v={trade.grade ?? '—'} />
        <Row k="Emotion" v={trade.emotion ?? '—'} />
        <Row
          k="Rules"
          v={
            trade.rulesFollowed == null ? '—' : trade.rulesFollowed ? 'Followed' : 'Broke'
          }
        />
      </dl>

      {account?.kind === 'prop' && formatPropRules(account.rules) ? (
        <section className="jd-card">
          <h3>Prop rules</h3>
          <p className="jd-acct-rules" style={{ marginTop: 8 }}>
            {formatPropRules(account.rules)}
          </p>
        </section>
      ) : null}

      {trade.plan && (
        <section className="jd-card">
          <h3>Plan</h3>
          <p className="jd-muted" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{trade.plan}</p>
        </section>
      )}
      {trade.review && (
        <section className="jd-card">
          <h3>Review</h3>
          <p className="jd-muted" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{trade.review}</p>
        </section>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="jd-dl-row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
