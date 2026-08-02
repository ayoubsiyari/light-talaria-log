import type { Plugin, Connect } from 'vite';
import { getHistoricalRates } from 'dukascopy-node';
import type { InstrumentType, TimeframeType } from 'dukascopy-node';

const MAX_SPAN_DAYS = 365;
/** Keep in sync with src/datasets/ingestLimits.ts HARD_MAX_ESTIMATED_ROWS */
const HARD_MAX_ESTIMATED_ROWS = 550_000;

const TF_MINUTES: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1D': 1440,
};

function estimateRows(from: string, to: string, timeframe: string): number {
  const mins = TF_MINUTES[timeframe];
  if (!mins) return 0;
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T23:59:59Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  const days = (end - start) / (24 * 60 * 60 * 1000);
  return Math.ceil(days * ((24 * 60) / mins));
}

const PAIR_TO_INSTRUMENT: Record<string, InstrumentType> = {
  'EUR/USD': 'eurusd',
  'GBP/USD': 'gbpusd',
  'USD/JPY': 'usdjpy',
  'USD/CHF': 'usdchf',
  'AUD/USD': 'audusd',
  'USD/CAD': 'usdcad',
  'NZD/USD': 'nzdusd',
  'EUR/JPY': 'eurjpy',
  'GBP/JPY': 'gbpjpy',
  'XAU/USD': 'xauusd',
};

const TF_TO_DUKA: Record<string, TimeframeType> = {
  '1m': 'm1',
  '5m': 'm5',
  '15m': 'm15',
  '1h': 'h1',
  '4h': 'h4',
  '1D': 'd1',
};

interface DownloadBody {
  pair?: string;
  timeframe?: string;
  from?: string;
  to?: string;
}

function readJsonBody(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: Connect.ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function validateDates(from: string, to: string): string | null {
  if (!from || !to) return 'Start and end dates are required.';
  if (from > to) return 'Start date must be on or before end date.';
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T23:59:59Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Invalid date.';
  const spanDays = (end - start) / (24 * 60 * 60 * 1000);
  if (spanDays > MAX_SPAN_DAYS) return `Range cannot exceed ${MAX_SPAN_DAYS} days.`;
  return null;
}

async function handleDownload(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body: DownloadBody;
  try {
    body = (await readJsonBody(req)) as DownloadBody;
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const pair = body.pair ?? '';
  const timeframe = body.timeframe ?? '';
  const from = body.from ?? '';
  const to = body.to ?? '';

  const instrument = PAIR_TO_INSTRUMENT[pair];
  const dukaTf = TF_TO_DUKA[timeframe];
  if (!instrument) {
    sendJson(res, 400, { error: `Unsupported pair: ${pair}` });
    return;
  }
  if (!dukaTf) {
    sendJson(res, 400, { error: `Unsupported timeframe: ${timeframe}` });
    return;
  }

  const dateError = validateDates(from, to);
  if (dateError) {
    sendJson(res, 400, { error: dateError });
    return;
  }

  const estimated = estimateRows(from, to, timeframe);
  if (estimated > HARD_MAX_ESTIMATED_ROWS) {
    sendJson(res, 400, {
      error: `Estimated ~${estimated.toLocaleString()} bars exceeds the safe client limit (${HARD_MAX_ESTIMATED_ROWS.toLocaleString()}). Shorten the range or use a higher timeframe.`,
    });
    return;
  }

  try {
    const csv = await getHistoricalRates({
      instrument,
      dates: { from, to },
      timeframe: dukaTf,
      format: 'csv',
      volumes: true,
      priceType: 'bid',
    });

    const lines = csv.trim().split('\n').filter(Boolean);
    // dukascopy-node CSV usually has a header row
    const rowCount = Math.max(0, lines.length - (lines[0]?.toLowerCase().includes('timestamp') || lines[0]?.toLowerCase().includes('time') ? 1 : 0));

    sendJson(res, 200, {
      csv,
      rowCount,
      pair,
      timeframe,
      startDate: from,
      endDate: to,
      source: 'dukascopy',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Dukascopy download failed';
    sendJson(res, 502, { error: message });
  }
}

function attachDukascopyMiddleware(middlewares: Connect.Server): void {
  middlewares.use((req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/dukascopy') {
      next();
      return;
    }
    void handleDownload(req, res);
  });
}

/** Vite middleware: POST /api/dukascopy → dukascopy-node CSV download. */
export function dukascopyApiPlugin(): Plugin {
  return {
    name: 'fast-chart-dukascopy-api',
    configureServer(server) {
      attachDukascopyMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachDukascopyMiddleware(server.middlewares);
    },
  };
}
