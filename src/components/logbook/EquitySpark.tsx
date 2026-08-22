import { useState, type PointerEvent } from 'react';
import type { EquityPoint } from '@/logbook/types';

export function EquitySpark({
  equity,
  className,
  formatValue,
}: {
  equity: readonly EquityPoint[];
  className?: string;
  formatValue?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (equity.length < 2) {
    return (
      <p className="text-sm text-muted py-6 text-center">
        Need two closed trades for an equity line.
      </p>
    );
  }
  const w = 640;
  const h = 180;
  const ys = equity.map((p) => p.equity);
  const min = Math.min(0, ...ys);
  const max = Math.max(0, ...ys);
  const span = max - min || 1;
  const x = (i: number) => (i / (equity.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * h;
  const d = equity
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.equity).toFixed(1)}`)
    .join(' ');
  const zero = y(0);
  const peak = Math.max(...ys);
  const last = equity[equity.length - 1]!.equity;
  const stroke = last >= 0 ? 'var(--jd-up)' : 'var(--jd-down)';
  const fill = last >= 0 ? 'var(--jd-up)' : 'var(--jd-down)';
  const area = `${d} L${w.toFixed(1)} ${zero.toFixed(1)} L0 ${zero.toFixed(1)} Z`;
  const i = hover ?? equity.length - 1;
  const pt = equity[i]!;
  const left = (i / (equity.length - 1)) * 100;
  const top = ((max - pt.equity) / span) * 100;
  const label = formatValue?.(pt.equity) ?? pt.equity.toFixed(0);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(r.width, 1)));
    setHover(Math.round(t * (equity.length - 1)));
  };

  return (
    <div
      className={['jd-graph', className ?? 'jd-equity-svg'].join(' ')}
      onPointerMove={pick}
      onPointerEnter={pick}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Equity, last ${last.toFixed(2)}`}
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          x2={w}
          y1={zero}
          y2={zero}
          stroke="var(--jd-line)"
          strokeWidth="1"
        />
        <line
          className="jd-equity-peak"
          x1="0"
          x2={w}
          y1={y(peak)}
          y2={y(peak)}
          stroke="var(--jd-muted)"
          strokeWidth="1"
          strokeDasharray="5 6"
        />
        <path className="jd-equity-area" d={area} fill={fill} fillOpacity="0.16" />
        <path
          className="jd-equity-line"
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
        />
      </svg>
      {hover != null && (
        <>
          <span className="jd-graph-rule" style={{ left: `${left}%` }} />
          <span className="jd-graph-dot" style={{ left: `${left}%`, top: `${top}%` }} />
          <div className="jd-tip jd-tip-follow" style={{ left: `${left}%`, top: `${top}%` }} role="status">
            <span className="jd-tip-k">{formatWhen(pt.time)}</span>
            <span className={pt.equity >= 0 ? 'jd-tip-v text-success' : 'jd-tip-v text-danger'}>
              {label}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function formatWhen(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
