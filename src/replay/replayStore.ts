import { bucketStart, timeframeSeconds } from '@/data/timeframeAgg';
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
  /** Clock grid — always dataset base TF (usually 1m). */
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
  /** True while inside tick() — seekers must not schedule a parallel rAF. */
  let inTick = false;
  let watchdogTimer = 0;
  let lastTickWall = 0;

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
   * Close of the rate-TF candle containing `time` (last base bar in that bucket).
   * Step/Play land here so higher-TF tips show full OHLC, not the bucket open.
   */
  const rateCandleClose = (time: number): number => {
    const baseP = clockPeriod();
    const rateP = Math.max(baseP, timeframeSeconds(rateTf));
    const open = bucketStart(time, rateP);
    return open + rateP - baseP;
  };

  const clearWatchdog = () => {
    if (!watchdogTimer) return;
    clearInterval(watchdogTimer);
    watchdogTimer = 0;
  };

  const scheduleTick = () => {
    if (raf) return;
    ledgerAcquire('rafLoops');
    raf = requestAnimationFrame(tick);
  };

  const armWatchdog = () => {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      if (!state.playing) {
        clearWatchdog();
        return;
      }
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      // playing=true but no frames — classic "need Pause then Play" stall.
      if (raf === 0 || (lastTickWall > 0 && now - lastTickWall > 2000)) {
        if (raf) {
          cancelAnimationFrame(raf);
          ledgerRelease('rafLoops');
          raf = 0;
        }
        lastTs = 0;
        barCarryMs = 0;
        scheduleTick();
      }
    }, 1000) as unknown as number;
  };

  const stopRaf = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      ledgerRelease('rafLoops');
    }
    raf = 0;
    lastTs = 0;
    barCarryMs = 0;
    clearWatchdog();
  };

  /**
   * Next cursor after advancing `rateBars` forward — same landing as step(+n):
   * rate-candle *closes* so higher-TF tips show full OHLC (not bucket-open stubs).
   */
  const forwardRateCursor = (from: number, rateBars: number): number => {
    const period = clockPeriod();
    const rateP = Math.max(period, timeframeSeconds(rateTf));
    const curClose = rateCandleClose(from);
    const next =
      from < curClose
        ? curClose + rateP * (rateBars - 1)
        : curClose + rateP * rateBars;
    return Math.min(
      state.endTime,
      Math.max(state.startTime, snapToBar(next, period, state.startTime)),
    );
  };

  /** Play tick: advance by rate-TF bars (speed), landing on closes like step. */
  const advanceRateBars = (rateBars: number) => {
    if (rateBars <= 0) return true;
    const next = forwardRateCursor(state.cursorTime, rateBars);
    // No forward snap (end not on grid, or zero-period) — stop instead of spinning rAF.
    if (next === state.cursorTime) {
      const atEnd = state.cursorTime >= state.endTime;
      state = {
        ...state,
        playing: false,
        cursorTime: atEnd ? state.endTime : state.cursorTime,
      };
      notify();
      stopRaf();
      return false;
    }
    state = { ...state, cursorTime: next };
    notify();
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
    lastTickWall =
      typeof performance !== 'undefined' ? performance.now() : ts;
    if (!state.playing) return;
    inTick = true;
    let keepGoing = true;
    try {
      if (lastTs === 0) {
        // Warmup frame — establish dt baseline, then reschedule below.
        lastTs = ts;
      } else {
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
        try {
          if (rateBars > 0) {
            // Land on rate-candle closes (not open + N*rate) — same as step(+n).
            // Jumping open→open left higher-TF Play tips as 1-bar stubs.
            keepGoing = advanceRateBars(rateBars);
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
      }
    } finally {
      inTick = false;
    }
    // Always reschedule while playing — a subscriber throw / gap-seek must not
    // freeze the clock (nested seek used to schedule a parallel orphan rAF).
    if (!keepGoing || !state.playing) return;
    scheduleTick();
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
      // Idempotent resume: playing=true with a dead rAF used to no-op until Pause.
      if (state.playing) {
        if (!raf) {
          lastTs = 0;
          barCarryMs = 0;
          scheduleTick();
          armWatchdog();
        }
        return;
      }
      const period = clockPeriod();
      const finished = state.cursorTime >= state.endTime;
      const cursorTime = finished
        ? snapToBar(state.startTime, period, state.startTime)
        : snapToBar(state.cursorTime, period, state.startTime);
      state = { ...state, playing: true, cursorTime };
      notify();
      lastTs = 0;
      barCarryMs = 0;
      lastTickWall = 0;
      scheduleTick();
      armWatchdog();
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
      if (deltaBars === 0) return;
      const period = clockPeriod();
      let cursorTime: number;
      if (deltaBars > 0) {
        // Same close-landing as Play — tip = full OHLC on higher TFs.
        cursorTime = forwardRateCursor(state.cursorTime, deltaBars);
      } else {
        const rateP = Math.max(period, timeframeSeconds(rateTf));
        const curClose = rateCandleClose(state.cursorTime);
        let next: number;
        // Backward: land on previous rate-candle closes.
        if (state.cursorTime > curClose) {
          next = curClose + rateP * (deltaBars + 1);
        } else {
          next = curClose + rateP * deltaBars;
        }
        cursorTime = Math.min(
          state.endTime,
          Math.max(
            state.startTime,
            snapToBar(next, period, state.startTime),
          ),
        );
      }
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
      // While inside tick(), the outer frame owns rescheduling — starting a
      // second rAF here orphaned handles and could leave playing=true with no loop.
      if (keepPlaying && !raf && !inTick) {
        lastTs = 0;
        barCarryMs = 0;
        scheduleTick();
        armWatchdog();
      }
    },
    dispose() {
      state = { ...state, playing: false };
      stopRaf();
      listeners.clear();
    },
  };
}
