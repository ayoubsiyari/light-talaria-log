import type { LogbookDraft, LogbookSide, LogbookTrade } from './types';
import { TRADE_EMOTIONS, TRADE_GRADES } from './types';
import { parseAccountKind } from './accounts';

const COLS = [
  'id',
  'symbol',
  'side',
  'openTime',
  'closeTime',
  'entryPrice',
  'exitPrice',
  'size',
  'stopPrice',
  'targetPrice',
  'commission',
  'netPnl',
  'rMultiple',
  'setup',
  'tags',
  'grade',
  'emotion',
  'rulesFollowed',
  'plan',
  'review',
  'accountId',
  'accountName',
  'accountKind',
  'platform',
] as const;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cell(v: string | number | null | undefined): string {
  if (v == null) return '';
  return csvEscape(String(v));
}

export function tradesToCsv(trades: readonly LogbookTrade[]): string {
  const lines = [COLS.join(',')];
  for (const t of trades) {
    lines.push(
      [
        cell(t.id),
        cell(t.symbol),
        cell(t.side),
        cell(t.openTime),
        cell(t.closeTime),
        cell(t.entryPrice),
        cell(t.exitPrice),
        cell(t.size),
        cell(t.stopPrice),
        cell(t.targetPrice),
        cell(t.commission),
        cell(t.netPnl),
        cell(t.rMultiple),
        cell(t.setup),
        csvEscape(t.tags.join('|')),
        cell(t.grade),
        cell(t.emotion),
        t.rulesFollowed == null ? '' : t.rulesFollowed ? '1' : '0',
        cell(t.plan),
        cell(t.review),
        cell(t.accountId),
        cell(t.accountName),
        cell(t.accountKind),
        cell(t.platform),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, '');
  while (i < s.length) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cur);
      cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    if (row.some((x) => x.trim() !== '')) rows.push(row);
  }
  return rows;
}

function num(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function csvToDrafts(text: string): { drafts: LogbookDraft[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length < 2) return { drafts: [], errors: ['CSV has no data rows.'] };
  const header = rows[0]!.map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const drafts: LogbookDraft[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!;
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? (row[i] ?? '').trim() : '';
    };
    const side = get('side');
    if (side !== 'long' && side !== 'short') {
      errors.push(`Row ${r + 1}: side must be long or short.`);
      continue;
    }
    const entry = num(get('entryPrice'));
    const size = num(get('size'));
    const openTime = num(get('openTime'));
    if (entry == null || size == null || openTime == null) {
      errors.push(`Row ${r + 1}: need symbol, entry, size, and open time.`);
      continue;
    }
    const tags = get('tags')
      .split('|')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const gradeRaw = get('grade');
    const emotionRaw = get('emotion');
    const rules = get('rulesFollowed');
    drafts.push({
      id: get('id') || undefined,
      symbol: get('symbol'),
      side: side as LogbookSide,
      openTime,
      closeTime: num(get('closeTime')),
      entryPrice: entry,
      exitPrice: num(get('exitPrice')),
      size,
      stopPrice: num(get('stopPrice')),
      targetPrice: num(get('targetPrice')),
      commission: num(get('commission')) ?? 0,
      netPnl: num(get('netPnl')),
      rMultiple: num(get('rMultiple')),
      pnlOverride: num(get('netPnl')) != null,
      rOverride: num(get('rMultiple')) != null,
      setup: get('setup') || null,
      tags,
      grade: TRADE_GRADES.includes(gradeRaw as (typeof TRADE_GRADES)[number])
        ? (gradeRaw as LogbookDraft['grade'])
        : null,
      emotion: TRADE_EMOTIONS.includes(emotionRaw as (typeof TRADE_EMOTIONS)[number])
        ? (emotionRaw as LogbookDraft['emotion'])
        : null,
      rulesFollowed: rules === '1' ? true : rules === '0' ? false : null,
      plan: get('plan'),
      review: get('review'),
      accountId: get('accountId') || null,
      accountName: get('accountName') || null,
      accountKind: parseAccountKind(get('accountKind')),
      platform: get('platform') || null,
    });
  }
  return { drafts, errors };
}
