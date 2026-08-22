import { useEffect, useState, type FormEvent } from 'react';
import {
  ACCOUNT_KINDS,
  LOGBOOK_PLATFORMS,
  deskSizing,
  emptyPropRules,
  formatPropRules,
  kindLabel,
  type LogbookAccount,
  type LogbookAccountKind,
  type LogbookPropRules,
} from '@/logbook';
import { formatMoney } from './format';

interface AccountPickerProps {
  accounts: LogbookAccount[];
  valueId: string | null;
  risk$?: number | null;
  onPick: (account: LogbookAccount) => void;
  onCreate: (input: {
    name: string;
    kind: LogbookAccountKind;
    platform: string;
    firm: string | null;
    balance: number | null;
    rules: LogbookPropRules | null;
  }) => Promise<LogbookAccount>;
}

export function AccountPicker({
  accounts,
  valueId,
  risk$ = null,
  onPick,
  onCreate,
}: AccountPickerProps) {
  const selected = accounts.find((a) => a.id === valueId) ?? null;
  const [adding, setAdding] = useState(accounts.length === 0);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LogbookAccountKind>('prop');
  const [platform, setPlatform] = useState('MT5');
  const [balance, setBalance] = useState('');
  const [daily, setDaily] = useState('');
  const [maxDd, setMaxDd] = useState('');
  const [risk, setRisk] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accounts.length === 0) setAdding(true);
  }, [accounts.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name the account.');
      return;
    }
    setError(null);
    const rules: LogbookPropRules | null =
      kind === 'prop'
        ? {
            ...emptyPropRules(),
            dailyLossPct: numOrNull(daily),
            maxLossPct: numOrNull(maxDd),
            maxRiskPct: numOrNull(risk),
          }
        : null;
    void onCreate({
      name: trimmed,
      kind,
      platform,
      firm: kind === 'prop' ? trimmed : null,
      balance: numOrNull(balance),
      rules,
    }).then((account) => {
      onPick(account);
      setAdding(false);
      setName('');
      setBalance('');
      setDaily('');
      setMaxDd('');
      setRisk('');
    });
  };

  return (
    <div className="jd-acct-pick">
      {accounts.length > 0 ? (
        <ul className="jd-acct-choice" role="listbox" aria-label="Account">
          {accounts.map((a) => {
            const on = a.id === valueId;
            const size = deskSizing(a);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-on={on ? '1' : '0'}
                  className="jd-acct-choice-btn"
                  onClick={() => {
                    setAdding(false);
                    onPick(a);
                  }}
                >
                  <span className="jd-acct-choice-name">{a.name}</span>
                  <span className="jd-acct-choice-meta">
                    {kindLabel(a.kind)} · {a.platform}
                    {size ? ` · ${formatUsd(size.equity)}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {selected && !adding ? <DeskRiskNote account={selected} risk$={risk$} /> : null}
      {adding && accounts.length > 0 ? (
        <button type="button" className="jd-text-btn" onClick={() => setAdding(false)}>
          Cancel new account
        </button>
      ) : accounts.length > 0 ? (
        <button type="button" className="jd-text-btn" onClick={() => setAdding(true)}>
          New account
        </button>
      ) : null}
      {adding ? (
        <form onSubmit={submit} className="jd-acct-mini">
          <input
            className="jd-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="FTMO 100k, IC live, demo…"
          />
          <div className="jd-period" role="group" aria-label="Account type">
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                data-on={kind === k.id ? '1' : '0'}
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="jd-acct-grid">
            <label>
              <span className="jd-field-label">Platform</span>
              <select
                className="jd-field"
                value={platform}
                aria-label="Platform"
                onChange={(e) => setPlatform(e.target.value)}
              >
                {LOGBOOK_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <MiniPct label="Balance USD" value={balance} onChange={setBalance} />
          </div>
          {kind === 'prop' ? (
            <div className="jd-acct-grid">
              <MiniPct label="Daily %" value={daily} onChange={setDaily} />
              <MiniPct label="Max DD %" value={maxDd} onChange={setMaxDd} />
              <MiniPct label="Risk %" value={risk} onChange={setRisk} />
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="jd-btn jd-btn-ink">
            Save account
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function DeskRiskNote({
  account,
  risk$ = null,
}: {
  account: LogbookAccount;
  risk$?: number | null;
}) {
  const size = deskSizing(account);
  const over = size != null && risk$ != null && risk$ > size.cap + 0.01;
  return (
    <div className="jd-desk-risk">
      <p>
        Ticket on <b>{account.name}</b>
        {account.kind === 'prop' && formatPropRules(account.rules)
          ? ` · ${formatPropRules(account.rules)}`
          : ` · ${kindLabel(account.kind)} · ${account.platform}`}
      </p>
      {size ? (
        <p className="tabular-nums">
          {formatUsd(size.equity)} · {size.riskPct}% max = {formatMoney(size.cap)} / trade
        </p>
      ) : account.kind === 'prop' && account.rules?.maxRiskPct != null ? (
        <p>Max risk {account.rules.maxRiskPct}% — add a balance on Accounts to size against it.</p>
      ) : null}
      {over && size ? (
        <p className="text-danger" role="alert">
          Risk {formatMoney(risk$)} is over this desk’s {size.riskPct}% cap.
        </p>
      ) : null}
    </div>
  );
}

function MiniPct({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="jd-field-label">{label}</span>
      <input
        className="jd-field tabular-nums"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function numOrNull(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}
