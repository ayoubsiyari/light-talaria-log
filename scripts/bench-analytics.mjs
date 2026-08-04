/**
 * Analytics Phase 1/2/5 budgets on 100k synthetic trades.
 * Run: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/bench-analytics.mjs
 */
import { performance } from 'node:perf_hooks';
import { generateSyntheticTrades } from '../src/analytics/fixture.ts';
import { buildTradeStore, estimateStoreBytes } from '../src/analytics/tradeStore.ts';
import { computeFilterMask } from '../src/analytics/filterMask.ts';
import { accumulate } from '../src/analytics/accumulators.ts';
import { deriveMetrics, extractRSample } from '../src/analytics/metrics.ts';
import { lttbIndices } from '../src/analytics/math/lttb.ts';
import { EMPTY_FILTER } from '../src/analytics/types.ts';

function ms(label, fn, budget) {
  const t0 = performance.now();
  const result = fn();
  const elapsed = performance.now() - t0;
  const pass = budget == null || elapsed <= budget;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${label}: ${elapsed.toFixed(1)} ms` +
      (budget != null ? ` (budget ${budget} ms)` : ''),
  );
  return { elapsed, result, pass };
}

const trades = generateSyntheticTrades({ n: 100_000, seed: 99 });
const build = ms('Build columnar store (100k)', () => buildTradeStore(trades), 500);
const store = build.result;
const bytes = estimateStoreBytes(store);
const memPass = bytes < 11 * 1024 * 1024;
console.log(
  `${memPass ? 'PASS' : 'FAIL'} Columnar memory: ${(bytes / (1024 * 1024)).toFixed(2)} MB (budget 11 MB w/ risk+entry bars)`,
);

const filter = { ...EMPTY_FILTER, sides: { long: true, short: true } };
const mask = computeFilterMask(store, filter);
const full = ms('Full accumulate + derive (100k)', () => {
  const acc = accumulate(store, mask);
  const rSample = extractRSample(store, acc.selectedIndex);
  deriveMetrics(acc, store, { rSample, mcSeed: 1 });
  return acc;
}, 300);

const filterChange = ms('Filter change (shorts only)', () => {
  const m = computeFilterMask(store, {
    ...EMPTY_FILTER,
    sides: { long: false, short: true },
  });
  return accumulate(store, m);
}, 150);

const acc = full.result;
ms('LTTB downsample equity → 2000', () => {
  return lttbIndices(acc.equity.curveTime, acc.equity.curveEquity, 2000);
}, 50);

console.log('\nDone.');
