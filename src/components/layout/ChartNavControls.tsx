import type { RefObject } from 'react';
import type { ChartInstance } from '@/chart';
import { PRICE_AXIS_WIDTH, TIME_AXIS_HEIGHT } from '@/chart/renderer';

interface ChartNavControlsProps {
  instanceRef: RefObject<ChartInstance | null>;
  /** True while engine is following the live / replay candle. */
  following: boolean;
  /** Show the » follow control (replay cursor active). */
  showFollow: boolean;
  /** Clear React camera-detached flag so follow can stick. */
  onReattachFollow: () => void;
}

const BTN =
  'flex h-8 w-8 [@media(hover:none)]:h-11 [@media(hover:none)]:w-11 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-md outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-accent';

/** Hidden until hover/focus; always shown on touch devices (no hover). */
const REVEAL =
  'opacity-0 transition-opacity duration-150 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100 [@media(hover:none)]:opacity-100';

function IconMinus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M8.5 3.5 5 7l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M5.5 3.5 9 7l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconReset() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M11.5 7A4.5 4.5 0 1 1 9.2 3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M11.5 2.5v3h-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFollow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 3.5 6.5 7 3 10.5M7.5 3.5 11 7l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * TradingView-style floating chart nav: zoom, pan, reset scale, follow replay.
 * Hidden until the bottom-right zone is hovered (always visible on touch).
 */
export function ChartNavControls({
  instanceRef,
  following,
  showFollow,
  onReattachFollow,
}: ChartNavControlsProps) {
  const withChart = (fn: (chart: ChartInstance) => void) => {
    const chart = instanceRef.current;
    if (chart) fn(chart);
  };

  const panStep = () => {
    const chart = instanceRef.current;
    if (!chart) return 20;
    const r = chart.getVisibleRange();
    return Math.max(5, Math.round((r.toIndex - r.fromIndex) * 0.2));
  };

  return (
    <div
      className="group/nav pointer-events-auto absolute z-20 flex flex-col items-end justify-end gap-1 p-2"
      style={{
        bottom: TIME_AXIS_HEIGHT + 2,
        right: PRICE_AXIS_WIDTH + 4,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showFollow && !following && (
        <button
          type="button"
          className={`${BTN} ${REVEAL}`}
          aria-label="Follow chart"
          title="Follow chart"
          onClick={() => {
            onReattachFollow();
            withChart((c) => c.followRealtime());
          }}
        >
          <IconFollow />
        </button>
      )}

      <div className={`flex items-center gap-1 ${REVEAL}`}>
        <button
          type="button"
          className={BTN}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => withChart((c) => c.zoomTime(1.2))}
        >
          <IconMinus />
        </button>
        <button
          type="button"
          className={BTN}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => withChart((c) => c.zoomTime(1 / 1.2))}
        >
          <IconPlus />
        </button>
        <button
          type="button"
          className={BTN}
          aria-label="Scroll left"
          title="Scroll left"
          onClick={() => withChart((c) => c.panTime(-panStep()))}
        >
          <IconChevronLeft />
        </button>
        <button
          type="button"
          className={BTN}
          aria-label="Scroll right"
          title="Scroll right"
          onClick={() => withChart((c) => c.panTime(panStep()))}
        >
          <IconChevronRight />
        </button>
        <button
          type="button"
          className={BTN}
          aria-label="Reset scale"
          title="Reset scale"
          onClick={() => {
            onReattachFollow();
            withChart((c) => c.resetView());
          }}
        >
          <IconReset />
        </button>
      </div>
    </div>
  );
}
