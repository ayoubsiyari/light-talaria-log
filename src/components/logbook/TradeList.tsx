import { findTicker } from '@/logbook/catalog';
import { kindLabel } from '@/logbook/accounts';
import type { LogbookTrade } from '@/logbook/types';
import { formatLedgerWhen, formatMoney, formatR, pnlClass } from './format';

interface TradeListProps {
  trades: LogbookTrade[];
  onOpen: (id: string) => void;
  empty?: string;
}

export function TradeList({
  trades,
  onOpen,
  empty = 'No tickets in the ledger yet.',
}: TradeListProps) {
  if (trades.length === 0) {
    return <p className="jd-ledger-empty">{empty}</p>;
  }

  return (
    <>
      <div className="jd-table-wrap jd-ledger-table">
        <table className="jd-table">
          <thead>
            <tr>
              <th>Side</th>
              <th>Ticker</th>
              <th>Account</th>
              <th>Setup</th>
              <th>Opened</th>
              <th className="jd-num">P&amp;L</th>
              <th className="jd-num">R</th>
              <th className="jd-ledger-detail">Details</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className={t.side === 'long' ? 'text-success' : 'text-danger'}>
                    {t.side === 'long' ? 'Long' : 'Short'}
                  </span>
                </td>
                <td>
                  <span className="jd-name">{tickerLabel(t.symbol)}</span>
                </td>
                <td>
                  <span className="jd-name">{t.accountName || '—'}</span>
                  {t.accountKind || t.platform ? (
                    <span className="jd-meta">
                      {kindLabel(t.accountKind)}
                      {t.platform ? ` · ${t.platform}` : ''}
                    </span>
                  ) : null}
                </td>
                <td>{t.setup || '—'}</td>
                <td className="tabular-nums">{formatLedgerWhen(t.openTime)}</td>
                <td className={`jd-num tabular-nums ${pnlClass(t.netPnl)}`}>
                  {t.status === 'open' ? 'Open' : formatMoney(t.netPnl)}
                </td>
                <td className="jd-num tabular-nums jd-muted">{formatR(t.rMultiple)}</td>
                <td className="jd-ledger-detail">
                  <button type="button" className="jd-ledger-view" onClick={() => onOpen(t.id)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="jd-ledger-cards">
        {trades.map((t) => (
          <li key={t.id}>
            <button type="button" className="jd-ledger-card" onClick={() => onOpen(t.id)}>
              <span className="jd-ledger-card-top">
                <span className="jd-name">{tickerLabel(t.symbol)}</span>
                <span className={t.side === 'long' ? 'text-success' : 'text-danger'}>
                  {t.side === 'long' ? 'Long' : 'Short'}
                </span>
              </span>
              <span className="jd-ledger-card-meta">
                {t.accountName ? `${t.accountName} · ` : ''}
                {t.setup || 'No setup'}
                {' · '}
                {formatLedgerWhen(t.openTime)}
              </span>
              <span className="jd-ledger-card-foot">
                <span className={`tabular-nums ${pnlClass(t.netPnl)}`}>
                  {t.status === 'open' ? 'Open' : formatMoney(t.netPnl)}
                  <span className="jd-muted"> {formatR(t.rMultiple)}</span>
                </span>
                <span className="jd-ledger-view">View</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function tickerLabel(symbol: string): string {
  return findTicker(symbol)?.display ?? symbol;
}
