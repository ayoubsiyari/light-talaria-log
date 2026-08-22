import { AppPageFrame } from '@/components/shell/AppPageFrame';

const TOPICS = [
  {
    title: 'Journal',
    body: 'The handwritten book. Tickets you type yourself — symbol, size, notes, grade. Lives under Journal. It is not the chart fill list.',
  },
  {
    title: 'Chart trades',
    body: 'Fills and strategy runs from Sessions. Jump to any entry time on the chart. Legacy #/journal still opens this list.',
  },
  {
    title: 'Sessions',
    body: 'Create a backtest from published server datasets, Start to open the chart, place orders, and replay bars. Exit returns here. Admins manage datasets under Admin.',
  },
  {
    title: 'Strategy builder',
    body: 'Build visual strategies (info → flow canvas → tags → review). Saved locally in this browser.',
  },
  {
    title: 'Dashboard analytics',
    body: 'Overview counts plus analytics from chart fills — not the handwritten journal, and not demo fixtures unless you reset the example.',
  },
  {
    title: 'Datasets',
    body: 'Publish Dukascopy / server history from Datasets so Sessions can fetch by date range.',
  },
] as const;

/** Help surface (EN) — Hero UI. */
export function ResourcesPage() {
  return (
    <AppPageFrame
      title="Resources"
      description="How Talaria-Log fits together. Full docs expand here later."
    >
      <div className="jd-stack">
        {TOPICS.map((t) => (
          <article key={t.title} className="jd-card">
            <h2>{t.title}</h2>
            <p className="jd-muted" style={{ marginTop: 8 }}>{t.body}</p>
          </article>
        ))}
      </div>
    </AppPageFrame>
  );
}
