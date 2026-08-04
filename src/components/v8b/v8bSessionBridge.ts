/**
 * Maps TalariaV8b session objects → real BacktestSession for the chart engine.
 */
import {
  registerRemoteDataset,
  remoteToDownloadedStub,
} from '@/datasets/datasetStore';
import { listRemoteDatasets } from '@/datasets/remoteApi';
import {
  commonTimeframes,
  coverageForPair,
  defaultLastMonthsCoverage,
  overlapCoverage,
  pickDatasetForRange,
} from '@/sessions/sessionOverlap';
import { createSession, getSession } from '@/sessions/sessionStore';
import type { PairSymbol, SessionLeg } from '@/types/session';
import type { BacktestSession } from '@/types/session';
import type { Timeframe } from '@/types/ui';
import { PAIR_OPTIONS } from '@/types/session';

const BRIDGE_MAP_KEY = 'talaria.v8b.bridge.v1';

export interface V8bSessionLike {
  id?: string | number;
  name?: string;
  symbol?: string;
  tickers?: string[];
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  capital?: number;
  strategyName?: string;
  strategyDesc?: string;
}

function readBridgeMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BRIDGE_MAP_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeBridgeMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(BRIDGE_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function rememberBridge(v8bId: string, sessionId: string): void {
  const map = readBridgeMap();
  map[v8bId] = sessionId;
  writeBridgeMap(map);
}

/** EURUSD → EUR/USD; XAUUSD → XAU/USD */
export function normalizeV8bTicker(raw: string): PairSymbol | null {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!t) return null;
  const withSlash = t.includes('/')
    ? t
    : t.length === 6
      ? `${t.slice(0, 3)}/${t.slice(3)}`
      : t;
  const hit = PAIR_OPTIONS.find(
    (p) =>
      p.id === withSlash ||
      p.id.replace('/', '') === t ||
      p.label.replace(/[^A-Z]/gi, '').toUpperCase() === t,
  );
  return hit?.id ?? null;
}

function mapTimeframe(raw: string | undefined): Timeframe {
  const s = String(raw || '1h')
    .trim()
    .toLowerCase();
  const table: Record<string, Timeframe> = {
    '1m': '1m',
    '1min': '1m',
    '2m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '15m',
    '1h': '1h',
    '1hr': '1h',
    '4h': '4h',
    '1d': '1D',
    d: '1D',
    day: '1D',
  };
  return table[s] ?? '1h';
}

function ymd(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * Resolve or create a chart BacktestSession from a V8b session card / form.
 */
export async function resolveChartSessionFromV8b(
  v8b: V8bSessionLike | null,
): Promise<BacktestSession> {
  if (!v8b) {
    throw new Error('No session to open. Create or select a backtest session first.');
  }

  const v8bKey = v8b.id != null ? String(v8b.id) : '';
  if (v8bKey) {
    const mapped = readBridgeMap()[v8bKey];
    if (mapped) {
      const existing = getSession(mapped);
      if (existing) return existing;
    }
  }

  const remotes = await listRemoteDatasets();
  if (remotes.length === 0) {
    throw new Error(
      'No server datasets yet. Open Datasets, publish history, then Start again.',
    );
  }

  const stubs = remotes.map(remoteToDownloadedStub);
  const tickerList =
    Array.isArray(v8b.tickers) && v8b.tickers.length > 0
      ? v8b.tickers
      : v8b.symbol
        ? [v8b.symbol]
        : [];

  let pairs = tickerList
    .map(normalizeV8bTicker)
    .filter((p): p is PairSymbol => p != null)
    .slice(0, 4);

  // Prefer pairs that exist on the server.
  const serverPairs = new Set(stubs.map((d) => d.pair));
  pairs = pairs.filter((p) => serverPairs.has(p));
  if (pairs.length === 0) {
    // Fall back to first available server pairs (up to 1).
    const first = stubs[0]?.pair;
    if (!first) {
      throw new Error('Server catalog has no usable pairs.');
    }
    pairs = [first];
  }

  const preferredTf = mapTimeframe(v8b.timeframe);
  const tfs = commonTimeframes(stubs, pairs);
  const timeframe: Timeframe =
    tfs.includes(preferredTf) ? preferredTf : (tfs[0] ?? preferredTf);

  const overlap = overlapCoverage(
    pairs.map((p) => coverageForPair(stubs, p, timeframe)),
  );
  if (!overlap) {
    throw new Error(
      `No overlapping coverage for ${pairs.join(', ')}. Check Datasets.`,
    );
  }

  let startDate = ymd(v8b.startDate);
  let endDate = ymd(v8b.endDate);
  if (!startDate || !endDate || startDate > endDate) {
    const def = defaultLastMonthsCoverage(overlap, 3);
    startDate = def.startDate;
    endDate = def.endDate;
  }
  // Clamp into overlap
  if (startDate < overlap.startDate) startDate = overlap.startDate;
  if (endDate > overlap.endDate) endDate = overlap.endDate;
  if (startDate > endDate) {
    startDate = overlap.startDate;
    endDate = overlap.endDate;
  }

  const legs: SessionLeg[] = [];
  for (const pair of pairs) {
    const ds = pickDatasetForRange(stubs, pair, timeframe, startDate, endDate);
    if (!ds) {
      throw new Error(
        `No dataset covers ${startDate} → ${endDate} for ${pair}.`,
      );
    }
    const full = remotes.find((r) => r.id === ds.id);
    if (full) registerRemoteDataset(full);
    else {
      registerRemoteDataset({
        id: ds.id,
        symbol: ds.pair,
        baseTimeframe: ds.timeframe,
        name: `${ds.pair} ${ds.timeframe}`,
        visibility: 'public_read',
        status: 'ready',
        timeStart: Math.floor(Date.parse(`${ds.startDate}T00:00:00Z`) / 1000),
        timeEnd: Math.floor(Date.parse(`${ds.endDate}T23:59:59Z`) / 1000),
        rowCounts: { [ds.timeframe]: ds.rowCount },
        timeframes: [ds.timeframe],
      });
    }
    legs.push({ pair, datasetId: ds.id });
  }

  const name =
    (v8b.name && String(v8b.name).trim()) ||
    `${pairs.join(' + ')} ${timeframe}`;

  const session = createSession({
    name,
    timeframe,
    startDate,
    endDate,
    legs,
  });

  if (v8bKey) rememberBridge(v8bKey, session.id);
  return session;
}
