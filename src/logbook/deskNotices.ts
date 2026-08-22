/**
 * Short desk checks for Home — standing prop rules plus live weekend / daily-loss.
 * Only says what is on the account or the tape. Never invents a balance.
 */
import { deskSizing, homeDesks } from './accounts';
import type { LogbookAccount, LogbookTrade } from './types';

export type DeskNoticeTone = 'warn' | 'note';

export interface DeskNotice {
  id: string;
  tone: DeskNoticeTone;
  text: string;
  accountId: string | null;
}

const MAX = 4;

function localDayStartSec(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function weekendWatch(nowMs: number): boolean {
  const d = new Date(nowMs);
  const day = d.getDay();
  if (day === 0 || day === 6) return true;
  return day === 5 && d.getHours() >= 12;
}

function watchedDesks(
  accounts: readonly LogbookAccount[],
  trades: readonly LogbookTrade[],
): LogbookAccount[] {
  const openIds = new Set(
    trades.filter((t) => t.status === 'open' && t.accountId).map((t) => t.accountId as string),
  );
  const pinned = new Set(homeDesks(accounts).map((a) => a.id));
  return accounts.filter((a) => pinned.has(a.id) || openIds.has(a.id));
}

function todayNet(trades: readonly LogbookTrade[], accountId: string, nowMs: number): number {
  const start = localDayStartSec(nowMs);
  let sum = 0;
  for (const t of trades) {
    if (t.accountId !== accountId || t.status !== 'closed' || t.closeTime == null) continue;
    if (t.closeTime < start) continue;
    if (t.netPnl != null && Number.isFinite(t.netPnl)) sum += t.netPnl;
  }
  return sum;
}

function standingText(account: LogbookAccount): string | null {
  const r = account.rules;
  const bits: string[] = [];
  if (r?.newsTrading === false) bits.push('no news');
  if (r?.weekendHold === false) bits.push('flat weekend');
  if (r?.maxRiskPct != null) bits.push(`${r.maxRiskPct}% risk`);
  if (r?.dailyLossPct != null) bits.push(`${r.dailyLossPct}% daily`);
  const note = r?.notes.trim();
  if (note) bits.push(note.length > 48 ? `${note.slice(0, 45)}…` : note);
  if (bits.length === 0) {
    if (account.kind === 'prop') return `${account.name} — add limits so this check is real.`;
    return null;
  }
  return `${account.name} — ${bits.join(', ')}.`;
}

export function deskNotices(
  accounts: readonly LogbookAccount[],
  trades: readonly LogbookTrade[],
  nowMs: number = Date.now(),
): DeskNotice[] {
  const out: DeskNotice[] = [];
  const push = (n: DeskNotice) => {
    if (out.length >= MAX) return;
    if (out.some((x) => x.id === n.id)) return;
    out.push(n);
  };

  if (accounts.length === 0) {
    return [
      {
        id: 'no-desk',
        tone: 'note',
        text: 'Add a desk so rules can sit here.',
        accountId: null,
      },
    ];
  }

  const open = trades.filter((t) => t.status === 'open');
  if (open.some((t) => !t.accountId)) {
    push({
      id: 'orphan-open',
      tone: 'warn',
      text: 'An open ticket has no desk — pick one so the size is real.',
      accountId: null,
    });
  }

  const watch = watchedDesks(accounts, trades);
  const weekend = weekendWatch(nowMs);

  for (const a of watch) {
    const openOn = open.filter((t) => t.accountId === a.id);
    if (weekend && a.rules?.weekendHold === false && openOn.length > 0) {
      push({
        id: `wknd-open-${a.id}`,
        tone: 'warn',
        text: `${a.name} is flat for the weekend — ${openOn.length} open.`,
        accountId: a.id,
      });
    }

    const size = deskSizing(a);
    const dailyPct = a.rules?.dailyLossPct;
    if (size && dailyPct != null) {
      const cap = size.equity * (dailyPct / 100);
      const day = todayNet(trades, a.id, nowMs);
      if (day < 0 && Math.abs(day) >= cap) {
        push({
          id: `daily-hit-${a.id}`,
          tone: 'warn',
          text: `${a.name} is through the ${dailyPct}% daily loss.`,
          accountId: a.id,
        });
      } else if (day < 0 && Math.abs(day) >= cap * 0.8) {
        push({
          id: `daily-near-${a.id}`,
          tone: 'warn',
          text: `${a.name} is near the ${dailyPct}% daily loss.`,
          accountId: a.id,
        });
      }
    }
  }

  if (watch.length === 0) {
    push({
      id: 'no-pin',
      tone: 'note',
      text: 'Pin a desk on Accounts to watch its rules here.',
      accountId: null,
    });
    return out;
  }

  for (const a of watch) {
    if (a.kind === 'prop' && a.balance == null) {
      push({
        id: `size-${a.id}`,
        tone: 'note',
        text: `Add a size on ${a.name} to check daily loss.`,
        accountId: a.id,
      });
    }
    const line = standingText(a);
    if (line) {
      push({
        id: `stand-${a.id}`,
        tone: weekend && a.rules?.weekendHold === false ? 'warn' : 'note',
        text: line,
        accountId: a.id,
      });
    }
  }

  return out;
}
