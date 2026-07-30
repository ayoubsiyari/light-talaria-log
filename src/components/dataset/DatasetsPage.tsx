import { useMemo, useState } from 'react';
import { Button, Card, Label } from '@heroui/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  datasetLabel,
  deleteDataset,
  downloadAndStoreDataset,
  listDatasets,
  validateDownloadDates,
} from '@/datasets/datasetStore';
import {
  assessDownloadSize,
  HARD_MAX_ESTIMATED_ROWS,
  MAX_DOWNLOAD_SPAN_DAYS,
} from '@/datasets/ingestLimits';
import {
  PAIR_OPTIONS,
  TIMEFRAME_OPTIONS,
  type PairSymbol,
} from '@/types/session';
import type { Timeframe } from '@/types/ui';

interface DatasetsPageProps {
  onGoSessions: () => void;
}

function defaultDates(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toIso(start), end: toIso(end) };
}

const fieldClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent';

export function DatasetsPage({ onGoSessions }: DatasetsPageProps) {
  const defaults = useMemo(() => defaultDates(), []);
  const [pair, setPair] = useState<PairSymbol>('EUR/USD');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [datasets, setDatasets] = useState(() => listDatasets());

  const refresh = () => setDatasets(listDatasets());

  const sizeAssess = useMemo(
    () => assessDownloadSize(startDate, endDate, timeframe),
    [startDate, endDate, timeframe],
  );

  const handleDownload = async () => {
    const dateError = validateDownloadDates(startDate, endDate);
    if (dateError) {
      setError(dateError);
      setStatus(null);
      return;
    }
    if (sizeAssess.level === 'block') {
      setError(sizeAssess.error);
      setStatus(null);
      return;
    }
    if (sizeAssess.level === 'confirm') {
      const ok = window.confirm(
        `${sizeAssess.message}\n\nThis can take several minutes and use significant disk space. Continue?`,
      );
      if (!ok) {
        setStatus(null);
        setError(null);
        return;
      }
    }
    setError(null);
    setStatus('Downloading from Dukascopy…');
    setDownloading(true);
    try {
      const dataset = await downloadAndStoreDataset({
        pair,
        timeframe,
        startDate,
        endDate,
      });
      refresh();
      setStatus(`Saved ${dataset.rowCount.toLocaleString()} bars · ${datasetLabel(dataset)}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = (id: string) => {
    void deleteDataset(id).then(refresh);
  };

  return (
    <div className="min-h-full bg-background text-foreground overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Talaria-Log</p>
            <h1 className="text-3xl font-semibold tracking-tight">Datasets</h1>
            <p className="text-sm text-muted max-w-xl">
              Download OHLC history from Dukascopy. Saved datasets appear on the session page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="secondary" size="sm" onPress={onGoSessions}>
              Sessions
            </Button>
          </div>
        </header>

        <Card className="bg-surface border border-border">
          <Card.Header className="px-6 pt-6 pb-2">
            <Card.Title className="text-lg">Download from Dukascopy</Card.Title>
            <Card.Description className="text-muted text-sm">
              Prefer <strong className="text-foreground font-medium">1 Minute</strong> — higher
              timeframes are built from it on the chart. Max {MAX_DOWNLOAD_SPAN_DAYS} days · ~
              {HARD_MAX_ESTIMATED_ROWS.toLocaleString()} bars. Needs{' '}
              <code className="text-xs">npm run dev</code>.
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-6 pb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted">Pair</Label>
                <select
                  className={fieldClass}
                  value={pair}
                  onChange={(e) => setPair(e.target.value as PairSymbol)}
                  disabled={downloading}
                >
                  {PAIR_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted">Ticker (timeframe)</Label>
                <select
                  className={fieldClass}
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                  disabled={downloading}
                >
                  {TIMEFRAME_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted">Start date</Label>
                <input
                  type="date"
                  className={fieldClass}
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={downloading}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted">End date</Label>
                <input
                  type="date"
                  className={fieldClass}
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={downloading}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            {!error && sizeAssess.level === 'block' && sizeAssess.error && (
              <p className="text-sm text-danger" role="alert">
                {sizeAssess.error}
              </p>
            )}
            {!error &&
              sizeAssess.level !== 'block' &&
              sizeAssess.message &&
              !status && (
                <p
                  className={
                    sizeAssess.level === 'confirm' || sizeAssess.level === 'warn'
                      ? 'text-sm text-accent'
                      : 'text-sm text-muted'
                  }
                  role="status"
                >
                  {sizeAssess.message}
                </p>
              )}
            {status && !error && (
              <p className="text-sm text-muted" role="status">
                {status}
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              <Button
                variant="primary"
                className="min-h-11"
                onPress={() => void handleDownload()}
                isDisabled={downloading || sizeAssess.level === 'block'}
              >
                {downloading
                  ? 'Downloading…'
                  : sizeAssess.level === 'confirm'
                    ? 'Download (confirm)…'
                    : 'Download'}
              </Button>
              <p className="text-xs text-muted min-w-0 break-words">
                {pair} · {timeframe} · {startDate} → {endDate}
                {sizeAssess.estimatedRows > 0
                  ? ` · ~${sizeAssess.estimatedRows.toLocaleString()} bars`
                  : ''}
              </p>
            </div>
          </Card.Content>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Downloaded datasets
          </h2>
          {datasets.length === 0 ? (
            <p className="text-sm text-muted">No datasets yet. Download one above.</p>
          ) : (
            <ul className="space-y-2">
              {datasets.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{datasetLabel(d)}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {d.rowCount.toLocaleString()} bars · {d.source}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onPress={() => handleDelete(d.id)}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
