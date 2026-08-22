import type { LogbookDraft, LogbookSide, LogbookStatus, LogbookTrade } from './types';
import { parseAccountKind } from './accounts';
import { logbookGrossPnl } from './instrumentCalc';

export function signedPriceMove(
  side: LogbookSide,
  entry: number,
  exit: number,
): number {
  return side === 'long' ? exit - entry : entry - exit;
}

export function computeRMultiple(
  side: LogbookSide,
  entry: number,
  exit: number,
  stop: number | null,
): number | null {
  if (stop == null || !Number.isFinite(stop)) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  return signedPriceMove(side, entry, exit) / risk;
}

export function computePlannedR(
  side: LogbookSide,
  entry: number,
  stop: number | null,
  target: number | null,
): number | null {
  if (stop == null || target == null) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  return signedPriceMove(side, entry, target) / risk;
}

export function computeNetPnl(
  side: LogbookSide,
  entry: number,
  exit: number,
  size: number,
  commission: number,
  symbol?: string,
): number {
  if (symbol && symbol.trim()) {
    const computed = logbookGrossPnl(symbol, side, entry, exit, size, commission);
    if (computed != null) return computed;
  }
  return signedPriceMove(side, entry, exit) * size - commission;
}

export function tradeStatus(
  exitPrice: number | null,
  closeTime: number | null,
): LogbookStatus {
  return exitPrice != null && closeTime != null ? 'closed' : 'open';
}

export function isWin(trade: LogbookTrade): boolean | null {
  if (trade.status !== 'closed' || trade.netPnl == null) return null;
  if (trade.netPnl > 0) return true;
  if (trade.netPnl < 0) return false;
  return null;
}

const GRADE_SET = new Set(['A+', 'A', 'B', 'C', 'F']);
const EMOTION_SET = new Set([
  'calm',
  'confident',
  'anxious',
  'fomo',
  'revenge',
  'tilted',
]);

function asFinite(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function asFiniteOrNull(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function draftToTrade(
  draft: LogbookDraft,
  nowMs: number,
  existing?: LogbookTrade | null,
): LogbookTrade {
  const status = tradeStatus(draft.exitPrice, draft.closeTime);
  let netPnl = draft.netPnl;
  let rMultiple = draft.rMultiple;
  if (status === 'closed' && draft.exitPrice != null) {
    if (!draft.pnlOverride) {
      netPnl = computeNetPnl(
        draft.side,
        draft.entryPrice,
        draft.exitPrice,
        draft.size,
        draft.commission,
        draft.symbol,
      );
    }
    if (!draft.rOverride) {
      rMultiple = computeRMultiple(
        draft.side,
        draft.entryPrice,
        draft.exitPrice,
        draft.stopPrice,
      );
    }
  } else {
    if (!draft.pnlOverride) netPnl = null;
    if (!draft.rOverride) rMultiple = null;
  }
  return {
    id: existing?.id ?? draft.id ?? '',
    source: 'manual',
    status,
    symbol: draft.symbol.trim().toUpperCase(),
    side: draft.side,
    openTime: draft.openTime,
    closeTime: status === 'closed' ? draft.closeTime : null,
    entryPrice: draft.entryPrice,
    exitPrice: status === 'closed' ? draft.exitPrice : null,
    size: draft.size,
    stopPrice: draft.stopPrice,
    targetPrice: draft.targetPrice,
    commission: draft.commission,
    netPnl: status === 'closed' ? netPnl : null,
    rMultiple: status === 'closed' ? rMultiple : null,
    setup: draft.setup?.trim() ? draft.setup.trim() : null,
    tags: cleanTags(draft.tags),
    grade: draft.grade,
    emotion: draft.emotion,
    rulesFollowed: draft.rulesFollowed,
    plan: draft.plan.trim(),
    review: draft.review.trim(),
    accountId: draft.accountId?.trim() ? draft.accountId.trim() : null,
    accountName: draft.accountName?.trim() ? draft.accountName.trim() : null,
    accountKind: draft.accountKind,
    platform: draft.platform?.trim() ? draft.platform.trim() : null,
    createdAt: existing?.createdAt ?? nowMs,
    updatedAt: nowMs,
  };
}

export function validateDraft(draft: LogbookDraft): string | null {
  if (!draft.symbol.trim()) return 'Symbol is required.';
  if (!Number.isFinite(draft.entryPrice) || draft.entryPrice <= 0) {
    return 'Entry price must be greater than zero.';
  }
  if (!Number.isFinite(draft.size) || draft.size <= 0) {
    return 'Size must be greater than zero.';
  }
  if (!Number.isFinite(draft.openTime) || draft.openTime <= 0) {
    return 'Open time is required.';
  }
  const closing = draft.exitPrice != null || draft.closeTime != null;
  if (closing) {
    if (draft.exitPrice == null || !Number.isFinite(draft.exitPrice) || draft.exitPrice <= 0) {
      return 'Closed trades need an exit price.';
    }
    if (draft.closeTime == null || draft.closeTime <= 0) {
      return 'Closed trades need a close time.';
    }
    if (draft.closeTime < draft.openTime) {
      return 'Close time cannot be before open time.';
    }
  }
  if (draft.stopPrice != null && !(draft.stopPrice > 0)) {
    return 'Stop must be greater than zero.';
  }
  if (draft.targetPrice != null && !(draft.targetPrice > 0)) {
    return 'Target must be greater than zero.';
  }
  if (draft.commission < 0) return 'Commission cannot be negative.';
  return null;
}

export function normalizeTrade(raw: unknown): LogbookTrade | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<LogbookTrade>;
  if (typeof t.id !== 'string' || !t.id) return null;
  if (typeof t.symbol !== 'string' || !t.symbol.trim()) return null;
  if (t.side !== 'long' && t.side !== 'short') return null;
  const entryPrice = asFinite(t.entryPrice, NaN);
  const size = asFinite(t.size, NaN);
  const openTime = asFinite(t.openTime, NaN);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(size) || size <= 0) return null;
  if (!Number.isFinite(openTime) || openTime <= 0) return null;
  const exitPrice = asFiniteOrNull(t.exitPrice);
  const closeTime = asFiniteOrNull(t.closeTime);
  const status = t.status === 'open' || t.status === 'closed'
    ? t.status
    : tradeStatus(exitPrice, closeTime);
  const grade =
    typeof t.grade === 'string' && GRADE_SET.has(t.grade) ? t.grade : null;
  const emotion =
    typeof t.emotion === 'string' && EMOTION_SET.has(t.emotion)
      ? t.emotion
      : null;
  return {
    id: t.id,
    source: 'manual',
    status: status === 'closed' && exitPrice != null && closeTime != null ? 'closed' : 'open',
    symbol: t.symbol.trim().toUpperCase(),
    side: t.side,
    openTime,
    closeTime: status === 'closed' ? closeTime : null,
    entryPrice,
    exitPrice: status === 'closed' ? exitPrice : null,
    size,
    stopPrice: asFiniteOrNull(t.stopPrice),
    targetPrice: asFiniteOrNull(t.targetPrice),
    commission: Math.max(0, asFinite(t.commission, 0)),
    netPnl: status === 'closed' ? asFiniteOrNull(t.netPnl) : null,
    rMultiple: status === 'closed' ? asFiniteOrNull(t.rMultiple) : null,
    setup: typeof t.setup === 'string' && t.setup.trim() ? t.setup.trim() : null,
    tags: cleanTags(t.tags),
    grade,
    emotion,
    rulesFollowed: typeof t.rulesFollowed === 'boolean' ? t.rulesFollowed : null,
    plan: typeof t.plan === 'string' ? t.plan : '',
    review: typeof t.review === 'string' ? t.review : '',
    accountId: typeof t.accountId === 'string' && t.accountId.trim() ? t.accountId.trim() : null,
    accountName: typeof t.accountName === 'string' && t.accountName.trim() ? t.accountName.trim() : null,
    accountKind: parseAccountKind(typeof t.accountKind === 'string' ? t.accountKind : ''),
    platform: typeof t.platform === 'string' && t.platform.trim() ? t.platform.trim() : null,
    createdAt: asFinite(t.createdAt, Date.now()),
    updatedAt: asFinite(t.updatedAt, Date.now()),
  };
}
