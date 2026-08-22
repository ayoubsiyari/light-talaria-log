import { useEffect, useState, type FormEvent } from 'react';
import {
  ACCOUNT_KINDS,
  LOGBOOK_PLATFORMS,
  emptyPropRules,
  kindLabel,
  propProgress,
  propRuleChips,
  type LogbookAccount,
  type LogbookAccountKind,
  type LogbookPropRules,
  type LogbookTrade,
} from '@/logbook';
import { LogbookSheet } from './LogbookSheet';

interface AccountsPanelProps {
  accounts: LogbookAccount[];
  trades: LogbookTrade[];
  onSave: (input: {
    id?: string;
    name: string;
    kind: LogbookAccountKind;
    platform: string;
    firm: string | null;
    balance: number | null;
    onHome: boolean;
    rules: LogbookPropRules | null;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onPin: (id: string, onHome: boolean) => Promise<void>;
}

interface FormState {
  id?: string;
  name: string;
  kind: LogbookAccountKind;
  platform: string;
  firm: string;
  balance: string;
  onHome: boolean;
  rules: LogbookPropRules;
}

function blank(): FormState {
  return {
    name: '',
    kind: 'prop',
    platform: 'MT5',
    firm: '',
    balance: '',
    onHome: true,
    rules: emptyPropRules(),
  };
}

function fromAccount(a: LogbookAccount): FormState {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    platform: a.platform,
    firm: a.firm ?? '',
    balance: a.balance != null ? String(a.balance) : '',
    onHome: a.onHome,
    rules: a.rules ?? emptyPropRules(),
  };
}

function parseBalance(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

function formatBalance(n: number, compact = false): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n);
}

export function AccountsPanel({ accounts, trades, onSave, onRemove, onPin }: AccountsPanelProps) {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const editing = Boolean(form?.id);

  useEffect(() => {
    if (!openId) return;
    const onPointer = (e: PointerEvent) => {
      const node = e.target;
      if (!(node instanceof Node)) return;
      const el = node instanceof Element ? node : node.parentElement;
      if (el?.closest('.jd-acct-tile')) return;
      setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [openId]);

  const closeForm = () => {
    setForm(null);
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setError('Name the account.');
      return;
    }
    setError(null);
    void onSave({
      id: form.id,
      name,
      kind: form.kind,
      platform: form.platform.trim() || 'Other',
      firm: form.kind === 'prop' ? form.firm.trim() || name : form.firm.trim() || null,
      balance: parseBalance(form.balance),
      onHome: form.onHome,
      rules: form.kind === 'prop' ? form.rules : null,
    }).then(() => closeForm());
  };

  return (
    <div className="jd-acct">
      <div className="jd-acct-head">
        <div className="min-w-0">
          <h2>Accounts</h2>
          <p className="jd-muted">
            Pin a desk to put it on Home. Tap the plate for the full rule set.
          </p>
        </div>
        <button
          type="button"
          className="jd-btn jd-btn-ink"
          onClick={() => {
            setForm(blank());
            setError(null);
          }}
        >
          <PlusMark />
          Add
        </button>
      </div>

      {accounts.length === 0 ? (
        <button
          type="button"
          className="jd-acct-empty"
          onClick={() => {
            setForm(blank());
            setError(null);
          }}
        >
          <PlusMark />
          <span>Add a desk</span>
        </button>
      ) : (
        <ul className="jd-acct-board">
          {accounts.map((a) => {
            const tickets = trades.filter((t) => t.accountId === a.id).length;
            const open = openId === a.id;
            return (
              <li key={a.id}>
                <article
                  className="jd-acct-tile"
                  data-open={open ? '1' : '0'}
                  data-home={a.onHome ? '1' : '0'}
                  onClick={() => setOpenId(a.id)}
                >
                  <div className="jd-acct-bar">
                    <h3 className="jd-acct-face-name">{a.name}</h3>
                    <button
                      type="button"
                      className="jd-acct-pin"
                      data-on={a.onHome ? '1' : '0'}
                      aria-pressed={a.onHome}
                      aria-label={a.onHome ? `Hide ${a.name} on Home` : `Show ${a.name} on Home`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onPin(a.id, !a.onHome);
                      }}
                    >
                      <HomeMark />
                      Home
                    </button>
                  </div>
                  <button
                    type="button"
                    className="jd-acct-face"
                    aria-expanded={open}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenId(a.id);
                    }}
                  >
                    <div className="jd-acct-face-pills">
                      <span className={`jd-desks-pill is-${a.kind}`}>{kindLabel(a.kind)}</span>
                      <span className="jd-desks-pill is-plat">{a.platform}</span>
                    </div>
                    <FaceStats account={a} tickets={tickets} trades={trades} />
                  </button>
                  {open ? (
                    <div className="jd-acct-more">
                      <AccountFull account={a} trades={trades} />
                      <div className="jd-acct-more-actions">
                        <button
                          type="button"
                          className="jd-btn jd-btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm(fromAccount(a));
                            setError(null);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="jd-btn jd-btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Remove “${a.name}”? Tickets keep the name.`)) {
                              return;
                            }
                            void onRemove(a.id);
                            if (openId === a.id) setOpenId(null);
                            if (form?.id === a.id) closeForm();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {form ? (
        <LogbookSheet title={editing ? 'Edit account' : 'Add account'} onClose={closeForm} wide>
          <form onSubmit={submit} className="jd-acct-form px-6 pb-6">
            <label className="jd-field-label" htmlFor="jd-acct-name">
              Account name
            </label>
            <input
              id="jd-acct-name"
              className="jd-field"
              value={form.name}
              onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
              placeholder="FTMO 100k"
            />
            <div className="jd-period" role="group" aria-label="Account type">
              {ACCOUNT_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  data-on={form.kind === k.id ? '1' : '0'}
                  onClick={() => setForm((f) => (f ? { ...f, kind: k.id } : f))}
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
                  value={form.platform}
                  onChange={(e) => setForm((f) => (f ? { ...f, platform: e.target.value } : f))}
                >
                  {LOGBOOK_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="jd-field-label">Balance USD</span>
                <input
                  className="jd-field tabular-nums"
                  inputMode="decimal"
                  value={form.balance}
                  onChange={(e) => setForm((f) => (f ? { ...f, balance: e.target.value } : f))}
                  placeholder="100000"
                />
              </label>
              {form.kind === 'prop' ? (
                <label>
                  <span className="jd-field-label">Firm</span>
                  <input
                    className="jd-field"
                    value={form.firm}
                    onChange={(e) => setForm((f) => (f ? { ...f, firm: e.target.value } : f))}
                    placeholder="FTMO, FundingPips…"
                  />
                </label>
              ) : null}
            </div>
            <label className="jd-acct-check">
              <input
                type="checkbox"
                checked={form.onHome}
                onChange={(e) => setForm((f) => (f ? { ...f, onHome: e.target.checked } : f))}
              />
              Show on Home
            </label>
            {form.kind === 'prop' ? (
              <RulesFields
                rules={form.rules}
                onChange={(rules) => setForm((f) => (f ? { ...f, rules } : f))}
              />
            ) : null}
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="jd-btn jd-btn-ink">
                {editing ? 'Save account' : 'Add account'}
              </button>
              <button type="button" className="jd-btn jd-btn-ghost" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        </LogbookSheet>
      ) : null}
    </div>
  );
}

function FaceStats({
  account,
  tickets,
  trades,
}: {
  account: LogbookAccount;
  tickets: number;
  trades: LogbookTrade[];
}) {
  const prog = propProgress(account, trades);
  const risk = account.rules?.maxRiskPct;
  const third =
    prog != null
      ? { value: `${Math.round(prog.pct * 100)}%`, label: 'Target' }
      : risk != null
        ? { value: `${risk}%`, label: 'Risk' }
        : account.kind === 'demo'
          ? { value: 'Demo', label: 'Kind' }
          : { value: kindLabel(account.kind), label: 'Kind' };
  const fill = prog != null ? Math.max(0, Math.min(1, prog.pct)) : 0;
  return (
    <>
      <div className="jd-acct-face-stats">
        <span>
          <b>{account.balance != null ? formatBalance(account.balance, true) : '—'}</b>
          <i>Size</i>
        </span>
        <span>
          <b className="tabular-nums">{tickets}</b>
          <i>Trades</i>
        </span>
        <span>
          <b className={prog != null && prog.pct < 0 ? 'is-down' : undefined}>{third.value}</b>
          <i>{third.label}</i>
        </span>
      </div>
      {prog ? (
        <div
          className="jd-acct-prog"
          data-down={prog.pct < 0 ? '1' : '0'}
          aria-label={`${Math.round(prog.pct * 100)}% of profit target`}
        >
          <i style={{ width: `${fill * 100}%` }} />
        </div>
      ) : null}
    </>
  );
}

function AccountFull({ account, trades }: { account: LogbookAccount; trades: LogbookTrade[] }) {
  const chips = account.kind === 'prop' ? propRuleChips(account.rules) : [];
  const notes = account.rules?.notes.trim() ?? '';
  const prog = propProgress(account, trades);
  return (
    <div className="jd-acct-full">
      {account.balance != null ? (
        <p>
          <span className="jd-muted">Size</span> {formatBalance(account.balance)}
        </p>
      ) : (
        <p className="jd-muted">Add a balance to size tickets against this desk.</p>
      )}
      {prog ? (
        <p>
          <span className="jd-muted">Target</span>{' '}
          {Math.round(prog.pct * 100)}% · {formatBalance(prog.net)} of {formatBalance(prog.target)}
        </p>
      ) : account.kind === 'prop' && (account.balance == null || account.rules?.profitTargetPct == null) ? (
        <p className="jd-muted">Add a size and a profit target % to track progress.</p>
      ) : null}
      {account.firm ? (
        <p>
          <span className="jd-muted">Firm</span> {account.firm}
        </p>
      ) : null}
      {chips.length > 0 ? (
        <div className="jd-desks-chips">
          {chips.map((c) => (
            <span key={c.id} className="jd-desks-chip">
              <b>{c.value}</b>
              <i>{c.label}</i>
            </span>
          ))}
        </div>
      ) : account.kind === 'prop' ? (
        <p className="jd-muted">No prop limits on this desk yet.</p>
      ) : (
        <p className="jd-muted">
          {kindLabel(account.kind)} on {account.platform}. Tickets on this desk use its balance
          to size.
        </p>
      )}
      {notes ? <p className="jd-acct-notes">{notes}</p> : null}
    </div>
  );
}

function RulesFields({
  rules,
  onChange,
}: {
  rules: LogbookPropRules;
  onChange: (next: LogbookPropRules) => void;
}) {
  const set = (patch: Partial<LogbookPropRules>) => onChange({ ...rules, ...patch });
  return (
    <div className="jd-acct-rules-form">
      <div className="jd-acct-grid">
        <PctField label="Daily loss %" value={rules.dailyLossPct} onChange={(n) => set({ dailyLossPct: n })} />
        <PctField label="Max drawdown %" value={rules.maxLossPct} onChange={(n) => set({ maxLossPct: n })} />
        <PctField label="Profit target %" value={rules.profitTargetPct} onChange={(n) => set({ profitTargetPct: n })} />
        <PctField label="Risk / trade %" value={rules.maxRiskPct} onChange={(n) => set({ maxRiskPct: n })} />
        <label>
          <span className="jd-field-label">Min days</span>
          <input
            className="jd-field tabular-nums"
            inputMode="numeric"
            value={rules.minTradingDays ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ minTradingDays: e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : null });
            }}
            placeholder="4"
          />
        </label>
      </div>
      <div className="jd-acct-toggles">
        <Tri label="News" value={rules.newsTrading} onChange={(v) => set({ newsTrading: v })} />
        <Tri label="Weekend" value={rules.weekendHold} onChange={(v) => set({ weekendHold: v })} />
      </div>
      <label>
        <span className="jd-field-label">Other rules</span>
        <textarea
          className="jd-field"
          rows={2}
          value={rules.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Consistency, lot cap, no holding red news…"
        />
      </label>
    </div>
  );
}

function PctField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <label>
      <span className="jd-field-label">{label}</span>
      <input
        className="jd-field tabular-nums"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : null);
        }}
        placeholder="—"
      />
    </label>
  );
}

function Tri({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div>
      <span className="jd-field-label">{label}</span>
      <div className="jd-period" role="group" aria-label={label}>
        <button type="button" data-on={value == null ? '1' : '0'} onClick={() => onChange(null)}>
          —
        </button>
        <button type="button" data-on={value === false ? '1' : '0'} onClick={() => onChange(false)}>
          No
        </button>
        <button type="button" data-on={value === true ? '1' : '0'} onClick={() => onChange(true)}>
          Yes
        </button>
      </div>
    </div>
  );
}

function HomeMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.2 6.2 7 2.4l4.8 3.8V12a.8.8 0 0 1-.8.8H3a.8.8 0 0 1-.8-.8V6.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 3.6v10.8M3.6 9h10.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
