import { Button, Card } from '@heroui/react';

interface NotFoundPageProps {
  onGoHome: () => void;
  onGoBacktest: () => void;
  /** @deprecated Use onGoBacktest */
  onGoSessions?: () => void;
}

/** Soft 404 for unknown hash routes. */
export function NotFoundPage({
  onGoHome,
  onGoBacktest,
  onGoSessions,
}: NotFoundPageProps) {
  const goBacktest = onGoBacktest ?? onGoSessions!;
  return (
    <div className="min-h-full bg-background text-foreground overflow-auto">
      <div className="max-w-lg mx-auto px-6 py-16 space-y-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Talaria-Log</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <Card className="bg-surface border border-border">
          <Card.Content className="px-6 py-6 space-y-4">
            <p className="text-sm text-muted">
              That link does not match a known page. Try Backtest to open or create a session,
              or go back to the home page.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="primary" className="min-h-11" onPress={goBacktest}>
                Go to Backtest
              </Button>
              <Button variant="secondary" className="min-h-11" onPress={onGoHome}>
                Home
              </Button>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
