/**
 * Mini SVG chart mockups — show how a piece’s detection looks on the chart.
 * Uses theme CSS variables (accent / success / danger / muted).
 */
import type { ReactNode } from 'react';
import type { PieceVisualKind } from '@/strategy/pieceDocs';

interface PieceChartPreviewProps {
  visual: PieceVisualKind;
  title?: string;
  className?: string;
}

const W = 280;
const H = 140;
const PAD = 12;

function Diamond({
  x,
  y,
  color = 'var(--accent)',
}: {
  x: number;
  y: number;
  color?: string;
}) {
  const r = 5;
  return (
    <polygon
      points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
      fill={color}
      opacity={0.95}
    />
  );
}

function Triangle({
  x,
  y,
  up,
  color,
}: {
  x: number;
  y: number;
  up: boolean;
  color: string;
}) {
  const r = 6;
  const pts = up
    ? `${x},${y - r} ${x - r},${y + r * 0.7} ${x + r},${y + r * 0.7}`
    : `${x},${y + r} ${x - r},${y - r * 0.7} ${x + r},${y - r * 0.7}`;
  return <polygon points={pts} fill={color} />;
}

function Label({
  x,
  y,
  text,
}: {
  x: number;
  y: number;
  text: string;
}) {
  const w = Math.min(92, 8 + text.length * 5.2);
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - 8}
        width={w}
        height={14}
        rx={3}
        fill="var(--background)"
        stroke="var(--accent)"
        strokeWidth={1}
        opacity={0.92}
      />
      <text
        x={x}
        y={y + 2}
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize={9}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto rounded-md border border-border bg-background"
      role="img"
    >
      <rect x={0} y={0} width={W} height={H} fill="var(--background)" />
      {/* grid */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={`h${t}`}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + (H - PAD * 2) * t}
          y2={PAD + (H - PAD * 2) * t}
          stroke="var(--border)"
          strokeWidth={1}
          opacity={0.6}
        />
      ))}
      {children}
    </svg>
  );
}

function Candle({
  x,
  o,
  h,
  l,
  c,
  bull,
}: {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
  bull: boolean;
}) {
  const color = bull ? 'var(--success)' : 'var(--danger)';
  return (
    <g>
      <line x1={x} x2={x} y1={h} y2={l} stroke={color} strokeWidth={1.25} />
      <rect
        x={x - 4}
        y={Math.min(o, c)}
        width={8}
        height={Math.max(2, Math.abs(c - o))}
        fill={color}
      />
    </g>
  );
}

function pathFrom(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function renderVisual(visual: PieceVisualKind): ReactNode {
  const midY = H / 2;
  switch (visual) {
    case 'logic':
      return (
        <>
          <text x={PAD} y={22} fill="var(--muted)" fontSize={10}>
            Logic node — combines wires
          </text>
          <rect x={40} y={50} width={56} height={36} rx={6} fill="var(--surface)" stroke="var(--border)" />
          <text x={68} y={72} textAnchor="middle" fill="var(--foreground)" fontSize={11} fontWeight={600}>
            AND
          </text>
          <circle cx={30} cy={60} r={3} fill="var(--accent)" />
          <circle cx={30} cy={76} r={3} fill="var(--accent)" />
          <line x1={33} y1={60} x2={40} y2={62} stroke="var(--accent)" />
          <line x1={33} y1={76} x2={40} y2={74} stroke="var(--accent)" />
          <line x1={96} y1={68} x2={150} y2={68} stroke="var(--accent)" />
          <Triangle x={160} y={68} up color="var(--success)" />
          <Label x={200} y={52} text="Entry" />
        </>
      );
    case 'ma_cross':
      return (
        <>
          <path
            d={pathFrom([
              { x: 20, y: 90 },
              { x: 80, y: 85 },
              { x: 140, y: 70 },
              { x: 200, y: 55 },
              { x: 250, y: 40 },
            ])}
            stroke="var(--accent)"
            fill="none"
            strokeWidth={1.5}
          />
          <path
            d={pathFrom([
              { x: 20, y: 55 },
              { x: 80, y: 60 },
              { x: 140, y: 68 },
              { x: 200, y: 75 },
              { x: 250, y: 80 },
            ])}
            stroke="var(--muted)"
            fill="none"
            strokeWidth={1.5}
          />
          <Diamond x={140} y={69} />
          <Label x={140} y={48} text="MA×" />
        </>
      );
    case 'ma_stack':
      return (
        <>
          {[40, 55, 70].map((y, i) => (
            <line
              key={y}
              x1={30}
              x2={250}
              y1={y + i * 8}
              y2={y + i * 4}
              stroke={
                i === 0
                  ? 'var(--foreground)'
                  : i === 1
                    ? 'var(--accent)'
                    : 'var(--muted)'
              }
              strokeWidth={1.4}
              opacity={0.85}
            />
          ))}
          <Diamond x={180} y={58} />
          <Label x={180} y={36} text="Stack" />
        </>
      );
    case 'ma_slope':
      return (
        <>
          <path
            d={pathFrom([
              { x: 30, y: 100 },
              { x: 90, y: 90 },
              { x: 150, y: 70 },
              { x: 220, y: 45 },
            ])}
            stroke="var(--accent)"
            fill="none"
            strokeWidth={2}
          />
          <Diamond x={150} y={70} />
          <Label x={150} y={50} text="Slope↑" />
        </>
      );
    case 'osc_cross':
      return (
        <>
          <line x1={PAD} x2={W - PAD} y1={midY} y2={midY} stroke="var(--border)" strokeDasharray="3 3" />
          <path
            d={pathFrom([
              { x: 24, y: 100 },
              { x: 70, y: 85 },
              { x: 120, y: 75 },
              { x: 160, y: 55 },
              { x: 220, y: 40 },
            ])}
            stroke="var(--accent)"
            fill="none"
            strokeWidth={1.6}
          />
          <Diamond x={145} y={62} />
          <Label x={145} y={42} text="Cross" />
        </>
      );
    case 'osc_level':
      return (
        <>
          <line x1={PAD} x2={W - PAD} y1={40} y2={40} stroke="var(--danger)" strokeDasharray="4 3" opacity={0.7} />
          <line x1={PAD} x2={W - PAD} y1={100} y2={100} stroke="var(--success)" strokeDasharray="4 3" opacity={0.7} />
          <path
            d={pathFrom([
              { x: 24, y: 60 },
              { x: 80, y: 70 },
              { x: 130, y: 95 },
              { x: 180, y: 105 },
              { x: 240, y: 90 },
            ])}
            stroke="var(--accent)"
            fill="none"
            strokeWidth={1.6}
          />
          <Diamond x={150} y={100} />
          <Label x={150} y={78} text="RSI zone" />
        </>
      );
    case 'hist_flip':
      return (
        <>
          <line x1={PAD} x2={W - PAD} y1={midY} y2={midY} stroke="var(--border)" />
          {[40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((x, i) => {
            const neg = i < 5;
            const h = 10 + (i % 3) * 8;
            return (
              <rect
                key={x}
                x={x}
                y={neg ? midY : midY - h}
                width={10}
                height={h}
                fill={neg ? 'var(--danger)' : 'var(--success)'}
                opacity={0.85}
              />
            );
          })}
          <Diamond x={140} y={midY - 18} />
          <Label x={140} y={28} text="Hist flip" />
        </>
      );
    case 'band_touch':
      return (
        <>
          <path
            d={pathFrom([
              { x: 20, y: 40 },
              { x: 100, y: 35 },
              { x: 180, y: 45 },
              { x: 250, y: 38 },
            ])}
            stroke="var(--accent)"
            fill="none"
            strokeWidth={1}
            opacity={0.7}
          />
          <path
            d={pathFrom([
              { x: 20, y: 100 },
              { x: 100, y: 105 },
              { x: 180, y: 95 },
              { x: 250, y: 102 },
            ])}
            stroke="var(--accent)"
            fill="none"
            strokeWidth={1}
            opacity={0.7}
          />
          <path
            d={pathFrom([
              { x: 20, y: 70 },
              { x: 100, y: 72 },
              { x: 180, y: 68 },
              { x: 250, y: 70 },
            ])}
            stroke="var(--muted)"
            fill="none"
            strokeWidth={1}
          />
          <Candle x={170} o={88} h={92} l={98} c={96} bull={false} />
          <Diamond x={170} y={96} />
          <Label x={170} y={72} text="BB touch" />
        </>
      );
    case 'squeeze':
      return (
        <>
          <path
            d={pathFrom([
              { x: 20, y: 30 },
              { x: 90, y: 50 },
              { x: 150, y: 60 },
              { x: 200, y: 35 },
              { x: 250, y: 20 },
            ])}
            stroke="var(--accent)"
            fill="none"
            opacity={0.6}
          />
          <path
            d={pathFrom([
              { x: 20, y: 110 },
              { x: 90, y: 90 },
              { x: 150, y: 80 },
              { x: 200, y: 105 },
              { x: 250, y: 120 },
            ])}
            stroke="var(--accent)"
            fill="none"
            opacity={0.6}
          />
          <Diamond x={165} y={70} />
          <Label x={165} y={48} text="Squeeze→" />
        </>
      );
    case 'breakout':
      return (
        <>
          <line x1={30} x2={200} y1={55} y2={55} stroke="var(--muted)" strokeDasharray="4 3" />
          <line x1={30} x2={200} y1={95} y2={95} stroke="var(--muted)" strokeDasharray="4 3" />
          <Candle x={70} o={75} h={70} l={88} c={78} bull />
          <Candle x={100} o={78} h={72} l={90} c={80} bull />
          <Candle x={130} o={80} h={68} l={85} c={72} bull />
          <Candle x={175} o={70} h={42} l={75} c={48} bull />
          <Diamond x={175} y={48} />
          <Label x={175} y={28} text="Break" />
        </>
      );
    case 'candle':
      return (
        <>
          <Candle x={90} o={60} h={50} l={95} c={88} bull={false} />
          <Candle x={130} o={90} h={55} l={100} c={58} bull />
          <Diamond x={130} y={58} />
          <Label x={130} y={36} text="Pattern" />
        </>
      );
    case 'fvg':
      return (
        <>
          <Candle x={80} o={90} h={70} l={95} c={75} bull />
          <Candle x={120} o={70} h={45} l={78} c={50} bull />
          <Candle x={160} o={48} h={40} l={85} c={55} bull />
          <rect x={88} y={75} width={64} height={12} fill="var(--accent)" opacity={0.25} />
          <Diamond x={160} y={55} />
          <Label x={160} y={32} text="FVG" />
        </>
      );
    case 'fib':
      return (
        <>
          <line x1={40} x2={240} y1={35} y2={35} stroke="var(--muted)" />
          <line x1={40} x2={240} y1={70} y2={70} stroke="var(--accent)" strokeDasharray="3 2" />
          <line x1={40} x2={240} y1={105} y2={105} stroke="var(--muted)" />
          <text x={245} y={73} fill="var(--accent)" fontSize={9}>
            61.8
          </text>
          <Candle x={170} o={78} h={62} l={90} c={72} bull />
          <Diamond x={170} y={70} />
          <Label x={170} y={48} text="Fib/OTE" />
        </>
      );
    case 'sweep':
      return (
        <>
          <line x1={40} x2={220} y1={95} y2={95} stroke="var(--muted)" strokeDasharray="4 3" />
          <Candle x={150} o={70} h={60} l={110} c={68} bull />
          <Diamond x={150} y={68} />
          <Label x={150} y={42} text="Sweep" />
        </>
      );
    case 'equal_levels':
      return (
        <>
          <line x1={50} x2={230} y1={50} y2={50} stroke="var(--danger)" strokeDasharray="2 3" opacity={0.8} />
          <Candle x={100} o={70} h={50} l={90} c={75} bull={false} />
          <Candle x={170} o={72} h={50} l={88} c={78} bull={false} />
          <Diamond x={170} y={50} />
          <Label x={170} y={30} text="EQH" />
        </>
      );
    case 'zone':
      return (
        <>
          <rect x={70} y={55} width={50} height={40} fill="var(--accent)" opacity={0.2} stroke="var(--accent)" />
          <Candle x={90} o={85} h={70} l={95} c={90} bull={false} />
          <Candle x={190} o={80} h={50} l={88} c={58} bull />
          <Candle x={230} o={62} h={55} l={82} c={70} bull />
          <Diamond x={230} y={70} />
          <Label x={230} y={40} text="OB" />
        </>
      );
    case 'impulse':
      return (
        <>
          <Candle x={80} o={85} h={78} l={95} c={88} bull />
          <Candle x={120} o={88} h={80} l={96} c={90} bull />
          <Candle x={170} o={90} h={35} l={95} c={42} bull />
          <Diamond x={170} y={42} />
          <Label x={170} y={22} text="Disp" />
        </>
      );
    case 'retest':
      return (
        <>
          <line x1={40} x2={240} y1={70} y2={70} stroke="var(--muted)" strokeDasharray="4 3" />
          <Candle x={100} o={85} h={55} l={90} c={60} bull />
          <Candle x={160} o={65} h={58} l={78} c={72} bull={false} />
          <Candle x={200} o={72} h={50} l={76} c={55} bull />
          <Diamond x={200} y={55} />
          <Label x={200} y={32} text="Retest" />
        </>
      );
    case 'trail_flip':
      return (
        <>
          <path
            d={pathFrom([
              { x: 30, y: 100 },
              { x: 90, y: 90 },
              { x: 140, y: 70 },
              { x: 200, y: 50 },
            ])}
            stroke="var(--foreground)"
            fill="none"
            strokeWidth={1.4}
          />
          {[50, 80, 110].map((x) => (
            <circle key={x} cx={x} cy={105} r={2.5} fill="var(--danger)" />
          ))}
          {[160, 190, 220].map((x) => (
            <circle key={x} cx={x} cy={40} r={2.5} fill="var(--success)" />
          ))}
          <Diamond x={150} y={62} />
          <Label x={150} y={40} text="Flip" />
        </>
      );
    case 'cloud':
      return (
        <>
          <path
            d="M30,80 C80,60 120,90 160,70 C200,50 240,75 250,65 L250,100 C220,110 180,95 140,105 C90,115 50,100 30,100 Z"
            fill="var(--accent)"
            opacity={0.2}
          />
          <path
            d={pathFrom([
              { x: 30, y: 95 },
              { x: 100, y: 90 },
              { x: 160, y: 55 },
              { x: 230, y: 45 },
            ])}
            stroke="var(--foreground)"
            fill="none"
            strokeWidth={1.5}
          />
          <Diamond x={160} y={55} />
          <Label x={160} y={32} text="Cloud" />
        </>
      );
    case 'volatility':
      return (
        <>
          <path
            d={pathFrom([
              { x: 30, y: 90 },
              { x: 90, y: 85 },
              { x: 140, y: 80 },
              { x: 180, y: 40 },
              { x: 240, y: 55 },
            ])}
            stroke="var(--accent)"
            fill="none"
            strokeWidth={1.8}
          />
          <Diamond x={180} y={40} />
          <Label x={180} y={22} text="ATR↑" />
        </>
      );
    case 'session':
      return (
        <>
          <rect x={90} y={PAD} width={90} height={H - PAD * 2} fill="var(--accent)" opacity={0.12} />
          <text x={135} y={28} textAnchor="middle" fill="var(--accent)" fontSize={10} fontWeight={600}>
            Killzone
          </text>
          <Candle x={70} o={80} h={70} l={95} c={85} bull={false} />
          <Candle x={120} o={85} h={60} l={95} c={65} bull />
          <Candle x={200} o={70} h={55} l={90} c={75} bull />
          <Diamond x={95} y={40} />
          <Label x={95} y={58} text="Window" />
        </>
      );
    case 'level_touch':
      return (
        <>
          <line x1={40} x2={240} y1={70} y2={70} stroke="var(--accent)" strokeWidth={1.5} />
          <text x={245} y={73} fill="var(--muted)" fontSize={9}>
            1.1000
          </text>
          <Candle x={160} o={82} h={60} l={88} c={68} bull />
          <Diamond x={160} y={70} />
          <Label x={160} y={46} text="Round" />
        </>
      );
    default:
      return (
        <>
          <Candle x={140} o={80} h={50} l={100} c={60} bull />
          <Diamond x={140} y={60} />
          <Label x={140} y={36} text="Detect" />
        </>
      );
  }
}

export function PieceChartPreview({
  visual,
  title,
  className,
}: PieceChartPreviewProps) {
  return (
    <div className={className}>
      {title && (
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5 font-semibold">
          {title}
        </p>
      )}
      <Frame>{renderVisual(visual)}</Frame>
      <p className="text-[10px] text-muted mt-1.5 leading-snug">
        On a live chart: accent <span className="text-accent font-semibold">diamonds</span> =
        piece detections; green/red <span className="text-success font-semibold">triangles</span> =
        entries/exits.
      </p>
    </div>
  );
}
