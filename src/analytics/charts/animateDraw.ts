/** Ease-out cubic progress for chart reveal animations. */

export function easeOutCubic(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return 1 - (1 - p) ** 3;
}

/** Prefix of a series by progress (always ≥ 2 points when source is). */
export function sliceByProgress(values: Float64Array, progress: number): Float64Array {
  if (values.length <= 2) return values;
  const n = Math.max(2, Math.ceil(values.length * easeOutCubic(progress)));
  return values.subarray(0, n);
}

export function scaleByProgress(values: Float64Array, progress: number): Float64Array {
  const p = easeOutCubic(progress);
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i]! * p;
  return out;
}

/**
 * Run a paint function from progress 0→1. Returns cancel().
 * Skips animation when `prefers-reduced-motion` is set.
 */
export function runChartAnimation(
  paint: (progress: number) => void,
  opts?: { durationMs?: number; staggerMs?: number },
): () => void {
  const duration = opts?.durationMs ?? 900;
  const stagger = opts?.staggerMs ?? 0;
  const reduce =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    paint(1);
    return () => undefined;
  }

  let raf = 0;
  let start = 0;
  const tick = (now: number) => {
    if (!start) start = now + stagger;
    const t = (now - start) / duration;
    if (t < 0) {
      paint(0);
      raf = requestAnimationFrame(tick);
      return;
    }
    const p = Math.min(1, t);
    paint(easeOutCubic(p));
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
