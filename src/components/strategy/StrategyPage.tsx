import { Button, Card } from '@heroui/react';

interface StrategyPageProps {
  onGoBacktest?: () => void;
}

/**
 * Hero UI strategy surface. Builder (ReactFlow) ships later as a real module —
 * not by hosting TalariaV8b.
 */
export function StrategyPage({ onGoBacktest }: StrategyPageProps) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Builder</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Strategy</h1>
          <p className="text-sm text-muted max-w-xl">
            Visual strategy building will live here as a first-party Hero UI module. Until then,
            run SMA / Donchian from a chart session.
          </p>
        </header>

        <Card className="bg-surface border border-border">
          <Card.Content className="px-6 py-10 text-center space-y-4">
            <p className="text-sm font-medium">Strategy canvas — next</p>
            <p className="text-sm text-muted max-w-md mx-auto">
              The legacy V8b file stays in <code className="text-xs">src/v8b/</code> as reference
              only. This app does not mount it.
            </p>
            {onGoBacktest && (
              <Button variant="primary" className="min-h-11" onPress={onGoBacktest}>
                Open backtest
              </Button>
            )}
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
