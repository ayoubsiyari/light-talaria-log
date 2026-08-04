import { mulberry32 } from './math/rng';

/**
 * Risk of ruin via 10k bootstrap paths of R-multiples (§6.5).
 * Ruin = equity drawdown to −ruinThresholdR (default 10R from start).
 * Seeded so same filters → same figure.
 */
export function riskOfRuinPercent(
  rValues: Float64Array,
  seed: number,
  opts?: { paths?: number; ruinR?: number; careerLen?: number },
): number | null {
  const n = rValues.length;
  if (n < 1) return null;
  const paths = opts?.paths ?? 10_000;
  const ruinR = opts?.ruinR ?? 10;
  // Cap career length so 100k-trade journals stay within the 300 ms recompute budget.
  const career = Math.min(n, opts?.careerLen ?? 500);
  const rng = mulberry32(seed);
  let ruined = 0;
  for (let p = 0; p < paths; p++) {
    let eq = 0;
    for (let i = 0; i < career; i++) {
      const pick = (rng() * n) | 0;
      eq += rValues[pick]!;
      if (eq <= -ruinR) {
        ruined++;
        break;
      }
    }
  }
  return (ruined / paths) * 100;
}
