import type { LineStyleKind } from '@/drawings/drawingStyle';
import { dashArrayFor } from '@/drawings/drawingStyle';

/** V9 line-type options: bold (=solid thicker), dotted, dashed, dashdot. */
export const LINE_TYPE_OPTS: {
  id: LineStyleKind;
  dash?: string;
  strokeWidth: number;
}[] = [
  { id: 'solid', strokeWidth: 2.5 },
  { id: 'dotted', dash: '2,4', strokeWidth: 1.5 },
  { id: 'dashed', dash: '7,4', strokeWidth: 1.5 },
  { id: 'dashdot', dash: '7,4,2,4', strokeWidth: 1.5 },
];

export function LineTypePreview({
  type,
  active,
  width = 22,
}: {
  type: LineStyleKind | string;
  active?: boolean;
  width?: number;
}) {
  const stroke = active ? 'var(--accent)' : 'var(--text-muted)';
  const sw = type === 'solid' ? 2.5 : 1.5;
  return (
    <svg width={width} height={10} viewBox={`0 0 ${width} 10`} aria-hidden>
      <line
        x1={0}
        y1={5}
        x2={width}
        y2={5}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={dashArrayFor(type)}
      />
    </svg>
  );
}

export function LineWidthPreview({
  widthPx,
  active,
  previewW = 22,
}: {
  widthPx: number;
  active?: boolean;
  previewW?: number;
}) {
  const h = Math.max(8, widthPx + 4);
  const stroke = active ? 'var(--accent)' : 'var(--text-muted)';
  return (
    <svg width={previewW} height={h} viewBox={`0 0 ${previewW} ${h}`} aria-hidden>
      <line
        x1={0}
        y1={h / 2}
        x2={previewW}
        y2={h / 2}
        stroke={stroke}
        strokeWidth={widthPx}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EndpointPreview({
  side,
  style,
  active,
}: {
  side: 'left' | 'right';
  style: 'none' | 'normal' | 'arrow';
  active?: boolean;
}) {
  const stroke = active ? 'var(--accent)' : 'var(--text-muted)';
  if (style === 'none') {
    return (
      <svg width={14} height={10} viewBox="0 0 14 10" aria-hidden>
        <line x1={0} y1={5} x2={14} y2={5} stroke={stroke} strokeWidth={1.5} />
      </svg>
    );
  }
  if (style === 'arrow') {
    return side === 'left' ? (
      <svg width={14} height={10} viewBox="0 0 14 10" aria-hidden>
        <path
          d="M4,2 L1,5 L4,8"
          stroke={stroke}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="1" y1="5" x2="14" y2="5" stroke={stroke} strokeWidth="1.5" />
      </svg>
    ) : (
      <svg width={14} height={10} viewBox="0 0 14 10" aria-hidden>
        <line x1="0" y1="5" x2="13" y2="5" stroke={stroke} strokeWidth="1.5" />
        <path
          d="M10,2 L13,5 L10,8"
          stroke={stroke}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return side === 'left' ? (
    <svg width={14} height={10} viewBox="0 0 14 10" aria-hidden>
      <circle cx="2" cy="5" r="2" fill={stroke} />
      <line x1="4" y1="5" x2="14" y2="5" stroke={stroke} strokeWidth="1.5" />
    </svg>
  ) : (
    <svg width={14} height={10} viewBox="0 0 14 10" aria-hidden>
      <line x1="0" y1="5" x2="10" y2="5" stroke={stroke} strokeWidth="1.5" />
      <circle cx="12" cy="5" r="2" fill={stroke} />
    </svg>
  );
}

export function ChevDown({ open }: { open?: boolean }) {
  return (
    <svg
      width={8}
      height={8}
      viewBox="0 0 12 12"
      aria-hidden
      style={{ color: open ? 'var(--accent)' : 'var(--text-muted)' }}
    >
      <path
        d="M2.5 4.5 L6 8 L9.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
