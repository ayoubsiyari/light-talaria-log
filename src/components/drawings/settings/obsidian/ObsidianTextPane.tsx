import { useState, type ReactNode } from 'react';
import type { Drawing } from '@/drawings/drawingStore';
import type {
  DrawingStyle,
  TextAlignH,
  TextAlignV,
  TextOrientation,
} from '@/drawings/drawingStyle';
import { SettColorSwatch } from './SettColorSwatch';
import { SettBIToggle, SettSizeDropdown } from './SettSizeDropdown';

interface ObsidianTextPaneProps {
  draft: Drawing;
  patchStyle: (partial: Partial<DrawingStyle>) => void;
  onTextChange: (text: string) => void;
}

const ALIGN_V: { id: TextAlignV; title: string; icon: ReactNode }[] = [
  {
    id: 'top',
    title: 'Top',
    icon: (
      <svg width={14} height={14} viewBox="0 0 14 14">
        <line x1="2" y1="2" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7,4 L7,12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4,7 L7,4 L10,7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'middle',
    title: 'Middle',
    icon: (
      <svg width={14} height={14} viewBox="0 0 14 14">
        <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4,4 L7,2 L10,4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4,10 L7,12 L10,10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'bottom',
    title: 'Bottom',
    icon: (
      <svg width={14} height={14} viewBox="0 0 14 14">
        <line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7,2 L7,10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4,7 L7,10 L10,7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const ALIGN_H: { id: TextAlignH; title: string; icon: ReactNode }[] = [
  {
    id: 'left',
    title: 'Left',
    icon: (
      <svg width={14} height={12} viewBox="0 0 14 12">
        {[
          [0, 2, 14, 2],
          [0, 6, 10, 6],
          [0, 10, 12, 10],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        ))}
      </svg>
    ),
  },
  {
    id: 'center',
    title: 'Center',
    icon: (
      <svg width={14} height={12} viewBox="0 0 14 12">
        {[
          [0, 2, 14, 2],
          [2, 6, 12, 6],
          [1, 10, 13, 10],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        ))}
      </svg>
    ),
  },
  {
    id: 'right',
    title: 'Right',
    icon: (
      <svg width={14} height={12} viewBox="0 0 14 12">
        {[
          [0, 2, 14, 2],
          [4, 6, 14, 6],
          [2, 10, 14, 10],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        ))}
      </svg>
    ),
  },
];

function AlignGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; title: string; icon: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              title={o.title}
              aria-pressed={on}
              data-sett-dd=""
              data-open={on ? '1' : undefined}
              onClick={() => onChange(o.id)}
              style={{
                width: 28,
                height: 28,
                minWidth: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: on ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {o.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Full V9 Text tab — color, size 10–24, B/I, content, V/H align, rotation for vline. */
export function ObsidianTextPane({
  draft,
  patchStyle,
  onTextChange,
}: ObsidianTextPaneProps) {
  const style = draft.style;
  const [sizeOpen, setSizeOpen] = useState(false);
  const showAlign = !['arrowMarker', 'arrowUp', 'arrowDown'].includes(draft.type);
  const showRotation = draft.type === 'vline';

  return (
    <>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}
      >
        FORMATTING
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Text</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettColorSwatch
            color={style.textColor}
            showOpacity={false}
            onChange={({ color }) => {
              if (color) patchStyle({ textColor: color });
            }}
          />
          <SettSizeDropdown
            value={style.fontSize}
            open={sizeOpen}
            onOpenChange={setSizeOpen}
            onChange={(fontSize) => patchStyle({ fontSize })}
          />
          <SettBIToggle
            bold={style.textBold}
            italic={style.textItalic}
            onBold={() => patchStyle({ textBold: !style.textBold })}
            onItalic={() => patchStyle({ textItalic: !style.textItalic })}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}
      >
        CONTENT
      </div>
      <textarea
        value={draft.text ?? ''}
        onChange={(e) => onTextChange(e.target.value)}
        rows={4}
        placeholder="Enter text..."
        style={{
          width: '100%',
          minHeight: 72,
          marginBottom: 16,
          resize: 'vertical',
          outline: 'none',
        }}
      />

      {showAlign && (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              marginBottom: 10,
            }}
          >
            ALIGNMENT
          </div>
          <AlignGroup
            label="Vertical"
            value={style.textAlignV}
            options={ALIGN_V}
            onChange={(textAlignV) => patchStyle({ textAlignV })}
          />
          <AlignGroup
            label="Horizontal"
            value={style.textAlignH}
            options={ALIGN_H}
            onChange={(textAlignH) => patchStyle({ textAlignH })}
          />
          {showRotation && (
            <AlignGroup
              label="Rotation"
              value={style.textOrientation}
              options={[
                {
                  id: 'horizontal' as TextOrientation,
                  title: 'Horizontal',
                  icon: (
                    <svg width={14} height={14} viewBox="0 0 14 14">
                      {[
                        [2, 4, 12, 4],
                        [2, 7, 10, 7],
                        [2, 10, 11, 10],
                      ].map(([x1, y1, x2, y2], i) => (
                        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      ))}
                    </svg>
                  ),
                },
                {
                  id: 'vertical' as TextOrientation,
                  title: 'Vertical',
                  icon: (
                    <svg width={14} height={14} viewBox="0 0 14 14">
                      <g transform="translate(7,7) rotate(90) translate(-7,-7)">
                        {[
                          [2, 4, 12, 4],
                          [2, 7, 10, 7],
                          [2, 10, 11, 10],
                        ].map(([x1, y1, x2, y2], i) => (
                          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        ))}
                      </g>
                    </svg>
                  ),
                },
              ]}
              onChange={(textOrientation) => patchStyle({ textOrientation })}
            />
          )}
        </>
      )}
    </>
  );
}
