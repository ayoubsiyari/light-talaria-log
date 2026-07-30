/**
 * Phase 6 property tests — TF switch invariants.
 * Run: npm run test:session
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { bucketStart, timeframeSeconds } from '@/data/timeframeAgg';
import { createSessionController } from '@/session/sessionController';
import { warmCache } from '@/session/warmCache';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';

const TFS: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];
const DS = 'test-ds';
const BASE: Timeframe = '1m';

function makeBaseBars(t0: number, count: number): ChartBar[] {
  const period = timeframeSeconds(BASE);
  const bars: ChartBar[] = [];
  for (let i = 0; i < count; i++) {
    const t = t0 + i * period;
    const px = 1.1 + (i % 50) * 0.0001;
    bars.push({
      time: t,
      open: px,
      high: px + 0.0002,
      low: px - 0.0002,
      close: px + 0.0001,
      volume: 1,
    });
  }
  return bars;
}

/** Aggregate closed buckets from base (omit trailing partial). */
function aggregate(base: readonly ChartBar[], tf: Timeframe): ChartBar[] {
  if (tf === BASE) return base.slice() as ChartBar[];
  const period = timeframeSeconds(tf);
  const out: ChartBar[] = [];
  let bucket = Number.NaN;
  let open = 0;
  let high = 0;
  let low = 0;
  let close = 0;
  let volume = 0;
  let has = false;
  const flush = () => {
    if (!has) return;
    out.push({ time: bucket, open, high, low, close, volume });
    has = false;
  };
  for (const b of base) {
    const bs = bucketStart(b.time, period);
    if (!has || bs !== bucket) {
      flush();
      bucket = bs;
      open = b.open;
      high = b.high;
      low = b.low;
      close = b.close;
      volume = b.volume ?? 0;
      has = true;
    } else {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      close = b.close;
      volume += b.volume ?? 0;
    }
  }
  return out;
}

function seedCache(base: ChartBar[], cursorTime: number): void {
  warmCache.clear();
  for (const tf of TFS) {
    warmCache.put(DS, tf, aggregate(base, tf), cursorTime);
  }
}

describe('TF switch properties', () => {
  const t0 = 1_700_000_000;
  const baseBars = makeBaseBars(t0, 20_000);
  const bounds = {
    start: baseBars[0]!.time,
    end: baseBars[baseBars.length - 1]!.time,
  };

  const cursorSamples = (): number[] => {
    const period = timeframeSeconds(BASE);
    const mid = baseBars[Math.floor(baseBars.length / 2)]!.time;
    const day = timeframeSeconds('1D');
    const h4 = timeframeSeconds('4h');
    return [
      bounds.start,
      bounds.start + period,
      bucketStart(mid, h4),
      bucketStart(mid, h4) - period,
      bucketStart(mid, h4) + period,
      bucketStart(mid, day),
      mid,
      bounds.end - period,
      bounds.end,
    ];
  };

  beforeEach(() => {
    warmCache.clear();
  });

  it('6×6 TF matrix: right edge, span, non-empty, anchor', async () => {
    const originalFill = warmCache.fill.bind(warmCache);
    warmCache.fill = async (datasetId, tf, anchorTime) => {
      const bars = aggregate(baseBars, tf);
      warmCache.put(datasetId, tf, bars, anchorTime);
      return bars;
    };

    let cases = 0;
    const failures: string[] = [];

    try {
      for (const tfFrom of TFS) {
        for (const tfTo of TFS) {
          for (const cursorTime of cursorSamples()) {
            for (const span of [50, 120, 500]) {
              for (const revealMode of ['replay', 'full'] as const) {
                cases += 1;
                const cursor = Math.min(bounds.end, Math.max(bounds.start, cursorTime));
                seedCache(baseBars, cursor);

                const ctrl = createSessionController();
                await ctrl.configure({
                  baseTf: BASE,
                  bounds,
                  panes: {
                    'pane-0': {
                      datasetId: DS,
                      tf: tfFrom,
                      selectedTf: tfFrom,
                      pair: 'EURUSD',
                    },
                  },
                  activePaneId: 'pane-0',
                  cursorTime: cursor,
                  availableTfs: TFS,
                  revealMode,
                  span,
                });

                const anchorBefore = ctrl.get()!.anchorTime;
                ctrl.setPaneTimeframe('pane-0', tfTo);
                const s = ctrl.get()!;
                const view = ctrl.getViews()['pane-0'];
                const tag = `${tfFrom}→${tfTo} mode=${revealMode} cursor=${cursor} span=${span}`;

                if (!view) {
                  failures.push(`${tag}: no view`);
                  ctrl.dispose();
                  continue;
                }

                if (view.bars.length < 1) {
                  failures.push(`${tag}: painted bars < 1`);
                } else if (revealMode === 'replay') {
                  const open = bucketStart(s.cursorTime, timeframeSeconds(tfTo));
                  const last = view.bars[view.bars.length - 1]!;
                  if (last.time > open) {
                    failures.push(
                      `${tag}: right edge ${last.time} > open bucket ${open}`,
                    );
                  }
                }

                if (view.bars.length > 0) {
                  const sliced = view.bars.slice(
                    view.range.fromIndex,
                    view.range.toIndex + 1,
                  );
                  const expected = Math.min(span, view.bars.length);
                  if (sliced.length !== expected) {
                    failures.push(
                      `${tag}: visible count ${sliced.length} !== min(span,avail)=${expected}`,
                    );
                  }
                }

                const periodTo = timeframeSeconds(tfTo);
                const anchorDelta = Math.abs(s.anchorTime - anchorBefore);
                const replayClamp =
                  revealMode === 'replay' &&
                  s.anchorTime === Math.min(anchorBefore, s.cursorTime);
                if (anchorDelta > periodTo && !replayClamp) {
                  failures.push(
                    `${tag}: anchor ${anchorBefore}→${s.anchorTime} (>1 period)`,
                  );
                }

                ctrl.dispose();
              }
            }
          }
        }
      }
    } finally {
      warmCache.fill = originalFill;
      warmCache.clear();
    }

    assert.ok(cases >= 6 * 6 * cursorSamples().length);
    assert.equal(
      failures.length,
      0,
      `${failures.length}/${cases} failed\n` + failures.slice(0, 50).join('\n'),
    );
  });
});
