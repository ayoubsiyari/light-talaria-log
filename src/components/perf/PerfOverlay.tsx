import { useEffect, useRef, useState } from 'react';
import {
  createRafHzSampler,
  formatPerfLine,
  getPaintFps,
  samplePerf,
  type PerfSnapshot,
  type TalariaPerfApi,
} from '@/perf/perfMonitor';

const STORAGE_KEY = 'talaria-log.perfOverlay';

interface PerfOverlayProps {
  barsInMemory: number;
  paneCount: number;
}

/**
 * Dev-only FPS / heap / bars readout for Phase 4 review gates.
 * Paint = chart engine paints; rAF = main-thread display budget.
 */
export function PerfOverlay({ barsInMemory, paneCount }: PerfOverlayProps) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [snap, setSnap] = useState<PerfSnapshot | null>(null);
  const rafSamplerRef = useRef(createRafHzSampler());
  const barsRef = useRef(barsInMemory);
  const panesRef = useRef(paneCount);
  barsRef.current = barsInMemory;
  panesRef.current = paneCount;

  const persistOpen = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const rafSampler = rafSamplerRef.current;
    rafSampler.start();

    const take = () =>
      samplePerf({
        paintFps: getPaintFps(),
        rafHz: rafSampler.getHz(),
        barsInMemory: barsRef.current,
        paneCount: panesRef.current,
      });

    const api: TalariaPerfApi = {
      sample: () => take(),
      log: () => {
        const s = take();
        console.info('[talaria-perf]', formatPerfLine(s), s);
      },
    };
    window.__talariaPerf = api;

    const id = window.setInterval(() => setSnap(take()), 500);

    return () => {
      window.clearInterval(id);
      rafSampler.stop();
      if (window.__talariaPerf === api) delete window.__talariaPerf;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setOpen((v) => {
        const next = !v;
        try {
          localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        } catch {
          /* ignore */
        }
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!import.meta.env.DEV) return null;

  if (!open) {
    return (
      <button
        type="button"
        title="Show perf (or press `)"
        onClick={() => persistOpen(true)}
        className="pointer-events-auto absolute bottom-14 right-3 z-50 rounded-md border border-border bg-surface/90 px-2 py-1 text-[10px] text-muted hover:text-foreground min-h-9"
      >
        perf
      </button>
    );
  }

  const heap =
    snap?.heapUsedMb != null
      ? `${snap.heapUsedMb.toFixed(1)} MB`
      : 'n/a · Chrome';

  // Warn paint only while actively painting slowly; idle low paint is OK
  const paintWarn = !!snap && snap.paintFps > 5 && snap.paintFps < 55;
  const rafWarn = !!snap && snap.rafHz > 0 && snap.rafHz < 50;

  return (
    <div
      className="pointer-events-auto absolute bottom-14 right-3 z-50 w-[12rem] rounded-lg border border-border bg-surface/95 shadow-lg text-[11px] text-foreground tabular-nums"
      role="status"
      aria-label="Performance monitor"
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <span className="text-[10px] uppercase tracking-wide text-muted">Perf</span>
        <button
          type="button"
          className="text-muted hover:text-foreground px-1 min-h-8"
          title="Hide (or press `)"
          onClick={() => persistOpen(false)}
        >
          ✕
        </button>
      </div>
      <dl className="px-2 py-1.5 space-y-1">
        <Row
          label="Paint"
          value={snap ? snap.paintFps.toFixed(0) : '—'}
          warn={paintWarn}
          hint="chart paints/sec"
        />
        <Row
          label="rAF"
          value={snap ? snap.rafHz.toFixed(0) : '—'}
          warn={rafWarn}
          hint="display / main thread"
        />
        <Row label="Heap" value={heap} warn={!!snap?.heapUsedMb && snap.heapUsedMb > 100} />
        <Row label="Bars" value={String(barsInMemory)} warn={barsInMemory > 2500} />
        <Row label="Panes" value={String(paneCount)} />
      </dl>
      <p className="px-2 pb-1.5 text-[9px] text-muted leading-snug">
        Pan hard: Paint should rise. Idle Paint can be low.
        <br />
        <code className="text-foreground/80">__talariaPerf.log()</code>
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  warn,
  hint,
}: {
  label: string;
  value: string;
  warn?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2" title={hint}>
      <dt className="text-muted">{label}</dt>
      <dd className={warn ? 'text-danger font-medium' : 'text-foreground'}>{value}</dd>
    </div>
  );
}
