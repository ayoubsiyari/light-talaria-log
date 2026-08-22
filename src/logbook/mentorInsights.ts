import { computePlannedR, isWin } from './compute';
import { computeLogbookStats } from './logbookStats';
import type { BreakdownRow, LogbookTrade, MentorInsight, StatsPeriod } from './types';

export const MENTOR_MIN_TRADES = 8;
const MIN_BUCKET = 3;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function money(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}

function worstExpectancy(rows: BreakdownRow[], min = MIN_BUCKET): BreakdownRow | null {
  const eligible = rows.filter((r) => r.count >= min && r.expectancy != null);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => ((a.expectancy ?? 0) <= (b.expectancy ?? 0) ? a : b));
}

function bestExpectancy(rows: BreakdownRow[], min = MIN_BUCKET): BreakdownRow | null {
  const eligible = rows.filter((r) => r.count >= min && r.expectancy != null);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => ((a.expectancy ?? 0) >= (b.expectancy ?? 0) ? a : b));
}

/**
 * Ranked mentor findings from this logbook only.
 * Returns [] until there are enough closed trades — never invents.
 */
export function mentorInsights(
  trades: readonly LogbookTrade[],
  period: StatsPeriod = 'all',
  nowSec?: number,
): MentorInsight[] {
  const stats = computeLogbookStats(trades, period, nowSec);
  if (stats.closedCount < MENTOR_MIN_TRADES) return [];

  const out: MentorInsight[] = [];

  const taggedLoss = stats.byTag
    .filter((r) => r.count >= MIN_BUCKET && r.winRate != null && r.winRate < 0.5)
    .filter((r) => r.lossShare > r.volumeShare * 1.35)
    .sort((a, b) => b.lossShare - a.lossShare)[0];
  if (taggedLoss && taggedLoss.winRate != null) {
    out.push({
      id: `tag-loss-${taggedLoss.key}`,
      severity: 'warn',
      headline: `You’re down ${pct(1 - taggedLoss.winRate)} of the time on trades tagged “${taggedLoss.key}”.`,
      evidence: `They’re ${pct(taggedLoss.volumeShare)} of your volume and ${pct(taggedLoss.lossShare)} of your losses (${taggedLoss.count} trades, ${money(taggedLoss.netPnl)}).`,
      action: `Stop taking “${taggedLoss.key}” tickets until you rewrite the rule that produces them.`,
      rank: 10,
    });
  }

  const worstTag = worstExpectancy(stats.byTag);
  if (worstTag && (worstTag.expectancy ?? 0) < 0 && worstTag.key !== taggedLoss?.key) {
    out.push({
      id: `tag-exp-${worstTag.key}`,
      severity: 'warn',
      headline: `“${worstTag.key}” is your weakest tag.`,
      evidence: `${worstTag.count} trades, expectancy ${money(worstTag.expectancy ?? 0)}, win rate ${worstTag.winRate != null ? pct(worstTag.winRate) : '—'}.`,
      action: `Drop or rewrite the “${worstTag.key}” tag before you size up.`,
      rank: 20,
    });
  }

  const worstSetup = worstExpectancy(stats.bySetup);
  if (worstSetup && (worstSetup.expectancy ?? 0) < 0) {
    out.push({
      id: `setup-exp-${worstSetup.key}`,
      severity: 'warn',
      headline: `${worstSetup.key} is costing you.`,
      evidence: `${worstSetup.count} trades, expectancy ${money(worstSetup.expectancy ?? 0)}, ${money(worstSetup.netPnl)} net.`,
      action: `Park this setup or cut size until the sample turns.`,
      rank: 25,
    });
  }

  const bestSetup = bestExpectancy(stats.bySetup);
  if (bestSetup && (bestSetup.expectancy ?? 0) > 0 && bestSetup.key !== worstSetup?.key) {
    out.push({
      id: `setup-best-${bestSetup.key}`,
      severity: 'good',
      headline: `${bestSetup.key} is carrying the book.`,
      evidence: `${bestSetup.count} trades, expectancy ${money(bestSetup.expectancy ?? 0)}, win rate ${bestSetup.winRate != null ? pct(bestSetup.winRate) : '—'}.`,
      action: `Size here first. Don’t dilute it with weaker setups.`,
      rank: 40,
    });
  }

  const tilt = stats.byEmotion.filter((r) =>
    r.key === 'revenge' || r.key === 'fomo' || r.key === 'tilted',
  );
  const calm = stats.byEmotion.filter((r) => r.key === 'calm' || r.key === 'confident');
  const tiltN = tilt.reduce((s, r) => s + r.count, 0);
  const tiltPnl = tilt.reduce((s, r) => s + r.netPnl, 0);
  const calmN = calm.reduce((s, r) => s + r.count, 0);
  const calmExp = calmN > 0 ? calm.reduce((s, r) => s + r.netPnl, 0) / calmN : null;
  const tiltExp = tiltN > 0 ? tiltPnl / tiltN : null;
  if (tiltN >= MIN_BUCKET && tiltExp != null && (calmExp == null || tiltExp < calmExp - 1e-9)) {
    out.push({
      id: 'emotion-tilt',
      severity: 'warn',
      headline: 'Revenge, FOMO, and tilt are worse than calm trades.',
      evidence: `${tiltN} tilted tickets, expectancy ${money(tiltExp)}${calmExp != null ? ` vs ${money(calmExp)} when calm` : ''}.`,
      action: 'Hard stop after a loss. Journal the next ticket before you click.',
      rank: 15,
    });
  }

  if (stats.ruleFollowedCount >= MIN_BUCKET && stats.ruleBrokenCount >= MIN_BUCKET) {
    const followed = trades.filter(
      (t) => t.status === 'closed' && t.rulesFollowed === true && t.netPnl != null,
    );
    const broken = trades.filter(
      (t) => t.status === 'closed' && t.rulesFollowed === false && t.netPnl != null,
    );
    const fExp =
      followed.reduce((s, t) => s + (t.netPnl ?? 0), 0) / followed.length;
    const bExp = broken.reduce((s, t) => s + (t.netPnl ?? 0), 0) / broken.length;
    if (bExp < fExp) {
      out.push({
        id: 'rules-gap',
        severity: 'warn',
        headline: 'Breaking your rules is cheaper than following them — the wrong way.',
        evidence: `Followed (${followed.length}): ${money(fExp)} expectancy. Broke (${broken.length}): ${money(bExp)}.`,
        action: 'Treat a rule-break as a scratch, not a trade. Flat and done.',
        rank: 18,
      });
    }
  }

  const worstDay = worstExpectancy(stats.byWeekday, 2);
  const bestDay = bestExpectancy(stats.byWeekday, 2);
  if (bestDay && worstDay && bestDay.key !== worstDay.key && (bestDay.expectancy ?? 0) > 0) {
    out.push({
      id: `day-${bestDay.key}-${worstDay.key}`,
      severity: 'note',
      headline: `${bestDay.key} pays; ${worstDay.key} does not.`,
      evidence: `${bestDay.key} expectancy ${money(bestDay.expectancy ?? 0)} (${bestDay.count}). ${worstDay.key} ${money(worstDay.expectancy ?? 0)} (${worstDay.count}).`,
      action: `Trade ${bestDay.key}. Sit ${worstDay.key} out or cut size.`,
      rank: 35,
    });
  }

  if (stats.streak.length >= 3 && stats.streak.kind !== 'none') {
    if (stats.streak.kind === 'loss') {
      out.push({
        id: 'streak-loss',
        severity: 'warn',
        headline: `${stats.streak.length}-loss streak. Size down.`,
        evidence: `Last ${stats.streak.length} closed tickets are losers.`,
        action: 'Half size on the next two. No adds. Stop if you break a rule.',
        rank: 8,
      });
    } else {
      out.push({
        id: 'streak-win',
        severity: 'note',
        headline: `${stats.streak.length}-win streak. Don’t give it back.`,
        evidence: `Last ${stats.streak.length} closed tickets are winners.`,
        action: 'Keep size. Do not widen stops or chase a fifth.',
        rank: 45,
      });
    }
  }

  const withPlan = trades.filter((t) => {
    if (t.status !== 'closed' || t.rMultiple == null || t.netPnl == null) return false;
    return computePlannedR(t.side, t.entryPrice, t.stopPrice, t.targetPrice) != null;
  });
  if (withPlan.length >= MIN_BUCKET) {
    let gaveBack = 0;
    let lateCuts = 0;
    for (const t of withPlan) {
      const planned = computePlannedR(t.side, t.entryPrice, t.stopPrice, t.targetPrice);
      if (planned == null || planned <= 0 || t.rMultiple == null) continue;
      if ((t.netPnl ?? 0) > 0 && t.rMultiple < planned * 0.5) gaveBack += 1;
      if ((t.netPnl ?? 0) < 0 && t.rMultiple < -1.4) lateCuts += 1;
    }
    if (gaveBack >= 2) {
      out.push({
        id: 'gave-back',
        severity: 'note',
        headline: 'Winners are leaving money on the table.',
        evidence: `${gaveBack} of ${withPlan.length} planned tickets realized less than half the target R.`,
        action: 'Hold to the written target, or trail — don’t scratch a working trade.',
        rank: 30,
      });
    }
    if (lateCuts >= 2) {
      out.push({
        id: 'late-cuts',
        severity: 'warn',
        headline: 'Losers are running past the stop.',
        evidence: `${lateCuts} of ${withPlan.length} planned tickets closed worse than −1.4R.`,
        action: 'Hard stop. If you moved it, that’s the trade to review tonight.',
        rank: 12,
      });
    }
  }

  return out.sort((a, b) => a.rank - b.rank);
}

/** One-line mentor note for a single ticket. */
export function mentorNoteForTrade(
  trade: LogbookTrade,
  all: readonly LogbookTrade[],
): MentorInsight | null {
  if (trade.emotion === 'revenge' || trade.emotion === 'tilted' || trade.emotion === 'fomo') {
    const same = all.filter(
      (t) =>
        t.status === 'closed' &&
        t.emotion === trade.emotion &&
        t.netPnl != null,
    );
    if (same.length >= 2) {
      const exp = same.reduce((s, t) => s + (t.netPnl ?? 0), 0) / same.length;
      return {
        id: `ticket-emotion-${trade.id}`,
        severity: 'warn',
        headline: `This ticket is marked ${trade.emotion}.`,
        evidence: `${same.length} ${trade.emotion} trades average ${money(exp)}.`,
        action: 'If the plan wasn’t written first, flatten and walk.',
        rank: 1,
      };
    }
  }
  if (trade.rulesFollowed === false) {
    return {
      id: `ticket-rules-${trade.id}`,
      severity: 'warn',
      headline: 'You marked this as a rule-break.',
      evidence: isWin(trade) === true
        ? 'A winner that broke rules still trains the wrong habit.'
        : 'Log it, don’t revenge the next one.',
      action: 'Write the rule you broke in the review before you place another.',
      rank: 1,
    };
  }
  if (trade.tags.includes('revenge')) {
    return {
      id: `ticket-tag-${trade.id}`,
      severity: 'warn',
      headline: 'Tagged revenge.',
      evidence: 'That tag is usually where the week goes to die.',
      action: 'Next trade only after a written plan and a timer.',
      rank: 1,
    };
  }
  return null;
}
