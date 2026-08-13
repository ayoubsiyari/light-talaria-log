export type ChartStillVariant =
  | 'candles'
  | 'replay'
  | 'equity'
  | 'panes'
  | 'drawings'
  | 'journal';

interface ChartStillProps {
  variant: ChartStillVariant;
  className?: string;
}

function series(seed: number, count: number) {
  const bars: { o: number; h: number; l: number; c: number; up: boolean }[] = [];
  let price = 0.52;
  for (let i = 0; i < count; i++) {
    const n = Math.sin(seed + i * 0.73) * 0.07 + Math.cos(seed * 1.4 + i * 0.31) * 0.04;
    const o = price;
    price = Math.min(0.86, Math.max(0.14, price + n));
    const c = price;
    bars.push({
      o,
      c,
      h: Math.min(0.94, Math.max(o, c) + 0.05),
      l: Math.max(0.06, Math.min(o, c) - 0.05),
      up: c >= o,
    });
  }
  return bars;
}

/**
 * Decorative tape stills for the marketing surface — not the Canvas engine.
 */
export function ChartStill({ variant, className = '' }: ChartStillProps) {
  const seed =
    variant === 'replay'
      ? 1.2
      : variant === 'equity'
        ? 2.4
        : variant === 'panes'
          ? 0.6
          : variant === 'drawings'
            ? 3.1
            : variant === 'journal'
              ? 4.0
              : 0.2;

  const count = variant === 'panes' ? 18 : 26;
  const bars = series(seed, count);
  const x0 = 16;
  const y0 = 16;
  const plotW = 220;
  const plotH = variant === 'panes' ? 62 : 92;
  const gap = plotW / count;
  const bw = Math.max(2.2, gap * 0.42);
  const yAt = (p: number, h = plotH, top = y0) => top + (1 - p) * h;
  const up = 'var(--lp-grad-from)';
  const upFill = 'var(--lp-grad-to)';
  const down = 'hsl(0 0% 40%)';
  const downFill = 'hsl(0 0% 26%)';
  const cursorI = Math.floor(count * 0.7);
  const cursorX = x0 + cursorI * gap + bw / 2;

  const candleMarks = (h = plotH, top = y0) =>
    bars.map((b, i) => {
      const x = x0 + i * gap + gap * 0.22;
      return (
        <g key={`${top}-${i}`}>
          <line
            x1={x + bw / 2}
            y1={yAt(b.h, h, top)}
            x2={x + bw / 2}
            y2={yAt(b.l, h, top)}
            stroke={b.up ? up : down}
            strokeWidth="1"
          />
          <rect
            x={x}
            y={Math.min(yAt(b.o, h, top), yAt(b.c, h, top))}
            width={bw}
            height={Math.max(1.4, Math.abs(yAt(b.c, h, top) - yAt(b.o, h, top)))}
            fill={b.up ? upFill : downFill}
          />
        </g>
      );
    });

  const eq = bars
    .map((b, i) => {
      const x = x0 + i * gap + bw / 2;
      const y = 48 + (1 - b.c) * 36;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
  const lastX = x0 + (count - 1) * gap + bw / 2;

  return (
    <svg
      viewBox="0 0 252 140"
      className={['h-full w-full', className].join(' ')}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="252" height="140" fill="hsl(0 0% 6%)" />
      {[38, 64, 90].map((y) => (
        <line key={y} x1="12" y1={y} x2="240" y2={y} stroke="hsl(0 0% 13%)" strokeWidth="1" />
      ))}

      {variant === 'equity' ? (
        <>
          <path d={`${eq} L ${lastX} 120 L ${x0} 120 Z`} fill="color-mix(in srgb, var(--lp-grad-to) 22%, transparent)" />
          <path d={eq} fill="none" stroke={up} strokeWidth="2" />
        </>
      ) : variant === 'panes' ? (
        <>
          {candleMarks(58, 14)}
          <line x1="12" y1="80" x2="240" y2="80" stroke="hsl(0 0% 16%)" strokeWidth="1" />
          {bars.map((b, i) => (
            <rect
              key={`v-${i}`}
              x={x0 + i * gap + gap * 0.28}
              y={86 + (1 - Math.abs(b.c - b.o) * 3) * 36}
              width={bw * 0.85}
              height={Math.max(4, Math.abs(b.c - b.o) * 90)}
              fill={b.up ? upFill : downFill}
              opacity="0.85"
            />
          ))}
        </>
      ) : (
        candleMarks()
      )}

      {variant === 'replay' ? (
        <>
          <line x1={cursorX} y1="10" x2={cursorX} y2="126" stroke="hsl(0 0% 96%)" strokeWidth="1.2" />
          <rect x={cursorX} y="10" width={252 - cursorX} height="116" fill="hsl(0 0% 4% / 0.58)" />
        </>
      ) : null}

      {variant === 'drawings' ? (
        <>
          <line x1="34" y1="108" x2="214" y2="30" stroke={up} strokeWidth="1.5" />
          <line
            x1="20"
            y1="68"
            x2="232"
            y2="68"
            stroke="hsl(0 0% 72%)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        </>
      ) : null}

      {variant === 'journal' ? (
        <g>
          <rect x="16" y="92" width="220" height="36" rx="8" fill="hsl(0 0% 8%)" stroke="hsl(0 0% 14%)" />
          <text x="28" y="114" fill="hsl(0 0% 88%)" fontSize="11" fontFamily="ui-sans-serif, system-ui, sans-serif">
            EUR/USD · SMA 10/30
          </text>
        </g>
      ) : null}
    </svg>
  );
}
