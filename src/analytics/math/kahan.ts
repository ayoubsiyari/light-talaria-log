/** Kahan compensated summation for money totals (§6.3). */

export interface KahanState {
  sum: number;
  c: number;
}

export function kahanInit(start = 0): KahanState {
  return { sum: start, c: 0 };
}

export function kahanAdd(s: KahanState, x: number): void {
  if (!Number.isFinite(x)) return;
  const y = x - s.c;
  const t = s.sum + y;
  s.c = t - s.sum - y;
  s.sum = t;
}

export function kahanValue(s: KahanState): number {
  return s.sum;
}
