import type { ChartBar, VisibleRange } from '@/types/bar';

/** Nice step: 1 / 2 / 5 × 10^n covering the range with ~approxCount ticks. */
export function nicePriceTicks(min: number, max: number, approxCount = 6): number[] {
  if (!(max > min) || approxCount < 2) return [min, max];

  const span = max - min;
  const raw = span / approxCount;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  let step: number;
  if (frac <= 1) step = 1 * pow;
  else if (frac <= 2) step = 2 * pow;
  else if (frac <= 5) step = 5 * pow;
  else step = 10 * pow;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  const end = max + step * 0.5;
  for (let v = start; v <= end; v += step) {
    const rounded = roundToStep(v, step);
    if (rounded >= min - step * 1e-9 && rounded <= max + step * 1e-9) {
      ticks.push(rounded);
    }
    if (ticks.length > 50) break;
  }
  return ticks.length > 0 ? ticks : [min, max];
}

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  const f = Math.pow(10, Math.min(12, decimals));
  return Math.round(value * f) / f;
}

export interface TimeTick {
  /** Logical bar index — integer so each line sits on a candle center. */
  index: number;
  time: number;
  /** Stroke opacity 0..1. */
  alpha: number;
  /** Axis label candidate (at-or-coarser than ideal spacing). */
  label: boolean;
}

/** @deprecated accepted for paint-state compat; unused. */
export interface TimeLatticeSticky {
  exp: number;
}

export interface NiceTimeTicksOpts {
  barPeriod?: number;
  sticky?: TimeLatticeSticky;
}

/** Nested lattice step: 1, 2, 4, 8, … */
export function nestedIndexStep(raw: number): number {
  const n = Math.max(1, raw);
  const exp = Math.max(0, Math.floor(Math.log2(n)));
  return 2 ** exp;
}

function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Fade denser lattices across this many octaves (wider = less zoom snap). */
const FADE_OCTAVES = 3;

/**
 * Opacity for a power-of-two step given ideal bars-per-line.
 * Continuous in `ideal` — no floor/octave pop on zoom in or out.
 *
 * - step >= ideal → solid (coarser than needed)
 * - denser within FADE_OCTAVES → smooth fade (ease-out so minors linger)
 * - denser than that → hidden
 */
export function stepAlpha(step: number, ideal: number): number {
  if (!(step > 0) || !(ideal > 0)) return 0;
  const rel = Math.log2(ideal) - Math.log2(step);
  if (rel <= 0) return 1;
  if (rel >= FADE_OCTAVES) return 0;
  // Ease-out: denser lines stay readable longer while zooming, then taper.
  const t = smoothstep01(rel / FADE_OCTAVES);
  return 1 - t * t;
}

export function seriesBarPeriod(bars: readonly ChartBar[]): number {
  if (bars.length < 2) return 60;
  const samples: number[] = [];
  const hi = bars.length - 1;
  const lo = Math.max(0, hi - Math.min(64, hi));
  for (let i = lo; i < hi; i++) {
    const d = bars[i + 1]!.time - bars[i]!.time;
    if (d > 0) samples.push(d);
  }
  if (samples.length === 0) {
    const d0 = bars[1]!.time - bars[0]!.time;
    return d0 > 0 ? Math.max(1, d0) : 60;
  }
  samples.sort((a, b) => a - b);
  return Math.max(1, samples[Math.floor(samples.length / 2)]! || 60);
}

export function resolveBarPeriod(
  bars: readonly ChartBar[],
  preferredSec?: number,
): number {
  const median = seriesBarPeriod(bars);
  if (preferredSec == null || !(preferredSec > 0)) return median;
  if (median <= preferredSec * 2.5 && median >= preferredSec * 0.4) {
    return preferredSec;
  }
  return median;
}

function timeAtLogicalIndex(
  bars: readonly ChartBar[],
  index: number,
  period: number,
): number {
  if (bars.length === 0) return 0;
  if (index >= 0 && index < bars.length) {
    const lo = Math.floor(index);
    const hi = Math.min(bars.length - 1, lo + 1);
    if (lo === hi || lo < 0) return bars[Math.max(0, lo)]!.time;
    const frac = index - lo;
    return bars[lo]!.time + (bars[hi]!.time - bars[lo]!.time) * frac;
  }
  if (index >= bars.length) {
    const tip = bars.length - 1;
    return bars[tip]!.time + (index - tip) * period;
  }
  return bars[0]!.time + index * period;
}

function pushLattice(
  ticks: TimeTick[],
  range: VisibleRange,
  bars: readonly ChartBar[],
  period: number,
  baseSeq: number,
  step: number,
  alpha: number,
  label: boolean,
  seen: Map<number, TimeTick>,
): void {
  if (step < 1 || alpha < 0.02) return;
  const phase = ((baseSeq % step) + step) % step;
  let index = Math.ceil((range.fromIndex + phase) / step) * step - phase;
  if (index < range.fromIndex - 1e-9) index += step;
  index = Math.round(index);

  for (; index < range.toIndex - 1e-9; index += step) {
    const prev = seen.get(index);
    if (prev) {
      // Keep the stronger stroke; promote label if either level wants it.
      if (alpha > prev.alpha) prev.alpha = alpha;
      if (label) prev.label = true;
      continue;
    }
    const tick: TimeTick = {
      index,
      time: timeAtLogicalIndex(bars, index, period),
      alpha,
      label,
    };
    seen.set(index, tick);
    ticks.push(tick);
    if (ticks.length > 80) break;
  }
}

/**
 * Candle-aligned grid — continuous zoom opacity (no octave handoff snap).
 *
 * Ideal spacing = visibleSpan / approxCount. Each power-of-two lattice gets an
 * alpha from {@link stepAlpha} so zoom-in fades denser lines in instead of
 * popping a new lattice at the floor(log2) boundary.
 */
export function niceTimeTicks(
  range: VisibleRange,
  bars: readonly ChartBar[],
  approxCount = 8,
  opts?: NiceTimeTicksOpts,
): TimeTick[] {
  if (bars.length === 0 || range.toIndex <= range.fromIndex) return [];

  const span = range.toIndex - range.fromIndex;
  const period = resolveBarPeriod(bars, opts?.barPeriod);
  // Lattice phase from the tip (stable) — bars[0] slides under Play fill-ahead
  // and used to re-phase the grid while candles stayed put (labels looked like
  // they were drifting independently of the strokes).
  const tipIdx = bars.length - 1;
  const baseSeq = Math.round(bars[tipIdx]!.time / period) - tipIdx;
  const ideal = Math.max(1e-6, span / Math.max(2, approxCount));

  const ticks: TimeTick[] = [];
  const seen = new Map<number, TimeTick>();

  // Enough octaves to cover pad + dense zoom-in (step 1 … 2048).
  for (let exp = 0; exp <= 11; exp++) {
    const step = 2 ** exp;
    const alpha = stepAlpha(step, ideal);
    if (alpha < 0.02) continue;
    // Axis labels only on solid (at-or-coarser) lattices — keeps the time axis
    // readable. Grid strokes still fade denser steps for smooth zoom.
    const label = alpha >= 0.99;
    pushLattice(ticks, range, bars, period, baseSeq, step, alpha, label, seen);
  }

  ticks.sort((a, b) => a.index - b.index);

  if (ticks.length === 0) {
    const mid = Math.round((range.fromIndex + range.toIndex) / 2);
    ticks.push({
      index: mid,
      time: timeAtLogicalIndex(bars, mid, period),
      alpha: 1,
      label: true,
    });
  }

  return ticks;
}
