/**
 * Journal trading desks — prop / live / demo + the platform they run on.
 */
import type {
  LogbookAccount,
  LogbookAccountKind,
  LogbookPropRules,
  LogbookTrade,
} from './types';

export const ACCOUNT_KINDS: readonly { id: LogbookAccountKind; label: string }[] = [
  { id: 'prop', label: 'Prop' },
  { id: 'live', label: 'Live' },
  { id: 'demo', label: 'Demo' },
];

export const LOGBOOK_PLATFORMS = [
  'MT5',
  'MT4',
  'cTrader',
  'TradingView',
  'NinjaTrader',
  'Tradovate',
  'MatchTrader',
  'DXTrade',
  'TradeLocker',
  'ProjectX',
  'Sierra Chart',
  'Thinkorswim',
  'Interactive Brokers',
  'Other',
] as const;

export function emptyPropRules(): LogbookPropRules {
  return {
    dailyLossPct: null,
    maxLossPct: null,
    profitTargetPct: null,
    maxRiskPct: null,
    minTradingDays: null,
    newsTrading: null,
    weekendHold: null,
    notes: '',
  };
}

export function kindLabel(kind: LogbookAccountKind | null | undefined): string {
  if (kind === 'prop') return 'Prop';
  if (kind === 'live') return 'Live';
  if (kind === 'demo') return 'Demo';
  return '—';
}

export function accountLine(account: Pick<LogbookAccount, 'name' | 'kind' | 'platform'>): string {
  return `${account.name} · ${kindLabel(account.kind)} · ${account.platform}`;
}

export function tradeDeskLine(
  t: Pick<LogbookTrade, 'accountName' | 'accountKind' | 'platform'>,
): string {
  const name = t.accountName?.trim();
  if (!name) return '—';
  const bits = [name, kindLabel(t.accountKind)];
  if (t.platform?.trim()) bits.push(t.platform.trim());
  return bits.filter((b) => b && b !== '—').join(' · ');
}

function asPct(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function asBool(n: unknown): boolean | null {
  return typeof n === 'boolean' ? n : null;
}

export function normalizePropRules(raw: unknown): LogbookPropRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<LogbookPropRules>;
  const notes = typeof r.notes === 'string' ? r.notes.trim() : '';
  const next: LogbookPropRules = {
    dailyLossPct: asPct(r.dailyLossPct),
    maxLossPct: asPct(r.maxLossPct),
    profitTargetPct: asPct(r.profitTargetPct),
    maxRiskPct: asPct(r.maxRiskPct),
    minTradingDays:
      typeof r.minTradingDays === 'number' && Number.isFinite(r.minTradingDays) && r.minTradingDays > 0
        ? Math.round(r.minTradingDays)
        : null,
    newsTrading: asBool(r.newsTrading),
    weekendHold: asBool(r.weekendHold),
    notes,
  };
  const has =
    next.dailyLossPct != null ||
    next.maxLossPct != null ||
    next.profitTargetPct != null ||
    next.maxRiskPct != null ||
    next.minTradingDays != null ||
    next.newsTrading != null ||
    next.weekendHold != null ||
    next.notes.length > 0;
  return has ? next : null;
}

export function normalizeAccount(raw: unknown): LogbookAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Partial<LogbookAccount>;
  if (typeof a.id !== 'string' || !a.id.trim()) return null;
  if (typeof a.name !== 'string' || !a.name.trim()) return null;
  if (a.kind !== 'prop' && a.kind !== 'live' && a.kind !== 'demo') return null;
  const platform =
    typeof a.platform === 'string' && a.platform.trim() ? a.platform.trim() : 'Other';
  const now = Date.now();
  return {
    id: a.id.trim(),
    name: a.name.trim(),
    kind: a.kind,
    platform,
    firm: typeof a.firm === 'string' && a.firm.trim() ? a.firm.trim() : null,
    balance:
      typeof a.balance === 'number' && Number.isFinite(a.balance) && a.balance > 0
        ? a.balance
        : null,
    onHome: typeof a.onHome === 'boolean' ? a.onHome : true,
    rules: a.kind === 'prop' ? normalizePropRules(a.rules) : null,
    createdAt: typeof a.createdAt === 'number' && Number.isFinite(a.createdAt) ? a.createdAt : now,
    updatedAt: typeof a.updatedAt === 'number' && Number.isFinite(a.updatedAt) ? a.updatedAt : now,
  };
}

export interface PropRuleChip {
  id: string;
  label: string;
  value: string;
}

export function propRuleChips(rules: LogbookPropRules | null | undefined): PropRuleChip[] {
  if (!rules) return [];
  const out: PropRuleChip[] = [];
  if (rules.dailyLossPct != null) out.push({ id: 'daily', label: 'Daily', value: `${rules.dailyLossPct}%` });
  if (rules.maxLossPct != null) out.push({ id: 'dd', label: 'Max DD', value: `${rules.maxLossPct}%` });
  if (rules.profitTargetPct != null) {
    out.push({ id: 'target', label: 'Target', value: `${rules.profitTargetPct}%` });
  }
  if (rules.maxRiskPct != null) out.push({ id: 'risk', label: 'Risk', value: `${rules.maxRiskPct}%` });
  if (rules.minTradingDays != null) {
    out.push({ id: 'days', label: 'Min days', value: String(rules.minTradingDays) });
  }
  if (rules.newsTrading === false) out.push({ id: 'news', label: 'News', value: 'No' });
  if (rules.newsTrading === true) out.push({ id: 'news', label: 'News', value: 'Yes' });
  if (rules.weekendHold === false) out.push({ id: 'wknd', label: 'Weekend', value: 'Flat' });
  if (rules.weekendHold === true) out.push({ id: 'wknd', label: 'Weekend', value: 'Ok' });
  return out;
}

export function formatPropRules(rules: LogbookPropRules | null | undefined): string {
  const chips = propRuleChips(rules);
  const bits = chips.map((c) => `${c.label} ${c.value}`);
  const notes = rules?.notes.trim();
  if (notes) bits.push(notes);
  return bits.join(' · ');
}

export function snapshotFromAccount(account: LogbookAccount): {
  accountId: string;
  accountName: string;
  accountKind: LogbookAccountKind;
  platform: string;
} {
  return {
    accountId: account.id,
    accountName: account.name,
    accountKind: account.kind,
    platform: account.platform,
  };
}

export function tradeBelongsToDesk(
  trade: Pick<LogbookTrade, 'accountId' | 'accountName'>,
  account: Pick<LogbookAccount, 'id' | 'name'>,
): boolean {
  if (trade.accountId) return trade.accountId === account.id;
  return Boolean(trade.accountName && trade.accountName === account.name);
}

export function tradesOnDesk(
  trades: readonly LogbookTrade[],
  account: Pick<LogbookAccount, 'id' | 'name'>,
): LogbookTrade[] {
  return trades.filter((t) => tradeBelongsToDesk(t, account));
}

function isOrphanTrade(trade: Pick<LogbookTrade, 'accountId' | 'accountName'>): boolean {
  return !trade.accountId && !trade.accountName;
}

/** Tickets on this desk. An untagged book counts on the desk when nothing is assigned yet. */
export function deskBook(
  account: Pick<LogbookAccount, 'id' | 'name'>,
  trades: readonly LogbookTrade[],
): LogbookTrade[] {
  const tagged = tradesOnDesk(trades, account);
  if (tagged.length > 0) return tagged;
  if (trades.some((t) => t.accountId || t.accountName)) return [];
  return [...trades];
}

export function deskNetPnl(
  trades: readonly LogbookTrade[],
  accountId: string,
): number {
  let sum = 0;
  for (const t of trades) {
    if (t.accountId !== accountId || t.status !== 'closed') continue;
    if (t.netPnl != null && Number.isFinite(t.netPnl)) sum += t.netPnl;
  }
  return sum;
}

export interface PropProgress {
  net: number;
  target: number;
  pct: number;
  equity: number;
}

/** Closed P&L vs the prop profit target. Null if size or target is missing. */
export function propProgress(
  account: LogbookAccount,
  trades: readonly LogbookTrade[],
): PropProgress | null {
  if (account.kind !== 'prop') return null;
  if (account.balance == null || account.balance <= 0) return null;
  const targetPct = account.rules?.profitTargetPct;
  if (targetPct == null || targetPct <= 0) return null;
  const net = deskNetPnl(trades, account.id);
  const target = account.balance * (targetPct / 100);
  return {
    net,
    target,
    pct: net / target,
    equity: account.balance + net,
  };
}

export function deskSizing(account: LogbookAccount): {
  equity: number;
  riskPct: number;
  cap: number;
} | null {
  if (account.balance == null || account.balance <= 0) return null;
  const riskPct = account.rules?.maxRiskPct ?? (account.kind === 'prop' ? 1 : 1);
  return {
    equity: account.balance,
    riskPct,
    cap: account.balance * (riskPct / 100),
  };
}

export function homeDesks(accounts: readonly LogbookAccount[]): LogbookAccount[] {
  return accounts.filter((a) => a.onHome);
}

/** Desk with the strongest closed P&L. Untagged books use the Home pin. */
export function bestAccount(
  accounts: readonly LogbookAccount[],
  trades: readonly LogbookTrade[],
): LogbookAccount | null {
  if (accounts.length === 0) return null;
  let best: LogbookAccount | null = null;
  let bestNet = -Infinity;
  let bestClosed = -1;
  for (const a of accounts) {
    const book = deskBook(a, trades);
    let net = 0;
    let closed = 0;
    for (const t of book) {
      if (t.status !== 'closed') continue;
      closed += 1;
      if (t.netPnl != null && Number.isFinite(t.netPnl)) net += t.netPnl;
    }
    if (closed === 0) continue;
    const pinnedWin = Boolean(a.onHome && best != null && !best.onHome);
    if (
      net > bestNet ||
      (net === bestNet && closed > bestClosed) ||
      (net === bestNet && closed === bestClosed && pinnedWin)
    ) {
      best = a;
      bestNet = net;
      bestClosed = closed;
    }
  }
  if (best) return best;
  if (trades.some((t) => t.status === 'closed' && isOrphanTrade(t))) {
    return homeDesks(accounts)[0] ?? accounts[0] ?? null;
  }
  return null;
}

/** Fill size / Home pin on untouched sample desks without overwriting edits. */
export function fillMissingDeskFields(
  current: readonly LogbookAccount[],
  sample: readonly LogbookAccount[],
): LogbookAccount[] | null {
  const sampleById = new Map(sample.map((s) => [s.id, s]));
  let changed = false;
  const next = current.map((cur) => {
    const s = sampleById.get(cur.id);
    if (!s) return cur;
    let out = cur;
    if (cur.balance == null && s.balance != null) {
      out = { ...out, balance: s.balance };
      changed = true;
    }
    if (cur.balance == null && s.onHome === false && cur.onHome) {
      out = { ...out, onHome: false };
      changed = true;
    }
    return out;
  });
  return changed ? next : null;
}

export function parseAccountKind(raw: string): LogbookAccountKind | null {
  const k = raw.trim().toLowerCase();
  if (k === 'prop' || k === 'live' || k === 'demo') return k;
  return null;
}
