/**
 * Standalone manual trade journal (logbook). Not the chart/backtest journal.
 */

export type LogbookSource = 'manual';

export type TradeGrade = 'A+' | 'A' | 'B' | 'C' | 'F';

export type TradeEmotion =
  | 'calm'
  | 'confident'
  | 'anxious'
  | 'fomo'
  | 'revenge'
  | 'tilted';

export type LogbookStatus = 'open' | 'closed';

export type LogbookSide = 'long' | 'short';

export type LogbookAccountKind = 'prop' | 'live' | 'demo';

export interface LogbookPropRules {
  dailyLossPct: number | null;
  maxLossPct: number | null;
  profitTargetPct: number | null;
  maxRiskPct: number | null;
  minTradingDays: number | null;
  newsTrading: boolean | null;
  weekendHold: boolean | null;
  notes: string;
}

export interface LogbookAccount {
  id: string;
  name: string;
  kind: LogbookAccountKind;
  platform: string;
  firm: string | null;
  /** Account size in USD — used to size tickets against prop risk. */
  balance: number | null;
  /** When true, this desk is listed on Journal Home. */
  onHome: boolean;
  rules: LogbookPropRules | null;
  createdAt: number;
  updatedAt: number;
}

export const TRADE_GRADES: readonly TradeGrade[] = ['A+', 'A', 'B', 'C', 'F'];

export const TRADE_EMOTIONS: readonly TradeEmotion[] = [
  'calm',
  'confident',
  'anxious',
  'fomo',
  'revenge',
  'tilted',
];

export interface LogbookTrade {
  id: string;
  source: LogbookSource;
  status: LogbookStatus;
  symbol: string;
  side: LogbookSide;
  /** Unix seconds */
  openTime: number;
  closeTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  size: number;
  stopPrice: number | null;
  targetPrice: number | null;
  commission: number;
  /** Account currency; user override or computed. */
  netPnl: number | null;
  /** From stop distance when present; user may override. */
  rMultiple: number | null;
  setup: string | null;
  tags: string[];
  grade: TradeGrade | null;
  emotion: TradeEmotion | null;
  rulesFollowed: boolean | null;
  plan: string;
  review: string;
  /** Desk the ticket was booked on (snapshot). */
  accountId: string | null;
  accountName: string | null;
  accountKind: LogbookAccountKind | null;
  platform: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Fields the form submits. Id omitted on create. */
export interface LogbookDraft {
  id?: string;
  symbol: string;
  side: LogbookSide;
  openTime: number;
  closeTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  size: number;
  stopPrice: number | null;
  targetPrice: number | null;
  commission: number;
  netPnl: number | null;
  rMultiple: number | null;
  pnlOverride: boolean;
  rOverride: boolean;
  setup: string | null;
  tags: string[];
  grade: TradeGrade | null;
  emotion: TradeEmotion | null;
  rulesFollowed: boolean | null;
  plan: string;
  review: string;
  accountId: string | null;
  accountName: string | null;
  accountKind: LogbookAccountKind | null;
  platform: string | null;
}

export type StatsPeriod = 'week' | 'month' | 'all';

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BreakdownRow {
  key: string;
  count: number;
  wins: number;
  losses: number;
  netPnl: number;
  winRate: number | null;
  expectancy: number | null;
  avgR: number | null;
  /** |group losses| / |all losses| */
  lossShare: number;
  /** group count / closed count */
  volumeShare: number;
}

export interface ClosePoint {
  symbol: string;
  pnl: number;
  r: number | null;
  side: LogbookSide;
}

export interface LogbookStats {
  period: StatsPeriod;
  openCount: number;
  closedCount: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number | null;
  netPnl: number;
  avgPnl: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  payoff: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  avgR: number | null;
  bestR: number | null;
  worstR: number | null;
  streak: { kind: 'win' | 'loss' | 'none'; length: number };
  ruleFollowedCount: number;
  ruleBrokenCount: number;
  maxDrawdown: number;
  avgHoldSec: number | null;
  equity: EquityPoint[];
  closes: ClosePoint[];
  bySetup: BreakdownRow[];
  byTag: BreakdownRow[];
  byWeekday: BreakdownRow[];
  byEmotion: BreakdownRow[];
  bySide: BreakdownRow[];
  bySession: BreakdownRow[];
  bestClose: number | null;
  peakEquity: number | null;
  lastClose: ClosePoint | null;
}

export type MentorSeverity = 'warn' | 'note' | 'good';

export interface MentorInsight {
  id: string;
  severity: MentorSeverity;
  headline: string;
  evidence: string;
  action: string;
  /** Lower is more important. */
  rank: number;
}
