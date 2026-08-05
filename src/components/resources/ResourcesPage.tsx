import { Card } from '@heroui/react';
import { AppPageFrame } from '@/components/shell/AppPageFrame';

const TOPICS = [
  {
    title: 'Backtest & chart',
    body: 'Create a backtest from server datasets, Start to open the chart engine, place orders, and replay bars. Exit returns to Backtest.',
  },
  {
    title: 'Trades',
    body: 'Closed fills and strategy runs live under Trades. Jump to any entry time on the chart.',
  },
  {
    title: 'Strategy builder',
    body: 'Build visual strategies (info → flow canvas → tags → review). Saved locally in this browser.',
  },
  {
    title: 'Dashboard analytics',
    body: 'Overview counts plus analytics from your real order journal — not demo fixtures.',
  },
  {
    title: 'Datasets',
    body: 'Publish Dukascopy / server history from Datasets so Backtest can fetch by date range.',
  },
] as const;

/** Help surface (EN) — Hero UI. */
export function ResourcesPage() {
  return (
    <AppPageFrame
      narrow
      eyebrow="Help"
      title="Resources"
      description="How Talaria-Log fits together. Full docs expand here later."
    >
      <div className="space-y-3">
        {TOPICS.map((t) => (
          <Card key={t.title} className="bg-surface border border-border">
            <Card.Content className="px-5 py-4 space-y-1">
              <p className="font-semibold">{t.title}</p>
              <p className="text-sm text-muted">{t.body}</p>
            </Card.Content>
          </Card>
        ))}
      </div>
    </AppPageFrame>
  );
}
