import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { createReplayController } from '@/replay/replayStore';

/** Minimal rAF for Node — replayStore schedules the clock on it. */
function installRafPolyfill(): () => void {
  const g = globalThis as typeof globalThis & {
    requestAnimationFrame?: typeof requestAnimationFrame;
    cancelAnimationFrame?: typeof cancelAnimationFrame;
  };
  const prevRaf = g.requestAnimationFrame;
  const prevCaf = g.cancelAnimationFrame;
  let seq = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = seq++;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        cb(performance.now());
      }, 16),
    );
    return id;
  };
  g.cancelAnimationFrame = (id: number) => {
    const t = timers.get(id);
    if (t != null) clearTimeout(t);
    timers.delete(id);
  };
  return () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    g.requestAnimationFrame = prevRaf as typeof requestAnimationFrame;
    g.cancelAnimationFrame = prevCaf as typeof cancelAnimationFrame;
  };
}

describe('createReplayController', () => {
  let restore: () => void;
  before(() => {
    restore = installRafPolyfill();
  });
  after(() => {
    restore();
  });

  it('stops when the clock cannot advance (no infinite rAF spin)', async () => {
    const ctrl = createReplayController();
    // End one second after start — snap may land on start for coarse period.
    ctrl.configure(1_700_000_000, 1_700_000_001, 3600);
    ctrl.setBaseTf('1m');
    ctrl.setRateTf('1m');
    ctrl.setSpeed(30);
    ctrl.seek(1_700_000_000);
    ctrl.play();
    await new Promise((r) => setTimeout(r, 80));
    const st = ctrl.get();
    assert.equal(st.playing, false);
    assert.ok(st.cursorTime >= st.endTime - 1);
    ctrl.dispose();
  });

  it('advances while playing on a normal window', async () => {
    const ctrl = createReplayController();
    ctrl.configure(1_700_000_000, 1_700_000_000 + 3600, 3600);
    ctrl.setBaseTf('1m');
    ctrl.setRateTf('1m');
    ctrl.setSpeed(30);
    ctrl.play();
    await new Promise((r) => setTimeout(r, 80));
    const st = ctrl.get();
    assert.ok(st.cursorTime > 1_700_000_000);
    ctrl.pause();
    ctrl.dispose();
  });
});
