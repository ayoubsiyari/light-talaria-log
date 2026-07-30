/**
 * Lightweight perf sampling for Phase 4 gates.
 * Dev-oriented — never allocate heavy structures; no chart data copies.
 */

export interface PerfSnapshot {
  /**
   * Chart paint rate (engine schedulePaint → rAF).
   * Idle chart can be low (good). While pan/zoom should approach display Hz.
   */
  paintFps: number;
  /**
   * Main-thread animation frame rate (display budget).
   * Persistently ~30 usually means power-save display or main-thread pressure.
   */
  rafHz: number;
  /** JS heap used (MB), Chromium only; null if unavailable */
  heapUsedMb: number | null;
  /** JS heap limit (MB), Chromium only */
  heapLimitMb: number | null;
  /** Sum of ChartBar[] lengths across panes (viewport RAM proxy) */
  barsInMemory: number;
  paneCount: number;
  at: number;
}

type MemoryInfo = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

const WINDOW_MS = 2000;

function readHeap(): { usedMb: number; limitMb: number } | null {
  const perf = performance as Performance & { memory?: MemoryInfo };
  const mem = perf.memory;
  if (!mem || typeof mem.usedJSHeapSize !== 'number') return null;
  return {
    usedMb: mem.usedJSHeapSize / (1024 * 1024),
    limitMb: mem.jsHeapSizeLimit / (1024 * 1024),
  };
}

function fpsFromStamps(stamps: number[]): number {
  if (stamps.length < 2) return 0;
  const first = stamps[0]!;
  const last = stamps[stamps.length - 1]!;
  const dt = (last - first) / 1000;
  if (dt <= 0) return 0;
  return (stamps.length - 1) / dt;
}

function pushStamp(stamps: number[], t: number): void {
  stamps.push(t);
  const cutoff = t - WINDOW_MS;
  while (stamps.length > 0 && stamps[0]! < cutoff) stamps.shift();
}

/** Display / main-thread rAF rate. */
export function createRafHzSampler(): {
  start: () => void;
  stop: () => void;
  getHz: () => number;
} {
  const stamps: number[] = [];
  let raf = 0;
  let running = false;

  const tick = (t: number) => {
    pushStamp(stamps, t);
    if (running) raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      stamps.length = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    },
    getHz: () => fpsFromStamps(stamps),
  };
}

/**
 * Chart paint FPS — engines call markChartPaint() from their paint rAF.
 * Shared across all panes.
 */
const paintStamps: number[] = [];

export function markChartPaint(now = performance.now()): void {
  if (!import.meta.env.DEV) return;
  pushStamp(paintStamps, now);
}

export function getPaintFps(): number {
  return fpsFromStamps(paintStamps);
}

export function samplePerf(input: {
  barsInMemory: number;
  paneCount: number;
  paintFps: number;
  rafHz: number;
}): PerfSnapshot {
  const heap = readHeap();
  return {
    paintFps: input.paintFps,
    rafHz: input.rafHz,
    heapUsedMb: heap ? heap.usedMb : null,
    heapLimitMb: heap ? heap.limitMb : null,
    barsInMemory: input.barsInMemory,
    paneCount: input.paneCount,
    at: Date.now(),
  };
}

export function formatPerfLine(s: PerfSnapshot): string {
  const heap =
    s.heapUsedMb != null
      ? `${s.heapUsedMb.toFixed(1)} / ${s.heapLimitMb?.toFixed(0) ?? '?'} MB`
      : 'heap n/a (use Chromium)';
  return `paint ${s.paintFps.toFixed(0)} · rAF ${s.rafHz.toFixed(0)} · ${heap} · bars ${s.barsInMemory} · panes ${s.paneCount}`;
}

export type TalariaPerfApi = {
  sample: () => PerfSnapshot | null;
  log: () => void;
};

declare global {
  interface Window {
    __talariaPerf?: TalariaPerfApi;
  }
}
