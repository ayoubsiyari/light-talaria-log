/**
 * Pipeline hardening seams (I1–I4). Run:
 * node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/datasets/__tests__/pipelineHardening.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_BARS_IN_MEMORY } from '@/utils/constants';
import { loadDatasetBars, loadDatasetSeries } from '@/datasets/loadDatasetBars';
import { truncateViewportBars } from '@/datasets/viewportCap';
import { isSeriesMetaHealthy } from '@/datasets/seriesHealth';
import {
  getLastIngestMetrics,
  recordIngestMetrics,
} from '@/datasets/pipelineMetrics';
import type { SeriesMeta } from '@/types/series';

const sampleMeta = (chunkIds: string[]): SeriesMeta => ({
  datasetId: 'd1',
  timeframe: '1m',
  rowCount: 10,
  timeStart: 0,
  timeEnd: 1,
  chunkIds,
  chunkStarts: [0],
  chunkTimeStarts: [0],
  chunkTimeEnds: [1],
});

describe('pipeline hardening I1–I4', () => {
  it('quarantines loadDatasetSeries / loadDatasetBars (fail-closed)', async () => {
    await assert.rejects(() => loadDatasetSeries('any'), /Quarantined/);
    await assert.rejects(() => loadDatasetBars('any'), /Quarantined/);
  });

  it('viewport cap truncates above MAX_BARS_IN_MEMORY', () => {
    assert.equal(MAX_BARS_IN_MEMORY, 2500);
    const bars = Array.from({ length: MAX_BARS_IN_MEMORY + 100 }, (_, i) => i);
    const capped = truncateViewportBars(bars);
    assert.equal(capped.length, MAX_BARS_IN_MEMORY);
    assert.equal(capped[0], 0);
    assert.equal(capped[MAX_BARS_IN_MEMORY - 1], MAX_BARS_IN_MEMORY - 1);
    assert.equal(truncateViewportBars(bars.slice(0, 10)).length, 10);
  });

  it('isSeriesMetaHealthy requires meta + non-empty first chunk', () => {
    assert.equal(isSeriesMetaHealthy(false, sampleMeta(['c0']), new ArrayBuffer(28)), false);
    assert.equal(isSeriesMetaHealthy(true, null, new ArrayBuffer(28)), false);
    assert.equal(isSeriesMetaHealthy(true, sampleMeta([]), new ArrayBuffer(28)), false);
    assert.equal(isSeriesMetaHealthy(true, sampleMeta(['c0']), null), false);
    assert.equal(isSeriesMetaHealthy(true, sampleMeta(['c0']), new ArrayBuffer(0)), false);
    assert.equal(isSeriesMetaHealthy(true, sampleMeta(['c0']), new ArrayBuffer(28)), true);
  });

  it('records last ingest metrics for debug', () => {
    recordIngestMetrics({
      datasetId: 'd1',
      source: 'local',
      skipped: true,
      durationMs: 12.5,
      rowCount: 1000,
    });
    const last = getLastIngestMetrics();
    assert.ok(last);
    assert.equal(last.datasetId, 'd1');
    assert.equal(last.skipped, true);
    assert.equal(last.rowCount, 1000);
    assert.ok(last.at > 0);
  });
});
