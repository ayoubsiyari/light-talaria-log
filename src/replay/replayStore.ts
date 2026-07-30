import { timeframeSeconds } from '@/data/timeframeAgg';
import type { Timeframe } from '@/types/ui';

export type ReplayListener = (state: ReplayState) => void;

export interface ReplayState {
  playing: boolean;
  /** Bars per second at the active TF */
  speed: number;
  cursorTime: number;
  startTime: number;
  endTime: number;
  windowSec: number;
}

export interface ReplayController {
  get(): ReplayState;
  subscribe(cb: ReplayListener): () => void;
  /** Set bounds without notifying (session load). */
  configure(startTime: number, endTime: number, windowSec: number): void;
  setActiveTf(tf: Timeframe): void;
  play(): void;
  pause(): void;
  toggle(): void;
  step(deltaBars: number): void;
  setSpeed(speed: number): void;
  /** Seek cursor; pass silent to skip listeners (session load). */
  seek(time: number, opts?: { silent?: boolean }): void;
  dispose(): void;
}

function snapToBar(time: number, periodSec: number, startTime: number): number {
  if (periodSec <= 0) return time;
  const origin = Math.floor(startTime / periodSec) * periodSec;
  const steps = Math.round((time - origin) / periodSec);
  return origin + steps * periodSec;
}

/**
 * Replay cursor outside the chart engines — advances one bar at a time.
 */
export function createReplayController(): ReplayController {
  let state: ReplayState = {
    playing: false,
    speed: 4,
    cursorTime: 0,
    startTime: 0,
    endTime: 0,
    windowSec: 60 * 60 * 24,
  };

  /** Step size TF — always the finest pane TF in multi-chart replay. */
  let activeTf: Timeframe = '1m';
  const listeners = new Set<ReplayListener>();
  let raf = 0;
  let lastTs = 0;
  /** Accumulated ms waiting for the next whole bar step */
  let barCarryMs = 0;

  const notify = () => {
    for (const cb of listeners) cb(state);
  };

  const periodSec = () => timeframeSeconds(activeTf);

  const stopRaf = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTs = 0;
    barCarryMs = 0;
  };

  const advanceBars = (barCount: number) => {
    const period = periodSec();
    const delta = period * barCount;
    const next = Math.min(state.endTime, state.cursorTime + delta);
    const snapped = Math.min(
      state.endTime,
      snapToBar(next, period, state.startTime),
    );
    if (snapped === state.cursorTime && snapped >= state.endTime) {
      state = { ...state, playing: false, cursorTime: state.endTime };
      notify();
      stopRaf();
      return false;
    }
    if (snapped !== state.cursorTime) {
      state = { ...state, cursorTime: snapped };
      notify();
    }
    if (state.cursorTime >= state.endTime) {
      state = { ...state, playing: false, cursorTime: state.endTime };
      notify();
      stopRaf();
      return false;
    }
    return true;
  };

  const tick = (ts: number) => {
    if (!state.playing) return;
    if (lastTs === 0) {
      lastTs = ts;
      raf = requestAnimationFrame(tick);
      return;
    }
    const dtMs = ts - lastTs;
    lastTs = ts;
    barCarryMs += dtMs;

    // speed = bars/sec → ms per bar; always reveal exactly one candle per step
    const msPerBar = 1000 / Math.max(1, state.speed);
    if (barCarryMs >= msPerBar) {
      barCarryMs -= msPerBar;
      // Drop excess carry so we never skip candles when the tab hitchs
      if (barCarryMs > msPerBar * 2) barCarryMs = 0;
      if (!advanceBars(1)) return;
    }
    raf = requestAnimationFrame(tick);
  };

  return {
    get: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    configure(startTime, endTime, windowSec) {
      const period = periodSec();
      state = {
        ...state,
        playing: false,
        startTime,
        endTime,
        windowSec,
        cursorTime: snapToBar(endTime, period, startTime),
      };
      stopRaf();
    },
    setActiveTf(tf) {
      if (activeTf === tf) return;
      activeTf = tf;
      // Keep cursor on the new grid so stepping never skips mid-candle
      const period = timeframeSeconds(tf);
      const snapped = snapToBar(state.cursorTime, period, state.startTime);
      if (snapped !== state.cursorTime) {
        state = {
          ...state,
          cursorTime: Math.min(state.endTime, Math.max(state.startTime, snapped)),
        };
        notify();
      }
    },
    play() {
      if (state.playing) return;
      const period = periodSec();
      // Resume from pause/scrub. Restart only when finished (or still at end
      // after session load — configure parks the cursor at endTime).
      const finished = state.cursorTime >= state.endTime;
      const cursorTime = finished
        ? snapToBar(state.startTime, period, state.startTime)
        : snapToBar(state.cursorTime, period, state.startTime);
      state = {
        ...state,
        playing: true,
        cursorTime,
      };
      notify();
      lastTs = 0;
      barCarryMs = 0;
      raf = requestAnimationFrame(tick);
    },
    pause() {
      if (!state.playing) return;
      state = { ...state, playing: false };
      stopRaf();
      notify();
    },
    toggle() {
      if (state.playing) this.pause();
      else this.play();
    },
    step(deltaBars) {
      const period = periodSec();
      const cursorTime = Math.min(
        state.endTime,
        Math.max(
          state.startTime,
          snapToBar(state.cursorTime + period * deltaBars, period, state.startTime),
        ),
      );
      state = { ...state, cursorTime, playing: false };
      stopRaf();
      notify();
    },
    setSpeed(speed) {
      const next = Math.max(1, Math.min(100, speed));
      if (next === state.speed) return;
      state = { ...state, speed: next };
      notify();
    },
    seek(time, opts) {
      const period = periodSec();
      const cursorTime = Math.min(
        state.endTime,
        Math.max(state.startTime, snapToBar(time, period, state.startTime)),
      );
      const wasPlaying = state.playing;
      if (cursorTime === state.cursorTime && !wasPlaying) {
        if (!opts?.silent) notify();
        return;
      }
      // Scrub / jump always pauses so the camera doesn't race the seek
      stopRaf();
      state = { ...state, cursorTime, playing: false };
      if (!opts?.silent) notify();
    },
    dispose() {
      stopRaf();
      listeners.clear();
    },
  };
}
