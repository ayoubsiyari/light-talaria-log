import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  computePlannedR,
  computeRMultiple,
  validateDraft,
} from '@/logbook/compute';
import type { LogbookDraft, LogbookSide, LogbookTrade } from '@/logbook/types';
import { TRADE_EMOTIONS, TRADE_GRADES } from '@/logbook/types';
import {
  logbookDistance,
  logbookGrossPnl,
  logbookRiskAccount,
  pipValueUsd,
  sizeUnit,
} from '@/logbook/instrumentCalc';
import { TickerSelect } from './TickerSelect';
import { AccountPicker, DeskRiskNote } from './AccountPicker';
import {
  FIELD,
  formatMoney,
  formatR,
  formatWhen,
  localInputToUnix,
  unixToLocalInput,
} from './format';
import { snapshotFromAccount } from '@/logbook/accounts';
import { readScopedOrLegacy, writeScoped } from '@/sync/storageScope';
import type { LogbookAccount, LogbookAccountKind, LogbookPropRules } from '@/logbook/types';

export type TradeSaveOpts = { addSetup?: boolean };

const LAST_ACCOUNT_KEY = 'desk.account.last';

interface TradeFormProps {
  initial?: LogbookTrade | null;
  setups: string[];
  accounts: LogbookAccount[];
  preset?: { symbol: string; size: number } | null;
  onCancel: () => void;
  onSave: (draft: LogbookDraft, opts?: TradeSaveOpts) => Promise<void>;
  onCreateAccount: (input: {
    name: string;
    kind: LogbookAccountKind;
    platform: string;
    firm: string | null;
    balance: number | null;
    rules: LogbookPropRules | null;
  }) => Promise<LogbookAccount>;
  onOpenCalculator?: (seed?: {
    symbol?: string;
    entry?: number;
    stop?: number;
    accountId?: string;
  }) => void;
}

type WizardStep = 'ticket' | 'risk' | 'result' | 'notes' | 'review';
type PnlMode = 'broker' | 'compute';
type RMode = 'skip' | 'stop' | 'manual';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'ticket', label: 'Ticket' },
  { id: 'risk', label: 'Risk' },
  { id: 'result', label: 'Result' },
  { id: 'notes', label: 'Notes' },
  { id: 'review', label: 'Save' },
];

function emptyDraft(): LogbookDraft {
  return {
    symbol: '',
    side: 'long',
    openTime: Math.floor(Date.now() / 1000),
    closeTime: null,
    entryPrice: 0,
    exitPrice: null,
    size: 0,
    stopPrice: null,
    targetPrice: null,
    commission: 0,
    netPnl: null,
    rMultiple: null,
    pnlOverride: true,
    rOverride: true,
    setup: null,
    tags: [],
    grade: null,
    emotion: null,
    rulesFollowed: null,
    plan: '',
    review: '',
    accountId: null,
    accountName: null,
    accountKind: null,
    platform: null,
  };
}

function fromTrade(t: LogbookTrade): LogbookDraft {
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    openTime: t.openTime,
    closeTime: t.closeTime,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    size: t.size,
    stopPrice: t.stopPrice,
    targetPrice: t.targetPrice,
    commission: t.commission,
    netPnl: t.netPnl,
    rMultiple: t.rMultiple,
    pnlOverride: true,
    rOverride: t.rMultiple != null,
    setup: t.setup,
    tags: t.tags,
    grade: t.grade,
    emotion: t.emotion,
    rulesFollowed: t.rulesFollowed,
    plan: t.plan,
    review: t.review,
    accountId: t.accountId,
    accountName: t.accountName,
    accountKind: t.accountKind,
    platform: t.platform,
  };
}

export function TradeForm({
  initial,
  setups,
  accounts,
  preset = null,
  onCancel: _onCancel,
  onSave,
  onCreateAccount,
  onOpenCalculator,
}: TradeFormProps) {
  const [draft, setDraft] = useState<LogbookDraft>(() => {
    const base = initial ? fromTrade(initial) : emptyDraft();
    if (!initial) {
      const lastId = readScopedOrLegacy(LAST_ACCOUNT_KEY, []);
      const last = (lastId && accounts.find((a) => a.id === lastId)) || accounts[0] || null;
      if (last) Object.assign(base, snapshotFromAccount(last));
    }
    if (!initial && preset) {
      return { ...base, symbol: preset.symbol, size: preset.size };
    }
    return base;
  });
  const [step, setStep] = useState<WizardStep>('ticket');
  const [tagText, setTagText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stillOpen, setStillOpen] = useState(
    initial ? initial.status === 'open' : true,
  );
  const [pnlMode, setPnlMode] = useState<PnlMode>('broker');
  const [rMode, setRMode] = useState<RMode>(() =>
    initial?.rMultiple != null ? 'manual' : initial?.stopPrice != null ? 'stop' : 'skip',
  );
  const [addSetup, setAddSetup] = useState(false);

  useEffect(() => {
    if (!preset) return;
    setDraft((d) => ({ ...d, symbol: preset.symbol, size: preset.size }));
  }, [preset]);

  const set = <K extends keyof LogbookDraft>(key: K, value: LogbookDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const pickAccount = (account: LogbookAccount) => {
    setDraft((d) => ({ ...d, ...snapshotFromAccount(account) }));
    try {
      writeScoped(LAST_ACCOUNT_KEY, account.id);
    } catch {
      /* ignore */
    }
  };

  const computed = useMemo(() => {
    const r = computeRMultiple(
      draft.side,
      draft.entryPrice,
      draft.exitPrice ?? draft.entryPrice,
      draft.stopPrice,
    );
    const planned = computePlannedR(
      draft.side,
      draft.entryPrice,
      draft.stopPrice,
      draft.targetPrice,
    );
    const pnl =
      stillOpen || draft.exitPrice == null || draft.entryPrice <= 0 || draft.size <= 0
        ? null
        : logbookGrossPnl(
            draft.symbol,
            draft.side,
            draft.entryPrice,
            draft.exitPrice,
            draft.size,
            draft.commission,
          );
    const stopDist = logbookDistance(draft.symbol, draft.entryPrice, draft.stopPrice);
    const exitDist = logbookDistance(draft.symbol, draft.entryPrice, draft.exitPrice);
    const risk$ = logbookRiskAccount(
      draft.symbol,
      draft.entryPrice,
      draft.stopPrice,
      draft.size,
    );
    const pip$ = pipValueUsd(draft.symbol, draft.size, draft.entryPrice);
    return { pnl, r, planned, stopDist, exitDist, risk$, pip$ };
  }, [draft, stillOpen]);

  const builtDraft = (): LogbookDraft => ({
    ...draft,
    closeTime: stillOpen ? null : draft.closeTime,
    exitPrice: stillOpen ? null : draft.exitPrice,
    netPnl: stillOpen ? null : pnlMode === 'broker' ? draft.netPnl : null,
    rMultiple:
      stillOpen || rMode === 'skip'
        ? null
        : rMode === 'manual'
          ? draft.rMultiple
          : null,
    pnlOverride: stillOpen ? false : pnlMode === 'broker',
    rOverride: stillOpen ? false : rMode !== 'stop',
    commission: draft.commission || 0,
  });

  const stepError = (id: WizardStep): string | null => {
    if (id === 'ticket') {
      if (!draft.accountId && !draft.accountName) return 'Pick the account you traded.';
      if (!draft.symbol.trim()) return 'Choose a ticker.';
      if (!(draft.entryPrice > 0)) return 'Set the entry price.';
      if (!(draft.size > 0)) return 'Set the size.';
      if (!(draft.openTime > 0)) return 'Set the open time.';
      return null;
    }
    if (id === 'risk') {
      if (draft.stopPrice != null && !(draft.stopPrice > 0)) return 'Stop must be greater than zero, or leave it blank.';
      if (draft.targetPrice != null && !(draft.targetPrice > 0)) {
        return 'Target must be greater than zero, or leave it blank.';
      }
      if (draft.commission < 0) return 'Commission cannot be negative.';
      return null;
    }
    if (id === 'result') {
      if (stillOpen) return null;
      if (draft.exitPrice == null || !(draft.exitPrice > 0)) return 'Closed trades need an exit price.';
      if (draft.closeTime == null) return 'Closed trades need a close time.';
      if (draft.closeTime < draft.openTime) return 'Close time cannot be before open time.';
      if (pnlMode === 'broker' && draft.netPnl == null) {
        return 'Enter the P&L from your broker, or switch to compute.';
      }
      if (rMode === 'manual' && draft.rMultiple == null) {
        return 'Enter R, or choose skip / from stop.';
      }
      return null;
    }
    return validateDraft(builtDraft());
  };

  const goStep = (next: WizardStep) => {
    setError(null);
    setStep(next);
  };

  const continueFrom = (current: WizardStep) => {
    const err = stepError(current);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    const i = STEPS.findIndex((s) => s.id === current);
    const next = STEPS[i + 1];
    if (next) setStep(next.id);
  };

  const addTag = () => {
    const t = tagText.trim().toLowerCase();
    if (!t) return;
    if (!draft.tags.includes(t)) set('tags', [...draft.tags, t]);
    setTagText('');
  };

  const commit = (next: LogbookDraft) => {
    const err = validateDraft(next);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(true);
    void onSave(next, { addSetup: addSetup && !!next.setup })
      .catch((ex: unknown) => {
        setError(ex instanceof Error ? ex.message : 'Could not save trade.');
      })
      .finally(() => setBusy(false));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step !== 'review') {
      continueFrom(step);
      return;
    }
    commit(builtDraft());
  };

  const saveTicket = () => {
    const err = stepError('ticket');
    if (err) {
      setError(err);
      return;
    }
    commit(builtDraft());
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="px-6 pb-2 space-y-6">
        <nav aria-label="Steps" className="jd-wiz-steps">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const done = i < stepIndex;
            return (
              <button
                key={s.id}
                type="button"
                data-on={active ? '1' : '0'}
                data-done={done ? '1' : '0'}
                onClick={() => goStep(s.id)}
              >
                {s.label}
              </button>
            );
          })}
        </nav>

        {step === 'ticket' && (
          <section className="space-y-5">
            <Field label="Account" required>
              <AccountPicker
                accounts={accounts}
                valueId={draft.accountId}
                risk$={computed.risk$}
                onPick={pickAccount}
                onCreate={onCreateAccount}
              />
            </Field>
            <Field label="Ticker" required>
              <TickerSelect value={draft.symbol} onChange={(id) => set('symbol', id)} />
            </Field>
            <div className="space-y-2">
              <span className="jd-field-label">Side</span>
              <div className="jd-period jd-side" role="group" aria-label="Side">
                {(['long', 'short'] as LogbookSide[]).map((side) => (
                  <button
                    key={side}
                    type="button"
                    data-on={draft.side === side ? '1' : '0'}
                    data-side={side}
                    onClick={() => set('side', side)}
                  >
                    {side === 'long' ? 'Long' : 'Short'}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Open time" required>
              <input
                type="datetime-local"
                className={FIELD}
                value={unixToLocalInput(draft.openTime)}
                onChange={(e) => {
                  const n = localInputToUnix(e.target.value);
                  if (n != null) set('openTime', n);
                }}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumField
                label="Entry"
                required
                value={draft.entryPrice || null}
                onChange={(n) => set('entryPrice', n ?? 0)}
              />
              <NumField
                label={sizeUnit(draft.symbol)}
                required
                value={draft.size || null}
                onChange={(n) => set('size', n ?? 0)}
              />
            </div>
            {onOpenCalculator && (
              <button
                type="button"
                className="jd-text-btn"
                onClick={() =>
                  onOpenCalculator({
                    symbol: draft.symbol || undefined,
                    entry: draft.entryPrice > 0 ? draft.entryPrice : undefined,
                    stop: draft.stopPrice ?? undefined,
                    accountId: draft.accountId ?? undefined,
                  })
                }
              >
                Size with calculator
              </button>
            )}
          </section>
        )}

        {step === 'risk' && (
          <section className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumField
                label="Stop"
                value={draft.stopPrice}
                onChange={(n) => set('stopPrice', n)}
                optional
              />
              <NumField
                label="Target"
                value={draft.targetPrice}
                onChange={(n) => set('targetPrice', n)}
                optional
              />
              <NumField
                label="Commission"
                value={draft.commission || null}
                onChange={(n) => set('commission', n ?? 0)}
                optional
              />
            </div>
            {(() => {
              const desk = accounts.find((a) => a.id === draft.accountId) ?? null;
              return desk ? <DeskRiskNote account={desk} risk$={computed.risk$} /> : null;
            })()}
            {draft.symbol && (computed.stopDist || computed.risk$ != null) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs jd-muted tabular-nums">
                {computed.stopDist ? (
                  <span>
                    Stop <b className="font-semibold">{computed.stopDist.pips.toFixed(1)} {computed.stopDist.unit}</b>
                  </span>
                ) : null}
                {computed.risk$ != null ? (
                  <span>
                    Risk <b className="font-semibold">{formatMoney(computed.risk$)}</b>
                  </span>
                ) : null}
                {computed.pip$ != null ? (
                  <span>
                    {formatMoney(computed.pip$)}/{computed.stopDist?.unit === 'pts' ? 'pt' : 'pip'}
                  </span>
                ) : null}
                {computed.planned != null ? (
                  <span>Planned {formatR(computed.planned)}</span>
                ) : null}
              </div>
            )}
            {onOpenCalculator && (
              <button
                type="button"
                className="jd-text-btn"
                onClick={() =>
                  onOpenCalculator({
                    symbol: draft.symbol || undefined,
                    entry: draft.entryPrice > 0 ? draft.entryPrice : undefined,
                    stop: draft.stopPrice ?? undefined,
                    accountId: draft.accountId ?? undefined,
                  })
                }
              >
                Size with calculator
              </button>
            )}
          </section>
        )}

        {step === 'result' && (
          <section className="space-y-3">
            <div className="space-y-1.5">
              <span className="jd-field-label">Status</span>
              <div className="jd-period" role="group" aria-label="Status">
                <button
                  type="button"
                  data-on={stillOpen ? '1' : '0'}
                  onClick={() => setStillOpen(true)}
                >
                  Still open
                </button>
                <button
                  type="button"
                  data-on={!stillOpen ? '1' : '0'}
                  onClick={() => setStillOpen(false)}
                >
                  Closed
                </button>
              </div>
            </div>
            {stillOpen ? (
              <p className="text-sm jd-muted max-w-prose">
                Exit, close time, P&L, and R stay empty until you flatten.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Close time" required>
                    <input
                      type="datetime-local"
                      className={FIELD}
                      value={unixToLocalInput(draft.closeTime)}
                      onChange={(e) => set('closeTime', localInputToUnix(e.target.value))}
                    />
                  </Field>
                  <NumField
                    label="Exit"
                    required
                    value={draft.exitPrice}
                    onChange={(n) => set('exitPrice', n)}
                    optional
                  />
                </div>
                <div className="space-y-2">
                  <span className="jd-field-label">P&L</span>
                  <div className="jd-period" role="group" aria-label="P and L source">
                    <button
                      type="button"
                      data-on={pnlMode === 'broker' ? '1' : '0'}
                      onClick={() => setPnlMode('broker')}
                    >
                      Broker
                    </button>
                    <button
                      type="button"
                      data-on={pnlMode === 'compute' ? '1' : '0'}
                      onClick={() => setPnlMode('compute')}
                    >
                      Compute
                    </button>
                  </div>
                  {pnlMode === 'broker' ? (
                    <NumField
                      label="Net P&L"
                      required
                      value={draft.netPnl}
                      onChange={(n) => set('netPnl', n)}
                      optional
                    />
                  ) : (
                    <p className="text-xl font-semibold tabular-nums tracking-tight">
                      {formatMoney(computed.pnl)}
                      {computed.exitDist ? (
                        <span className="text-sm font-medium jd-muted">
                          {' '}
                          {computed.exitDist.pips.toFixed(1)} {computed.exitDist.unit}
                        </span>
                      ) : null}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <span className="jd-field-label">R</span>
                  <div className="jd-period" role="group" aria-label="R multiple">
                    {(
                      [
                        ['skip', 'Skip'],
                        ['stop', 'Stop'],
                        ['manual', 'Enter'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        data-on={rMode === id ? '1' : '0'}
                        onClick={() => setRMode(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {rMode === 'stop' && (
                    <p className="text-sm tabular-nums jd-muted">
                      {computed.r != null ? formatR(computed.r) : 'Set a stop on Risk.'}
                    </p>
                  )}
                  {rMode === 'manual' && (
                    <NumField
                      label="R"
                      required
                      value={draft.rMultiple}
                      onChange={(n) => set('rMultiple', n)}
                      optional
                    />
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {step === 'notes' && (
          <section className="space-y-3">
            <Field label="Plan">
              <textarea
                className={`${FIELD} min-h-24 py-3 font-normal`}
                value={draft.plan}
                onChange={(e) => set('plan', e.target.value)}
                placeholder="What you intended"
              />
            </Field>
            <Field label="Review">
              <textarea
                className={`${FIELD} min-h-24 py-3 font-normal`}
                value={draft.review}
                onChange={(e) => set('review', e.target.value)}
                placeholder="What you did"
              />
            </Field>
            <Field label="Setup">
              <input
                className={FIELD}
                list="logbook-setups"
                value={draft.setup ?? ''}
                onChange={(e) => set('setup', e.target.value || null)}
                placeholder="Playbook name"
              />
              <datalist id="logbook-setups">
                {setups.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            {draft.setup && !setups.some((s) => s.toLowerCase() === draft.setup!.toLowerCase()) && (
              <label className="flex items-center gap-2 min-h-11 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={addSetup}
                  onChange={(e) => setAddSetup(e.target.checked)}
                />
                Save “{draft.setup.trim()}” to the playbook
              </label>
            )}
            <div className="space-y-1.5">
              <span className="jd-field-label">Tags</span>
              <div className="flex flex-wrap gap-2">
                {draft.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="jd-chip-btn"
                    onClick={() => set('tags', draft.tags.filter((x) => x !== tag))}
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className={FIELD}
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add a tag"
                />
                <button
                  type="button"
                  className="jd-btn jd-btn-ghost shrink-0"
                  onClick={addTag}
                >
                  Add
                </button>
              </div>
            </div>
            <ChipRow
              label="Grade"
              values={TRADE_GRADES}
              current={draft.grade}
              onPick={(g) => set('grade', draft.grade === g ? null : g)}
            />
            <ChipRow
              label="Emotion"
              values={TRADE_EMOTIONS}
              current={draft.emotion}
              onPick={(g) => set('emotion', draft.emotion === g ? null : g)}
            />
            <div className="space-y-1.5">
              <span className="jd-field-label">Rules</span>
              <div className="jd-period" role="group" aria-label="Rules followed">
                {[
                  { label: 'Yes', value: true as boolean | null },
                  { label: 'No', value: false },
                  { label: 'Skip', value: null },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    data-on={draft.rulesFollowed === opt.value ? '1' : '0'}
                    onClick={() => set('rulesFollowed', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 'review' && (
          <section>
            <dl className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
              <ReviewRow k="Account" v={draft.accountName?.trim() || '—'} />
              <ReviewRow k="Symbol" v={draft.symbol.trim().toUpperCase() || '—'} />
              <ReviewRow k="Side" v={draft.side} />
              <ReviewRow k="Open" v={formatWhen(draft.openTime)} />
              <ReviewRow
                k="Close"
                v={stillOpen ? 'Still open' : draft.closeTime ? formatWhen(draft.closeTime) : '—'}
              />
              <ReviewRow k="Entry" v={draft.entryPrice > 0 ? String(draft.entryPrice) : '—'} />
              <ReviewRow k="Exit" v={stillOpen ? '—' : draft.exitPrice != null ? String(draft.exitPrice) : '—'} />
              <ReviewRow k="Size" v={draft.size > 0 ? String(draft.size) : '—'} />
              <ReviewRow k="Stop / target" v={`${draft.stopPrice ?? '—'} / ${draft.targetPrice ?? '—'}`} />
              <ReviewRow
                k="P&L"
                v={
                  stillOpen
                    ? '—'
                    : pnlMode === 'broker'
                      ? formatMoney(draft.netPnl)
                      : `${formatMoney(computed.pnl)} (computed)`
                }
              />
              <ReviewRow
                k="R"
                v={
                  stillOpen || rMode === 'skip'
                    ? 'Skipped'
                    : rMode === 'manual'
                      ? formatR(draft.rMultiple)
                      : computed.r != null
                        ? `${formatR(computed.r)} (from stop)`
                        : 'No stop'
                }
              />
              <ReviewRow k="Setup" v={draft.setup?.trim() || '—'} />
              <ReviewRow k="Tags" v={draft.tags.length ? draft.tags.join(', ') : '—'} />
              <ReviewRow k="Grade / emotion" v={`${draft.grade ?? '—'} / ${draft.emotion ?? '—'}`} />
              <ReviewRow
                k="Rules"
                v={
                  draft.rulesFollowed == null
                    ? 'Skipped'
                    : draft.rulesFollowed
                      ? 'Followed'
                      : 'Broke'
                }
              />
            </dl>
            {draft.plan && (
              <p className="mt-4 text-sm max-w-prose">
                <span className="jd-muted">Plan. </span>
                {draft.plan}
              </p>
            )}
            {draft.review && (
              <p className="mt-2 text-sm max-w-prose">
                <span className="jd-muted">Review. </span>
                {draft.review}
              </p>
            )}
          </section>
        )}

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {stepIndex > 0 && (
          <button
            type="button"
            className="min-h-11 px-4 text-sm jd-muted"
            onClick={() => goStep(STEPS[stepIndex - 1]!.id)}
          >
            Back
          </button>
        )}
        {step === 'notes' && (
          <button
            type="button"
            className="min-h-11 px-4 text-sm jd-muted"
            onClick={() => goStep('review')}
          >
            Skip notes
          </button>
        )}
        {step === 'ticket' && (
          <button
            type="button"
            disabled={busy}
            className="jd-btn jd-btn-ghost"
            onClick={saveTicket}
          >
            Save ticket
          </button>
        )}
        {step !== 'review' ? (
          <button
            type="submit"
            className="ml-auto jd-btn jd-btn-ink"
          >
            Continue
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy}
            className="ml-auto jd-btn jd-btn-ink"
          >
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Save trade'}
          </button>
        )}
      </div>
    </form>
  );
}

function FieldLabel({
  children,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return <span className="jd-field-label">{children}</span>;
}

function Field({
  label,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1.5 block min-w-0">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  optional = false,
  required = false,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  optional?: boolean;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1.5 block min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        step="any"
        className={FIELD}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(optional || !required ? null : 0);
            return;
          }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
      />
    </label>
  );
}

function ChipRow<T extends string>({
  label,
  values,
  current,
  onPick,
}: {
  label: string;
  hint?: string;
  values: readonly T[];
  current: T | null;
  onPick: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            data-on={current === v ? '1' : '0'}
            className="jd-chip-btn"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 jd-review-row py-2 text-sm">
      <dt className="jd-muted">{k}</dt>
      <dd className="tabular-nums font-semibold text-right">{v}</dd>
    </div>
  );
}
