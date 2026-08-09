import type { Drawing, DrawingPoint } from '@/drawings/drawingStore';
import { getTool } from '@/drawings/toolRegistry';

interface ObsidianCoordsPaneProps {
  draft: Drawing;
  patchPoint: (index: number, partial: Partial<DrawingPoint>) => void;
}

function SpinField({
  value,
  onChange,
  step,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  ariaLabel: string;
}) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="number"
        step={String(step)}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || value)}
        onClick={(e) => e.stopPropagation()}
        className="tlr-nospinner"
        aria-label={ariaLabel}
        style={{
          width: '100%',
          height: 28,
          background: 'rgba(140,160,255,0.05)',
          border: '1px solid rgba(140,160,255,0.2)',
          color: 'var(--text)',
          fontSize: 12,
          padding: '0 19px 0 8px',
          outline: 'none',
          boxSizing: 'border-box',
          fontVariantNumeric: 'tabular-nums',
          borderRadius: 4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--line)',
        }}
      >
        {(
          [
            [+1, '▲'],
            [-1, '▼'],
          ] as const
        ).map(([delta, chr], i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(value + delta * step);
            }}
            style={{
              flex: 1,
              width: 18,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8,
              lineHeight: 1,
              padding: 0,
              borderBottom: i === 0 ? '1px solid var(--line)' : 'none',
            }}
            aria-label={delta > 0 ? 'Increment' : 'Decrement'}
          >
            {chr}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Coordinates tab — Price + Bar spin fields for each point.
 * Freehand: first/last endpoints only.
 */
export function ObsidianCoordsPane({
  draft,
  patchPoint,
}: ObsidianCoordsPaneProps) {
  const tool = getTool(draft.type);
  const isFreehand = tool.points.kind === 'freehand';
  const points = draft.points;

  const indices: number[] = (() => {
    if (points.length === 0) return [];
    if (isFreehand) {
      if (points.length === 1) return [0];
      return [0, points.length - 1];
    }
    return points.map((_, i) => i);
  })();

  if (indices.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        No points on this drawing.
      </p>
    );
  }

  const labels = indices.map((i, displayIdx) => {
    if (isFreehand) return displayIdx === 0 ? 'Start' : 'End';
    if (indices.length === 1) return 'Point 1';
    return `Point ${i + 1}`;
  });

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 1fr',
        }}
      >
        <div style={{ padding: '6px 12px' }} />
        {['PRICE', 'BAR'].map((h) => (
          <div
            key={h}
            style={{
              padding: '6px 8px',
              fontSize: 9,
              fontWeight: 800,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textAlign: 'center',
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {indices.map((pi, di) => {
        const p = points[pi]!;
        return (
          <div
            key={`${pi}-${di}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 1fr',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                padding: '8px 12px',
              }}
            >
              {labels[di]}
            </span>
            <div style={{ padding: '6px 8px' }}>
              <SpinField
                value={p.price}
                step={0.00001}
                ariaLabel={`${labels[di]} price`}
                onChange={(price) => patchPoint(pi, { price })}
              />
            </div>
            <div style={{ padding: '6px 8px' }}>
              <SpinField
                value={Math.round(p.time)}
                step={1}
                ariaLabel={`${labels[di]} bar`}
                onChange={(time) => patchPoint(pi, { time })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
