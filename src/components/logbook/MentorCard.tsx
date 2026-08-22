import type { MentorInsight } from '@/logbook/types';

interface MentorCardProps {
  insights: MentorInsight[];
  closedCount: number;
  minTrades: number;
  compact?: boolean;
  /** Parent already provides the frame (bento cell). */
  bare?: boolean;
}

export function MentorCard({
  insights,
  closedCount,
  minTrades,
  compact = false,
  bare = false,
}: MentorCardProps) {
  const frame = bare ? '' : 'jd-card';
  if (closedCount < minTrades) {
    return (
      <section className={frame || undefined}>
        <h2>Not enough tape yet</h2>
        <p className="jd-muted" style={{ marginTop: 8 }}>
          Log {minTrades} closed trades and this page starts calling patterns — tags that
          leak, setups that pay, streaks you should size down for. Until then it stays quiet.
          You have {closedCount}.
        </p>
      </section>
    );
  }
  if (insights.length === 0) {
    return (
      <section className={frame || undefined}>
        <h2>No sharp edge in the sample</h2>
        <p className="jd-muted" style={{ marginTop: 8 }}>
          {closedCount} closed trades, and nothing splits hard enough to coach. Keep tagging
          honestly. Silence is the honest answer.
        </p>
      </section>
    );
  }
  const lead = insights[0]!;
  const rest = compact ? [] : insights.slice(1, 3);
  return (
    <section className={frame || undefined}>
      <Finding insight={lead} lead />
      {rest.map((insight) => (
        <Finding key={insight.id} insight={insight} />
      ))}
    </section>
  );
}

function Finding({
  insight,
  lead = false,
}: {
  insight: MentorInsight;
  lead?: boolean;
}) {
  const tone =
    insight.severity === 'warn'
      ? 'text-danger'
      : insight.severity === 'good'
        ? 'text-success'
        : '';
  return (
    <div className={lead ? '' : 'jd-finding'}>
      <p className={`${lead ? 'jd-hello' : 'font-semibold'} ${tone}`.trim()}>
        {insight.headline}
      </p>
      <p className="jd-muted" style={{ marginTop: 8 }}>{insight.evidence}</p>
      <p style={{ marginTop: 8 }}>{insight.action}</p>
    </div>
  );
}
