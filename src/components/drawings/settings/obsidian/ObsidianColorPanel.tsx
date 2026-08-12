import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  TV_COLOR_GRID,
  hexToHsv,
  hsvToHex,
  loadCustomColors,
  normalizeHex,
  saveCustomColor,
} from './tvColorUtils';

type PickerView = 'palette' | 'custom';

export interface ObsidianColorPanelProps {
  color: string;
  opacity?: number;
  onChange: (partial: { color?: string; opacity?: number }) => void;
  showOpacity?: boolean;
  /** Called when user presses Escape on palette view (parent may close popover). */
  onRequestClose?: () => void;
}

/**
 * Obsidian / TV color panel — palette grid, custom row with +, HSV editor.
 * Embed in popovers (SettColorSwatch, LineStylePickerFlyout). No native color input.
 */
export function ObsidianColorPanel({
  color,
  opacity = 1,
  onChange,
  showOpacity = true,
  onRequestClose,
}: ObsidianColorPanelProps) {
  const [view, setView] = useState<PickerView>('palette');
  const [customs, setCustoms] = useState<string[]>(() => loadCustomColors());
  const [draftHex, setDraftHex] = useState(color);
  const [hsv, setHsv] = useState(() => hexToHsv(color));

  useEffect(() => {
    const hex = normalizeHex(color) ?? color;
    setDraftHex(hex);
    setHsv(hexToHsv(hex));
    setCustoms(loadCustomColors());
  }, [color]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (view === 'custom') {
        e.stopPropagation();
        setView('palette');
        return;
      }
      onRequestClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, onRequestClose]);

  const applyColor = useCallback(
    (hex: string) => {
      const n = normalizeHex(hex);
      if (!n) return;
      setDraftHex(n);
      setHsv(hexToHsv(n));
      onChange({ color: n });
    },
    [onChange],
  );

  const setHsvLive = useCallback(
    (next: { h: number; s: number; v: number }) => {
      setHsv(next);
      const hex = hsvToHex(next.h, next.s, next.v);
      setDraftHex(hex);
      onChange({ color: hex });
    },
    [onChange],
  );

  const addCustom = () => {
    const n = normalizeHex(draftHex);
    if (!n) return;
    setCustoms(saveCustomColor(n));
    onChange({ color: n });
    setView('palette');
  };

  const opacityPct = Math.round(Math.max(0, Math.min(1, opacity)) * 100);
  const hueColor = hsvToHex(hsv.h, 1, 1);
  const currentHex = normalizeHex(color) ?? color;

  return (
    <div data-tv-cp="1" data-view={view} data-v9-chrome="1">
      {view === 'palette' ? (
        <>
          <div data-tv-cp-grid="">
            {TV_COLOR_GRID.map((c) => {
              const selected = currentHex.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  data-tv-cp-cell=""
                  data-active={selected ? '1' : undefined}
                  style={{ backgroundColor: c }}
                  onClick={() => applyColor(c)}
                />
              );
            })}
          </div>

          <div data-tv-cp-divider="" />

          <div data-tv-cp-customs="">
            {customs.map((c) => {
              const selected = currentHex.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  data-tv-cp-cell=""
                  data-active={selected ? '1' : undefined}
                  style={{ backgroundColor: c }}
                  onClick={() => applyColor(c)}
                />
              );
            })}
            <button
              type="button"
              data-tv-cp-add=""
              aria-label="Add custom color"
              title="Add custom color"
              onClick={() => {
                setHsv(hexToHsv(currentHex));
                setDraftHex(normalizeHex(currentHex) ?? '#2962FF');
                setView('custom');
              }}
            >
              +
            </button>
          </div>

          {showOpacity && (
            <div data-tv-cp-opacity="">
              <span data-tv-cp-opacity-lbl="">Opacity</span>
              <div data-tv-cp-opacity-row="">
                <div
                  data-tv-cp-opacity-track=""
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, transparent, ${currentHex}),
                      repeating-conic-gradient(#6b6e76 0% 25%, #9a9da5 0% 50%)
                    `,
                    backgroundSize: '100% 100%, 8px 8px',
                  }}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={opacityPct}
                    aria-label="Opacity"
                    onChange={(e) =>
                      onChange({ opacity: Number(e.target.value) / 100 })
                    }
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={opacityPct}
                  aria-label="Opacity percent"
                  data-tv-cp-opacity-num=""
                  onChange={(e) => {
                    const n = Math.max(
                      0,
                      Math.min(100, Number(e.target.value) || 0),
                    );
                    onChange({ opacity: n / 100 });
                  }}
                />
                <span data-tv-cp-opacity-unit="">%</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <CustomColorEditor
          hsv={hsv}
          draftHex={draftHex}
          hueColor={hueColor}
          onHsv={setHsvLive}
          onHexDraft={setDraftHex}
          onHexCommit={(hex) => {
            const n = normalizeHex(hex);
            if (!n) return;
            applyColor(n);
          }}
          onAdd={addCustom}
          onBack={() => setView('palette')}
        />
      )}
    </div>
  );
}

function CustomColorEditor({
  hsv,
  draftHex,
  hueColor,
  onHsv,
  onHexDraft,
  onHexCommit,
  onAdd,
  onBack,
}: {
  hsv: { h: number; s: number; v: number };
  draftHex: string;
  hueColor: string;
  onHsv: (h: { h: number; s: number; v: number }) => void;
  onHexDraft: (v: string) => void;
  onHexCommit: (hex: string) => void;
  onAdd: () => void;
  onBack: () => void;
}) {
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const live = useRef(hsv);
  live.current = hsv;

  const pickSv = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
      onHsv({ h: live.current.h, s, v });
    },
    [onHsv],
  );

  const pickHue = useCallback(
    (clientY: number) => {
      const el = hueRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
      onHsv({ h: t * 360, s: live.current.s, v: live.current.v });
    },
    [onHsv],
  );

  const armDrag = (
    e: ReactPointerEvent,
    move: (clientX: number, clientY: number) => void,
  ) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    move(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const preview = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <div data-tv-cp-custom="">
      <div data-tv-cp-custom-bar="">
        <button
          type="button"
          data-tv-cp-back=""
          aria-label="Back to palette"
          onClick={onBack}
        >
          ←
        </button>
        <i data-tv-cp-preview="" style={{ backgroundColor: preview }} />
        <input
          type="text"
          value={draftHex.startsWith('#') ? draftHex : `#${draftHex}`}
          spellCheck={false}
          aria-label="Hex color"
          data-tv-cp-hex=""
          onChange={(e) => {
            const v = e.target.value;
            onHexDraft(v);
            const n = normalizeHex(v);
            if (n) onHexCommit(n);
          }}
        />
        <button type="button" data-tv-cp-add-btn="" onClick={onAdd}>
          Add
        </button>
      </div>

      <div data-tv-cp-hs="">
        <div
          ref={svRef}
          data-tv-cp-sv=""
          style={{ backgroundColor: hueColor }}
          onPointerDown={(e) => armDrag(e, pickSv)}
        >
          <i data-tv-cp-sv-white="" />
          <i data-tv-cp-sv-black="" />
          <i
            data-tv-cp-sv-knob=""
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: preview,
            }}
          />
        </div>
        <div
          ref={hueRef}
          data-tv-cp-hue=""
          onPointerDown={(e) =>
            armDrag(e, (_x, y) => {
              pickHue(y);
            })
          }
        >
          <i
            data-tv-cp-hue-knob=""
            style={{ top: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
