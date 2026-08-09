import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  VIS_RANGE_HARD_MAX,
  VIS_RANGE_LABELS,
  type VisRangeRow,
  type VisRanges,
} from '@/drawings/drawingStyle';
import { SettCheckbox } from './SettCheckbox';

const GRID = '24px 72px 44px 1fr 44px';

function dragNextRange(
  nv: number,
  curMin: number,
  curMax: number,
  hm: number,
  mode: 'min' | 'max' | 'merged',
  anchor: number,
): { min: number; max: number } {
  const n = Math.max(1, Math.min(Math.round(nv), hm));
  if (mode === 'merged') {
    if (n === anchor) return { min: n, max: n };
    if (n < anchor) return { min: n, max: anchor };
    return { min: anchor, max: n };
  }
  if (mode === 'min') {
    if (n >= curMax) return { min: n, max: n };
    return { min: n, max: curMax };
  }
  if (n <= curMin) return { min: n, max: n };
  return { min: curMin, max: n };
}

function TriangleHandle({ leftPct, hot }: { leftPct: number; hot: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: `calc(${leftPct}% - 6px)`,
        top: 'calc(50% + 2px)',
        width: 12,
        height: 9,
        clipPath: 'polygon(50% 0%,0% 100%,100% 100%)',
        background: 'linear-gradient(180deg,var(--accent),color-mix(in oklab, var(--accent) 70%, #000))',
        transform: hot ? 'scale(1.18)' : 'scale(1)',
        transition: 'transform 0.08s ease',
        pointerEvents: 'none',
      }}
    />
  );
}

function VisRangeRowView({
  rowKey,
  label,
  row,
  onPatch,
}: {
  rowKey: keyof VisRanges;
  label: string;
  row: VisRangeRow;
  onPatch: (next: VisRangeRow) => void;
}) {
  const hm = VIS_RANGE_HARD_MAX[rowKey];
  const trackRef = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState<'min' | 'max' | 'merged' | null>(null);
  const collapsed = row.min === row.max;
  const pctMin = ((row.min - 1) / Math.max(1, hm - 1)) * 100;
  const pctMax = ((row.max - 1) / Math.max(1, hm - 1)) * 100;

  const mkDrag = useCallback(
    (e: ReactPointerEvent, mode: 'min' | 'max' | 'merged') => {
      e.stopPropagation();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const getVal = (cx: number) =>
        Math.round(
          1 +
            Math.max(0, Math.min(1, (cx - rect.left) / rect.width)) * (hm - 1),
        );
      const anchor = row.min;
      setHot(mode === 'merged' ? 'merged' : mode);
      const onMove = (ev: PointerEvent) => {
        const next = dragNextRange(getVal(ev.clientX), row.min, row.max, hm, mode, anchor);
        onPatch({ ...row, ...next });
      };
      const onUp = () => {
        setHot(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      onMove(e.nativeEvent);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [hm, onPatch, row],
  );

  const inputStyle: CSSProperties = {
    width: 38,
    height: 22,
    textAlign: 'center',
    background: 'rgba(140,160,255,0.06)',
    border: '1px solid var(--line)',
    color: 'var(--text)',
    fontSize: 11,
    outline: 'none',
    borderRadius: 4,
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: '0 8px',
        alignItems: 'center',
        padding: '6px 12px',
      }}
    >
      <SettCheckbox
        checked={row.checked}
        onChange={(checked) => onPatch({ ...row, checked })}
        label={null}
      />
      <span
        style={{
          fontSize: 12,
          color: row.checked ? 'var(--text-muted)' : 'var(--text-faint, var(--text-muted))',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <input
          type="number"
          min={1}
          max={row.max}
          value={row.min}
          disabled={!row.checked}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10) || row.min;
            const clamped = Math.max(1, Math.min(n, row.max));
            onPatch({ ...row, min: clamped });
          }}
          className="tlr-nospinner"
          style={inputStyle}
          aria-label={`${label} min`}
        />
      </div>
      <div
        ref={trackRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          height: 28,
          display: 'flex',
          alignItems: 'center',
          cursor: 'default',
          opacity: row.checked ? 1 : 0.4,
          pointerEvents: row.checked ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 3,
            top: '50%',
            transform: 'translateY(-50%)',
            borderRadius: 99,
            background: 'var(--surface-sunken)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: `${pctMin}%`,
              width: collapsed ? '2px' : `${Math.max(0, pctMax - pctMin)}%`,
              height: '100%',
              borderRadius: 99,
              background: 'rgba(255,255,255,0.45)',
            }}
          />
        </div>
        <TriangleHandle leftPct={pctMin} hot={hot === 'min' || hot === 'merged'} />
        {!collapsed && <TriangleHandle leftPct={pctMax} hot={hot === 'max'} />}
        {collapsed ? (
          <div
            onPointerDown={(e) => mkDrag(e, 'merged')}
            style={{
              position: 'absolute',
              left: `calc(${pctMin}% - 14px)`,
              top: 'calc(50% - 14px)',
              width: 28,
              height: 28,
              zIndex: 3,
            }}
          />
        ) : (
          <>
            <div
              onPointerDown={(e) => {
                const t = trackRef.current;
                if (!t) return;
                const r = t.getBoundingClientRect();
                const cv = Math.round(
                  1 +
                    Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) *
                      (hm - 1),
                );
                mkDrag(
                  e,
                  Math.abs(cv - row.min) <= Math.abs(cv - row.max) ? 'min' : 'max',
                );
              }}
              style={{ position: 'absolute', inset: 0 }}
            />
            <div
              onPointerDown={(e) => mkDrag(e, 'min')}
              style={{
                position: 'absolute',
                left: `calc(${pctMin}% - 14px)`,
                top: 'calc(50% - 14px)',
                width: 28,
                height: 28,
                zIndex: 2,
              }}
            />
            <div
              onPointerDown={(e) => mkDrag(e, 'max')}
              style={{
                position: 'absolute',
                left: `calc(${pctMax}% - 14px)`,
                top: 'calc(50% - 14px)',
                width: 28,
                height: 28,
                zIndex: 2,
              }}
            />
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <input
          type="number"
          min={row.min}
          max={hm}
          value={row.max}
          disabled={!row.checked}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10) || row.max;
            const clamped = Math.max(row.min, Math.min(n, hm));
            onPatch({ ...row, max: clamped });
          }}
          className="tlr-nospinner"
          style={inputStyle}
          aria-label={`${label} max`}
        />
      </div>
    </div>
  );
}

interface SettVisRangesProps {
  value: VisRanges;
  onChange: (next: VisRanges) => void;
}

/**
 * V9VisTimeframesPanel port — Minutes/Hours/Days/Weeks/Months with checkbox + MIN–MAX.
 */
export function SettVisRanges({ value, onChange }: SettVisRangesProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}
      >
        TIMEFRAMES
      </div>
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            gap: '0 8px',
            padding: '4px 12px 5px',
          }}
        >
          <div />
          <div />
          <div
            style={{
              textAlign: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
            }}
          >
            MIN
          </div>
          <div />
          <div
            style={{
              textAlign: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
            }}
          >
            MAX
          </div>
        </div>
        {VIS_RANGE_LABELS.map(({ key, label }) => (
          <VisRangeRowView
            key={key}
            rowKey={key}
            label={label}
            row={value[key]}
            onPatch={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
      </div>
    </div>
  );
}
