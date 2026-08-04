import { timeframeSeconds } from '@/data/timeframeAgg';
import { ledgerAcquire, ledgerRelease } from '@/dev/resourceLedger';
import type { Timeframe } from '@/types/ui';

export type ReplayListener = (state: ReplayState) => void;

export interface ReplayState {
  playing: boolean;
  /** Bars per second at the *rate* TF (finest pane TF in multi-chart). */
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
  /**
   * Clock grid — finest of dataset base + open panes (1s when a second-TF
   * pane is open; otherwise usually dataset 1m).
   */
  setBaseTf(tf: Timeframe): void;
  /** Advance-rate TF — finest pane TF; converts speed into clock steps. */
  setRateTf(tf: Timeframe): void;
  /** @deprecated use setBaseTf / setRateTf — kept for call-site migration */
  setActiveTf(tf: Timeframe): void;
  play(): void;
  pause(): void;
  toggle(): void;
  step(deltaBars: number): void;
  setSpeed(speed: number): void;
  seek(time: number, opts?: { silent?: boolean; keepPlaying?: boolean }): void;
  dispose(): void;
}

function snapToBar(time: number, periodSec: number, startTime: number): number {
  if (periodSec <= 0) return time;
  const origin = Math.floor(startTime / periodSec) * periodSec;
  const steps = Math.round((time - origin) / periodSec);
  return origin + steps * periodSec;
}

/**
 * Replay cursor on the base-TF grid. Speed is interpreted in rate-TF bars/sec
 * and converted to clock steps (Phase 5 clock split).
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

  let baseTf: Timeframe = '1m';
  let rateTf: Timeframe = '1m';
  const listeners = new Set<ReplayListener>();
  let raf = 0;
  let lastTs = 0;
  let barCarryMs = 0;

  const notify = () => {
    for (const cb of listeners) {
      try {
        cb(state);
      } catch (err) {
        console.error('[replay] subscriber failed', err);
      }
    }
  };

  const clockPeriod = () => timeframeSeconds(baseTf);

  /**
   * How many clock bars equal one rate-TF bar.
   * When rate is finer than or equal to the clock (e.g. both 1s), step 1:1.
   * When rate is coarser (e.g. rate 1h, clock 1m), advance many clock bars.
   */
  const clockStepsPerRateBar = () => {
    const rateSec = timeframeSeconds(rateTf);
    const clockSec = timeframeSeconds(baseTf);
    if (rateSec <= clockSec) return 1;
    return Math.max(1, Math.round(rateSec / clockSec));
  };

  const stopRaf = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      ledgerRelease('rafLoops');
    }
    raf = 0;
    lastTs = 0;
    barCarryMs = 0;
  };

  const advanceClockBars = (clockBars: number) => {
    const period = clockPeriod();
    const delta = period * clockBars;
    const next = Math.min(state.endTime, state.cursorTime + delta);
    const snapped = Math.min(state.endTime, snapToBar(next, period, state.startTime));
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
    // This frame's raf token is consumed.
    raf = 0;
    ledgerRelease('rafLoops');
    if (!state.playing) return;
    if (lastTs === 0) {
      lastTs = ts;
      ledgerAcquire('rafLoops');
      raf = requestAnimationFrame(tick);
      return;
    }
    const dtMs = ts - lastTs;
    lastTs = ts;
    barCarryMs += dtMs;

    // speed = rate-TF bars/sec → coalesce all due steps into one notify this frame
    const msPerRateBar = 1000 / Math.max(1, state.speed);
    let rateBars = 0;
    while (barCarryMs >= msPerRateBar) {
      barCarryMs -= msPerRateBar;
      rateBars += 1;
      // Cap catch-up so a long tab-sleep doesn't jump the whole series in one frame
      if (rateBars > state.speed * 2) {
        barCarryMs = 0;
        break;
      }
    }
    const frameStart =
      typeof performance !== 'undefined' ? performance.now() : 0;
    let keepGoing = true;
    try {
      if (rateBars > 0) {
        keepGoing = advanceClockBars(clockStepsPerRateBar() * rateBars);
      }
      if (import.meta.env?.DEV && typeof performance !== 'undefined') {
        const frameMs = performance.now() - frameStart + dtMs;
        if (frameMs > 16) {
          console.warn('[replay] frame budget exceeded', {
            frameMs: Math.round(frameMs * 10) / 10,
            rateBars,
            speed: state.speed,
          });
        }
      }
    } catch (err) {
      console.error('[replay] tick failed', err);
    }
    // Always reschedule while playing — a subscriber throw must not freeze the clock.
    if (!keepGoing || !state.playing) return;
    ledgerAcquire('rafLoops');
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
      const period = clockPeriod();
      state = {
        ...state,
        playing: false,
        startTime,
        endTime,
        windowSec,
        cursorTime: snapToBar(startTime, period, startTime),
      };
      stopRaf();
    },
    setBaseTf(tf) {
      if (baseTf === tf) return;
      baseTf = tf;
      const period = clockPeriod();
      const snapped = snapToBar(state.cursorTime, period, state.startTime);
      if (snapped !== state.cursorTime) {
        state = {
          ...state,
          cursorTime: Math.min(state.endTime, Math.max(state.startTime, snapped)),
        };
        notify();
      }
    },
    setRateTf(tf) {
      rateTf = tf;
    },
    setActiveTf(tf) {
      // Legacy: treat as rate TF only — do not move the clock grid.
      rateTf = tf;
    },
    play() {
      if (state.playing) return;
      const period = clockPeriod();
      const finished = state.cursorTime >= state.endTime;
      const cursorTime = finished
        ? snapToBar(state.startTime, period, state.startTime)
        : snapToBar(state.cursorTime, period, state.startTime);
      state = { ...state, playing: true, cursorTime };
      notify();
      lastTs = 0;
      barCarryMs = 0;
      ledgerAcquire('rafLoops');
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
      const steps = clockStepsPerRateBar() * deltaBars;
      const period = clockPeriod();
      const cursorTime = Math.min(
        state.endTime,
        Math.max(
          state.startTime,
          snapToBar(state.cursorTime + period * steps, period, state.startTime),
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
      const period = clockPeriod();
      const cursorTime = Math.min(
        state.endTime,
        Math.max(state.startTime, snapToBar(time, period, state.startTime)),
      );
      const wasPlaying = state.playing;
      const keepPlaying = opts?.keepPlaying === true && wasPlaying;
      if (cursorTime === state.cursorTime && !wasPlaying) {
        if (!opts?.silent) notify();
        return;
      }
      if (cursorTime === state.cursorTime && keepPlaying) {
        return;
      }
      if (!keepPlaying) stopRaf();
      state = { ...state, cursorTime, playing: keepPlaying };
      if (!opts?.silent) notify();
      if (keepPlaying && !raf) {
        lastTs = 0;
        barCarryMs = 0;
        ledgerAcquire('rafLoops');
        raf = requestAnimationFrame(tick);
      }
    },
    dispose() {
      stopRaf();
      listeners.clear();
    },
  };
}
