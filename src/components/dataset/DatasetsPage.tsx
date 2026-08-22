import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card, Label } from '@heroui/react';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
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
import { clearChartBarCache } from '@/datasets/idbChunkGc';
import { publishDatasetToServer } from '@/datasets/publishDataset';
import { useAuth } from '@/auth/AuthContext';
import { fetchHealth, listRemoteDatasets } from '@/datasets/remoteApi';
import { warmCache } from '@/session/warmCache';
import {
  PAIR_OPTIONS,
  TIMEFRAME_OPTIONS,
  type PairSymbol,
} from '@/types/session';
import type { RemoteDatasetMeta } from '@/types/remoteApi';
import type { Timeframe } from '@/types/ui';

interface DatasetsPageProps {
  onGoBacktest: () => void;
  /** @deprecated Use onGoBacktest */
  onGoSessions?: () => void;
  onGoHome?: () => void;
  onGoTrades?: () => void;
  /** @deprecated Use onGoTrades */
  onGoJournal?: () => void;
  /** Inside AppShell — kept for call-site compat. */
  embedded?: boolean;
  /** Admin control plane copy + optional banner. */
  adminMode?: boolean;
  adminBanner?: ReactNode;
  /** Render body only (no AppPageFrame) — used inside Admin console. */
  bare?: boolean;
}

function defaultDates(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toIso(start), end: toIso(end) };
}

const fieldClass = 'jd-field';

export function DatasetsPage({
  onGoBacktest,
  onGoSessions,
  onGoTrades,
  onGoJournal,
  adminMode = false,
  adminBanner,
  bare = false,
}: DatasetsPageProps) {
  const goBacktest = onGoBacktest ?? onGoSessions!;
  const goTrades = onGoTrades ?? onGoJournal;
  const { user: apiUser, signOut } = useAuth();
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
  const [apiMode, setApiMode] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const refresh = () => setDatasets(listDatasets());

  const handleClearChartCache = () => {
    const ok = window.confirm(
      'Clear chart bar cache in this browser?\n\n' +
        'Removes IndexedDB candle chunks (keeps server data + dataset list). ' +
        'Next session will re-fetch a small window from the server.',
    );
    if (!ok) return;
    setClearingCache(true);
    setError(null);
    void clearChartBarCache()
      .then(() => {
        warmCache.clear();
        setStatus('Chart bar cache cleared. Server datasets are unchanged.');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not clear cache');
      })
      .finally(() => setClearingCache(false));
  };

  const loadRemote = () => {
    setRemoteStatus('loading');
    setRemoteError(null);
    void (async () => {
      try {
        const health = await fetchHealth();
        setApiMode('mode' in health && typeof health.mode === 'string' ? health.mode : null);
        const list = await listRemoteDatasets();
        setRemoteDatasets(list);
        setRemoteStatus('ready');
      } catch (err) {
        setRemoteDatasets([]);
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

  const body = (
    <div className="space-y-8">
        {adminBanner}
        {datasets.length > 0 && (
          <Card className="jd-card">
            <Card.Content className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {datasets.length} dataset{datasets.length === 1 ? '' : 's'} ready
                </p>
                <p className="text-xs text-muted mt-0.5">
                  After save-to-server, create a session — users fetch by date on Start.
                </p>
              </div>
              <button type="button" className="jd-btn jd-btn-ink shrink-0" onClick={goBacktest}>
                Create session
              </button>
            </Card.Content>
          </Card>
        )}

        <Card className="jd-card">
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
              <button
                type="button"
                className="jd-btn jd-btn-ink"
                disabled={downloading || sizeAssess.level === 'block'}
                onClick={() => void handleDownload()}
              >
                {downloading
                  ? 'Downloading…'
                  : yearChunks.length > 1
                    ? `Download ${yearChunks.length} years…`
                    : sizeAssess.level === 'confirm'
                      ? 'Download (confirm)…'
                      : 'Download'}
              </button>
              <p className="text-xs text-muted min-w-0 break-words">
                {pair} · {timeframe} · {startDate} → {endDate}
                {sizeAssess.estimatedRows > 0
                  ? ` · ~${sizeAssess.estimatedRows.toLocaleString()} bars`
                  : ''}
              </p>
            </div>
          </Card.Content>
        </Card>

        {remoteStatus === 'ready' && apiUser && (
          <Card className="jd-card">
            <Card.Header className="px-6 pt-6 pb-2">
              <Card.Title className="text-lg">API session</Card.Title>
              <Card.Description className="text-muted text-sm">
                {apiMode === 'saas-level-2'
                  ? 'Level-2 SaaS cookie session.'
                  : 'Dev stub cookie session. Account: Profile → Sign out.'}
              </Card.Description>
            </Card.Header>
            <Card.Content className="px-6 pb-6">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm min-w-0 flex-1">
                  Signed in as <span className="font-medium">{apiUser.email}</span>
                  {apiUser.displayName ? ` · ${apiUser.displayName}` : ''}
                </p>
                <button
                  type="button"
                  className="jd-btn jd-btn-ghost"
                  disabled={authBusy}
                  onClick={() => {
                    setAuthBusy(true);
                    void signOut()
                      .then(() => loadRemote())
                      .finally(() => setAuthBusy(false));
                  }}
                >
                  Sign out
                </button>
              </div>
            </Card.Content>
          </Card>
        )}

        <Card className="jd-card">
          <Card.Header className="px-6 pt-6 pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <Card.Title className="text-lg">Warm cache (optional)</Card.Title>
                <Card.Description className="text-muted text-sm">
                  Optional full pull into this browser. Not required — Create Session fetches
                  by date from the server when you start.
                </Card.Description>
              </div>
              <button
                type="button"
                className="jd-btn jd-btn-ghost shrink-0"
                onClick={loadRemote}
                disabled={remoteStatus === 'loading' || importingId != null}
              >
                {remoteStatus === 'loading' ? 'Checking…' : 'Refresh'}
              </button>
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
                    <li key={r.id} className="jd-row flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <p className="text-xs text-muted tabular-nums break-words">
                          {r.symbol} · {tfs} · {rows.toLocaleString()} bars
                          {imported ? ' · imported' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={imported ? 'jd-btn jd-btn-ghost' : 'jd-btn jd-btn-ink'}
                        onClick={() => void handleImportRemote(r)}
                        disabled={importingId != null}
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
                      </button>
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

        <Card className="jd-card">
          <Card.Header className="px-6 pt-6 pb-2">
            <Card.Title className="text-lg">Browser cache</Card.Title>
            <Card.Description className="text-muted text-sm">
              Long replay keeps only a sliding window of chunks in IndexedDB (~8 per
              series). Use this if you want to free disk immediately.
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-6 pb-6">
            <button
              type="button"
              className="jd-btn jd-btn-ghost"
              disabled={clearingCache || downloading || publishingId != null}
              onClick={handleClearChartCache}
            >
              {clearingCache ? 'Clearing…' : 'Clear chart cache'}
            </button>
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
                  className="jd-row flex flex-wrap items-center gap-3 px-4 py-3"
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
                    <button
                      type="button"
                      className="jd-btn jd-btn-ghost"
                      disabled={
                        downloading ||
                        publishingId != null ||
                        remoteStatus === 'error'
                      }
                      onClick={() => void handlePublish(d.id)}
                      aria-label={`Save ${datasetLabel(d)} to server`}
                    >
                      {publishingId === d.id
                        ? 'Saving…'
                        : d.serverSyncedAt
                          ? 'Re-save to server'
                          : 'Save to server'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="jd-btn jd-btn-ghost"
                    disabled={publishingId != null || downloading}
                    onClick={() => handleDelete(d.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
    </div>
  );

  if (bare) return body;

  return (
    <AppPageFrame
      narrow
      eyebrow={adminMode ? 'Admin' : 'App'}
      title={adminMode ? 'Dataset management' : 'Datasets'}
      description={
        adminMode
          ? 'Download Dukascopy history, publish to the server, import shared datasets, and clear caches. Regular users only consume published data when creating a session.'
          : 'Download Dukascopy history and save it to the server. Create a backtest with dates — the chart fetches only that range.'
      }
      actions={
        <>
          <button type="button" className="jd-btn jd-btn-ghost" onClick={goBacktest}>
            Backtest
          </button>
          {goTrades && (
            <button type="button" className="jd-btn jd-btn-ghost" onClick={goTrades}>
              Chart trades
            </button>
          )}
        </>
      }
    >
      {body}
    </AppPageFrame>
  );
}
