/** Welford online moments — stable variance / skew / kurtosis (§6.3). */

export interface WelfordState {
  n: number;
  mean: number;
  m2: number;
  m3: number;
  m4: number;
}

export function welfordInit(): WelfordState {
  return { n: 0, mean: 0, m2: 0, m3: 0, m4: 0 };
}

export function welfordPush(s: WelfordState, x: number): void {
  if (!Number.isFinite(x)) return;
  const n1 = s.n + 1;
  const d = x - s.mean;
  const dN = d / n1;
  const dN2 = dN * dN;
  const term1 = d * dN * s.n;
  s.m4 +=
    term1 * dN2 * (s.n * s.n - 3 * s.n + 3) +
    6 * dN2 * s.m2 -
    4 * dN * s.m3;
  s.m3 += term1 * dN * (s.n - 2) - 3 * dN * s.m2;
  s.m2 += term1;
  s.mean += dN;
  s.n = n1;
}

export function welfordVariance(s: WelfordState, sample = true): number {
  if (s.n < 2) return 0;
  return sample ? s.m2 / (s.n - 1) : s.m2 / s.n;
}

export function welfordStd(s: WelfordState, sample = true): number {
  return Math.sqrt(Math.max(0, welfordVariance(s, sample)));
}

export function welfordSkew(s: WelfordState): number | null {
  if (s.n < 3 || s.m2 <= 0) return null;
  return (Math.sqrt(s.n) * s.m3) / Math.pow(s.m2, 1.5);
}

/** Excess kurtosis. */
export function welfordKurtosis(s: WelfordState): number | null {
  if (s.n < 4 || s.m2 <= 0) return null;
  return (s.n * s.m4) / (s.m2 * s.m2) - 3;
}
