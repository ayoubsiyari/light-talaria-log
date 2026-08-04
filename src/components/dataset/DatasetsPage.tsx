import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Label } from '@heroui/react';
import { AppPageHeader } from '@/components/layout/AppPageNav';
import {
  datasetLabel,
  deleteDataset,
  downloadAndStoreDataset,
  findSamePairTfDataset,
  listDatasets,
  validateDownloadDates,
} from '@/datasets/datasetStore';
import { splitRangeByYear } from '@/datasets/downloadChunks';
import { ingestRemoteDatasetAllTfs } from '@/datasets/ingestRemoteChunks';
import {
  assessDownloadSize,
  HARD_MAX_CHUNKED_ESTIMATED_ROWS,
  MAX_DOWNLOAD_SPAN_DAYS,
} from '@/datasets/ingestLimits';
import { publishDatasetToServer } from '@/datasets/publishDataset';
import {
  fetchHealth,
  fetchMe,
  listRemoteDatasets,
  loginRemote,
  logoutRemote,
  registerRemote,
} from '@/datasets/remoteApi';
import {
  PAIR_OPTIONS,
  TIMEFRAME_OPTIONS,
  type PairSymbol,
} from '@/types/session';
import type { RemoteDatasetMeta, RemoteUser } from '@/types/remoteApi';
import type { Timeframe } from '@/types/ui';

interface DatasetsPageProps {
  onGoSessions: () => void;
  onGoHome?: () => void;
  onGoJournal?: () => void;
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

export function DatasetsPage({
  onGoSessions,
  onGoHome,
  onGoJournal,
}: DatasetsPageProps) {
  const defaults = useMemo(() => defaultDates(), []);
  const [pair, setPair] = useState<PairSymbol>('EUR/USD');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [datasets, setDatasets] = useState(() => listDatasets());

  const [remoteDatasets, setRemoteDatasets] = useState<RemoteDatasetMeta[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [apiUser, setApiUser] = useState<RemoteUser | null>(null);
  const [apiMode, setApiMode] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState('admin@localhost');
  const [authPassword, setAuthPassword] = useState('admin12345');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const refresh = () => setDatasets(listDatasets());

  const loadRemote = () => {
    setRemoteStatus('loading');
    setRemoteError(null);
    void (async () => {
      try {
        const health = await fetchHealth();
        setApiMode('mode' in health && typeof health.mode === 'string' ? health.mode : null);
        try {
          setApiUser(await fetchMe());
        } catch {
          setApiUser(null);
        }
        const list = await listRemoteDatasets();
        setRemoteDatasets(list);
        setRemoteStatus('ready');
      } catch (err) {
        setRemoteDatasets([]);
        setApiUser(null);
        setApiMode(null);
        setRemoteStatus('error');
        setRemoteError(
          err instanceof Error
            ? err.message
            : 'Remote API unreachable. Use `npm run dev` (stub) or `npm run saas:dev` (Level-2).',
        );
      }
    })();
  };

  useEffect(() => {
    loadRemote();
  }, []);

  const localIds = useMemo(() => new Set(datasets.map((d) => d.id)), [datasets]);

  const sizeAssess = useMemo(
    () => assessDownloadSize(startDate, endDate, timeframe),
    [startDate, endDate, timeframe],
  );

  const yearChunks = useMemo(
    () => splitRangeByYear(startDate, endDate),
    [startDate, endDate],
  );

  const existingSame = useMemo(
    () => findSamePairTfDataset(pair, timeframe),
    [pair, timeframe, datasets],
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
      const mergeNote = existingSame
        ? `\n\nWill merge into existing dataset:\n${datasetLabel(existingSame)}`
        : '\n\nAll years save into one dataset.';
      const ok = window.confirm(
        `${sizeAssess.message}${mergeNote}\n\nThis can take several minutes and use significant disk space. Continue?`,
      );
      if (!ok) {
        setStatus(null);
        setError(null);
        return;
      }
    }
    setError(null);
    setStatus(
      yearChunks.length > 1
        ? `Downloading ${yearChunks.length} year chunks from Dukascopy…`
        : 'Downloading from Dukascopy…',
    );
    setDownloading(true);
    try {
      const dataset = await downloadAndStoreDataset({
        pair,
        timeframe,
        startDate,
        endDate,
        mergeIntoSamePairTf: true,
        onProgress: (p) => {
          setStatus(
            `Year ${p.label} (${p.chunkIndex + 1}/${p.chunkTotal}) · +${p.rowsInChunk.toLocaleString()} · total ${p.rowsSoFar.toLocaleString()} bars`,
          );
        },
      });
      refresh();
      setStatus(
        `Saved locally · ${dataset.rowCount.toLocaleString()} bars — publishing to server…`,
      );
      try {
        const pub = await publishDatasetToServer(dataset.id, (p) => {
          setStatus(`${p.detail} (${p.percent}%)`);
        });
        refresh();
        loadRemote();
        setStatus(
          `On server · ${dataset.rowCount.toLocaleString()} bars · ${pub.chunkCount} chunks · ${datasetLabel(dataset)}` +
            (yearChunks.length > 1 ? ` · ${yearChunks.length} years` : '') +
            ' — other browsers: Import from API',
        );
      } catch (pubErr) {
        refresh();
        setStatus(
          `Saved locally only · ${dataset.rowCount.toLocaleString()} bars · ${datasetLabel(dataset)}` +
            (yearChunks.length > 1 ? ` · ${yearChunks.length} years` : ''),
        );
        setError(
          pubErr instanceof Error
            ? `Server save failed: ${pubErr.message}. Use “Save to server” below, or keep using this browser’s local copy.`
            : 'Server save failed. Data is still in this browser.',
        );
      }
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handlePublish = async (id: string) => {
    setPublishingId(id);
    setError(null);
    setStatus('Publishing to server…');
    try {
      const pub = await publishDatasetToServer(id, (p) => {
        setStatus(`${p.detail} (${p.percent}%)`);
      });
      refresh();
      loadRemote();
      setStatus(
        `On server · ${pub.chunkCount} chunks · ${pub.timeframes.join(', ')} — other browsers: Import from API`,
      );
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishingId(null);
    }
  };

  const handleImportRemote = async (remote: RemoteDatasetMeta) => {
    setImportingId(remote.id);
    setImportStatus(`Importing ${remote.name}…`);
    setRemoteError(null);
    try {
      const catalog = await ingestRemoteDatasetAllTfs(remote.id, (p) => {
        setImportStatus(
          `Importing ${remote.name} · ${p.timeframe} (${p.index + 1}/${p.total})…`,
        );
      });
      refresh();
      const rows = catalog.rowCounts[catalog.baseTf] ?? 0;
      setImportStatus(
        `Imported ${remote.name} · ${rows.toLocaleString()} bars · ${catalog.timeframes.join(', ')}`,
      );
    } catch (err) {
      setImportStatus(null);
      setRemoteError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingId(null);
    }
  };

  const handleDelete = (id: string) => {
    void deleteDataset(id).then(refresh);
  };

  return (
    <div className="min-h-full bg-background text-foreground overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <AppPageHeader
          current="datasets"
          title="Datasets"
          description="Downloads stay in this browser until saved to the server. After publish, other browsers import via Import from API (no re-download from Dukascopy)."
          onGoHome={onGoHome}
          onGoSessions={onGoSessions}
          onGoDatasets={() => undefined}
          onGoJournal={onGoJournal}
        />

        {datasets.length > 0 && (
          <Card className="bg-surface border border-border border-l-4 border-l-accent">
            <Card.Content className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {datasets.length} dataset{datasets.length === 1 ? '' : 's'} ready
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Create a backtest session with your downloaded pairs.
                </p>
              </div>
              <Button
                variant="primary"
                className="min-h-11 shrink-0"
                onPress={onGoSessions}
              >
                Create session
              </Button>
            </Card.Content>
          </Card>
        )}

        <Card className="bg-surface border border-border">
          <Card.Header className="px-6 pt-6 pb-2">
            <Card.Title className="text-lg">Download from Dukascopy</Card.Title>
            <Card.Description className="text-muted text-sm">
              Prefer <strong className="text-foreground font-medium">1 Minute</strong> — higher
              TFs are built on the chart. Multi-year ranges download{' '}
              <strong className="text-foreground font-medium">year-by-year</strong> into one
              dataset (same pair/TF merges). Max {MAX_DOWNLOAD_SPAN_DAYS} days · ~
              {HARD_MAX_CHUNKED_ESTIMATED_ROWS.toLocaleString()} bars. Needs{' '}
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

            {existingSame && !downloading && (
              <p className="text-xs text-muted" role="status">
                Will merge into existing: {datasetLabel(existingSame)}
              </p>
            )}
            {yearChunks.length > 1 && !downloading && (
              <p className="text-xs text-muted" role="status">
                {yearChunks.length} year chunks: {yearChunks.map((c) => c.label).join(', ')}
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
                  : yearChunks.length > 1
                    ? `Download ${yearChunks.length} years…`
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

        {remoteStatus === 'ready' && apiMode === 'saas-level-2' && (
          <Card className="bg-surface border border-border">
            <Card.Header className="px-6 pt-6 pb-2">
              <Card.Title className="text-lg">SaaS account</Card.Title>
              <Card.Description className="text-muted text-sm">
                Level-2 API session (cookie). Default seed: admin@localhost / admin12345
              </Card.Description>
            </Card.Header>
            <Card.Content className="px-6 pb-6 space-y-3">
              {apiUser ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm min-w-0 flex-1">
                    Signed in as <span className="font-medium">{apiUser.email}</span>
                    {apiUser.displayName ? ` · ${apiUser.displayName}` : ''}
                  </p>
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    isDisabled={authBusy}
                    onPress={() => {
                      setAuthBusy(true);
                      void logoutRemote()
                        .then(() => {
                          setApiUser(null);
                          loadRemote();
                        })
                        .catch((err) =>
                          setAuthError(err instanceof Error ? err.message : 'Logout failed'),
                        )
                        .finally(() => setAuthBusy(false));
                    }}
                  >
                    Log out
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <input
                        className={fieldClass}
                        type="email"
                        autoComplete="username"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Password</Label>
                      <input
                        className={fieldClass}
                        type="password"
                        autoComplete="current-password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  {authError && (
                    <p className="text-sm text-danger" role="alert">
                      {authError}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      className="min-h-11"
                      isDisabled={authBusy}
                      onPress={() => {
                        setAuthBusy(true);
                        setAuthError(null);
                        void loginRemote(authEmail, authPassword)
                          .then((u) => {
                            setApiUser(u);
                            loadRemote();
                          })
                          .catch((err) =>
                            setAuthError(err instanceof Error ? err.message : 'Login failed'),
                          )
                          .finally(() => setAuthBusy(false));
                      }}
                    >
                      Log in
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      isDisabled={authBusy}
                      onPress={() => {
                        setAuthBusy(true);
                        setAuthError(null);
                        void registerRemote(authEmail, authPassword)
                          .then((u) => {
                            setApiUser(u);
                            loadRemote();
                          })
                          .catch((err) =>
                            setAuthError(
                              err instanceof Error ? err.message : 'Register failed',
                            ),
                          )
                          .finally(() => setAuthBusy(false));
                      }}
                    >
                      Register
                    </Button>
                  </div>
                </>
              )}
            </Card.Content>
          </Card>
        )}

        <Card className="bg-surface border border-border">
          <Card.Header className="px-6 pt-6 pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <Card.Title className="text-lg">Import from API</Card.Title>
                <Card.Description className="text-muted text-sm">
                  Shared datasets via <code className="text-xs">/api/v1</code>. Pulls all
                  available timeframes into IndexedDB (no full series in React state).
                </Card.Description>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 shrink-0"
                onPress={loadRemote}
                isDisabled={remoteStatus === 'loading' || importingId != null}
              >
                {remoteStatus === 'loading' ? 'Checking…' : 'Refresh'}
              </Button>
            </div>
          </Card.Header>
          <Card.Content className="px-6 pb-6 space-y-3">
            {remoteStatus === 'loading' && (
              <p className="text-sm text-muted" role="status">
                Checking remote API…
              </p>
            )}
            {remoteStatus === 'error' && (
              <p className="text-sm text-danger" role="alert">
                {remoteError ?? 'Remote API unreachable.'}
              </p>
            )}
            {remoteStatus === 'ready' && remoteDatasets.length === 0 && (
              <p className="text-sm text-muted">No remote datasets available.</p>
            )}
            {remoteStatus === 'ready' && remoteDatasets.length > 0 && (
              <ul className="space-y-2">
                {remoteDatasets.map((r) => {
                  const imported = localIds.has(r.id);
                  const busy = importingId === r.id;
                  const tfs = r.timeframes?.length
                    ? r.timeframes.join(', ')
                    : r.baseTimeframe;
                  const rows =
                    r.rowCounts?.[r.baseTimeframe] ??
                    Object.values(r.rowCounts ?? {})[0] ??
                    0;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <p className="text-xs text-muted tabular-nums break-words">
                          {r.symbol} · {tfs} · {rows.toLocaleString()} bars
                          {imported ? ' · imported' : ''}
                        </p>
                      </div>
                      <Button
                        variant={imported ? 'secondary' : 'primary'}
                        size="sm"
                        className="min-h-11"
                        onPress={() => void handleImportRemote(r)}
                        isDisabled={importingId != null}
                        aria-label={
                          imported
                            ? `Sync missing timeframes for ${r.name}`
                            : `Import ${r.name}`
                        }
                      >
                        {busy
                          ? 'Importing…'
                          : imported
                            ? 'Sync timeframes'
                            : 'Import'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {importStatus && !remoteError && (
              <p className="text-sm text-muted" role="status">
                {importStatus}
              </p>
            )}
            {remoteError && remoteStatus === 'ready' && (
              <p className="text-sm text-danger" role="alert">
                {remoteError}
              </p>
            )}
          </Card.Content>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Downloaded datasets
          </h2>
          {datasets.length === 0 ? (
            <p className="text-sm text-muted">No datasets yet. Download or import one above.</p>
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
                      {d.serverSyncedAt
                        ? ' · on server'
                        : d.source === 'dukascopy'
                          ? ' · this browser only'
                          : ''}
                    </p>
                  </div>
                  {d.source !== 'remote' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      isDisabled={
                        downloading ||
                        publishingId != null ||
                        remoteStatus === 'error'
                      }
                      onPress={() => void handlePublish(d.id)}
                      aria-label={`Save ${datasetLabel(d)} to server`}
                    >
                      {publishingId === d.id
                        ? 'Saving…'
                        : d.serverSyncedAt
                          ? 'Re-save to server'
                          : 'Save to server'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    isDisabled={publishingId != null || downloading}
                    onPress={() => handleDelete(d.id)}
                  >
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
