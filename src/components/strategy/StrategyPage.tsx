import { Card } from '@heroui/react';

/**
 * Placeholder — Strategy Builder (ReactFlow) comes later.
 * Do not port TalariaV8b canvas here.
 */
export function StrategyPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Builder</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Strategy</h1>
          <p className="text-sm text-muted max-w-xl">
            Visual strategy building will live here. For now, run SMA / Donchian backtests from a
            chart session.
          </p>
        </header>

        <Card className="bg-surface border border-border">
          <Card.Content className="px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium">Coming soon</p>
            <p className="text-sm text-muted max-w-md mx-auto">
              Strategy canvas and rule builder are planned for a later phase — not ported from the
              legacy V8b monolith.
            </p>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
