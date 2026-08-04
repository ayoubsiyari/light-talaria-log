import { Card } from '@heroui/react';

const TOPICS = [
  {
    title: 'Sessions & chart',
    body: 'Create a backtest from server datasets, Start to open the chart engine, place orders, and replay bars. Exit returns to Sessions.',
  },
  {
    title: 'Trades journal',
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
    body: 'Publish Dukascopy / server history from Datasets so Create Session can fetch by date range.',
  },
] as const;

/**
 * V8b Resources tab — Hero UI help surface (EN).
 */
export function ResourcesPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Help</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Resources</h1>
          <p className="text-sm text-muted max-w-xl">
            How Talaria-Log fits together. Full docs expand here later.
          </p>
        </header>

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
      </div>
    </div>
  );
}
