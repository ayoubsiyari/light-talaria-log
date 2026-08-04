/**
 * Minimal Talaria score engine stub so TalariaV8b can mount.
 * Returns plausible placeholder scores from basic trade stats.
 * Full scoring can replace this later without touching the UI shell.
 */

export const DIM_KEYS = [
  'profitability',
  'edge',
  'risk',
  'consistency',
  'frequency',
  'discipline',
];

export const SCORE_CONFIG = {
  minSampleForScore: 10,
  minSampleForVariance: 20,
  edgeReproveN: 30,
  tiers: [
    [90, 'ELITE'],
    [80, 'STRONG'],
    [70, 'SOLID'],
    [60, 'DEVELOPING'],
    [0, 'WEAK'],
  ],
  weights: {
    profitability: { strat: 0.22, exec: 0.1 },
    edge: { strat: 0.2, exec: 0.15 },
    risk: { strat: 0.18, exec: 0.2 },
    consistency: { strat: 0.15, exec: 0.15 },
    frequency: { strat: 0.1, exec: 0.1 },
    discipline: { strat: 0.15, exec: 0.3 },
  },
};

function clamp(n, lo = 0, hi = 100) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.max(lo, Math.min(hi, Number(n)));
}

function dimFromCtx(ctx) {
  const n = ctx?.n ?? 0;
  const insufficient = n < SCORE_CONFIG.minSampleForScore;
  const pf = Number(ctx?.profitFactor) || 0;
  const wr = Number(ctx?.winRate) || 0;
  const exp = Number(ctx?.expectancyR) || 0;
  const dd = Number(ctx?.maxDrawdownPct) || 0;
  const r2 = Number(ctx?.equityR2) || 0;
  const rule = Number(ctx?.ruleAdherencePct) || 0;
  const execEff = Number(ctx?.executionEfficiency) || 0;
  const freqRatio =
    ctx?.expectedTradesPerWeek && ctx?.actualTradesPerWeek
      ? Math.min(
          1,
          Number(ctx.actualTradesPerWeek) / Math.max(1, Number(ctx.expectedTradesPerWeek)),
        )
      : 0.5;

  const profitability = clamp(40 + pf * 12 + (ctx?.returnPct || 0) * 0.4);
  const edge = clamp(45 + exp * 18 + wr * 0.25);
  const risk = clamp(85 - dd * 1.8);
  const consistency = clamp(30 + r2 * 55 + (ctx?.dayWinRate || 0) * 0.2);
  const frequency = clamp(35 + freqRatio * 50);
  const discipline = clamp(40 + rule * 0.4 + execEff * 25);

  const dims = {
    profitability,
    edge,
    risk,
    consistency,
    frequency,
    discipline,
  };

  const dimStates = Object.fromEntries(
    DIM_KEYS.map((key) => [
      key,
      insufficient ? 'unavailable' : dims[key] == null ? 'unavailable' : 'active',
    ]),
  );

  let strat = null;
  if (!insufficient) {
    let sum = 0;
    let wSum = 0;
    for (const key of DIM_KEYS) {
      const w = SCORE_CONFIG.weights[key]?.strat || 0;
      const v = dims[key];
      if (v == null) continue;
      sum += v * w;
      wSum += w;
    }
    strat = wSum ? clamp(sum / wSum) : null;
  }

  const mode = ctx?.mode || 'backtest';
  const liveN = Number(ctx?.liveSampleN) || 0;
  const inherited = ctx?.inheritedStratScore;
  let exec = null;
  let execState = 'unavailable';
  let stratState = insufficient ? 'unavailable' : 'active';
  let primary = 'strat';

  if (mode === 'live') {
    primary = 'exec';
    if (liveN < SCORE_CONFIG.edgeReproveN && inherited != null) {
      strat = clamp(inherited);
      stratState = 'inherited';
    }
    if (liveN >= SCORE_CONFIG.minSampleForScore) {
      exec = clamp(
        (discipline || 50) * 0.4 + (risk || 50) * 0.3 + (consistency || 50) * 0.3,
      );
      execState = 'active';
    }
  }

  const prior = ctx?.prior;
  const deltas =
    prior && strat != null
      ? {
          strat: strat - (prior.strat ?? strat),
          exec: exec != null && prior.exec != null ? exec - prior.exec : 0,
          dims: Object.fromEntries(
            DIM_KEYS.map((key) => [
              key,
              (dims[key] ?? 0) - (prior.dims?.[key] ?? dims[key] ?? 0),
            ]),
          ),
        }
      : { strat: 0, exec: 0, dims: Object.fromEntries(DIM_KEYS.map((k) => [k, 0])) };

  return {
    strat,
    exec,
    primary,
    stratState,
    execState,
    dims,
    dimStates,
    deltas,
  };
}

export function computeTalariaScore(ctx) {
  return dimFromCtx(ctx || {});
}

/**
 * Rolling score points for trend charts: [{ score, n, index }, ...]
 */
export function computeTrend(trades, ctx, windowSize = 30) {
  const rows = Array.isArray(trades) ? trades : [];
  if (rows.length === 0) return [];
  const win = Math.max(5, Number(windowSize) || 30);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const slice = rows.slice(Math.max(0, i - win + 1), i + 1);
    const scored = computeTalariaScore({
      ...(ctx || {}),
      n: slice.length,
      netPnl: slice.reduce((s, t) => s + (Number(t.pnl) || 0), 0),
    });
    out.push({
      index: i,
      n: slice.length,
      score: scored.strat,
      strat: scored.strat,
      exec: scored.exec,
    });
  }
  return out;
}
