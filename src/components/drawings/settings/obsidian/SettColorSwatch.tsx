import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  TV_COLOR_GRID,
  hexToHsv,
  hsvToHex,
  loadCustomColors,
  normalizeHex,
  saveCustomColor,
} from './tvColorUtils';

interface SettColorSwatchProps {
  color: string;
  opacity?: number;
  onChange: (partial: { color?: string; opacity?: number }) => void;
  disabled?: boolean;
  title?: string;
  /** Show opacity slider (default true). */
  showOpacity?: boolean;
  active?: boolean;
}

type PickerView = 'palette' | 'custom';

/**
 * TradingView-style color well: palette grid, custom row with +,
 * and HSV editor when + is pressed.
 */
export function SettColorSwatch({
  color,
  opacity = 1,
  onChange,
  disabled = false,
  title = 'Color',
  showOpacity = true,
  active: activeProp,
}: SettColorSwatchProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PickerView>('palette');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [customs, setCustoms] = useState<string[]>(() => loadCustomColors());
  const [draftHex, setDraftHex] = useState(color);
  const [hsv, setHsv] = useState(() => hexToHsv(color));

  const panelW = view === 'custom' ? 260 : 236;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
    const estH = view === 'custom' ? 280 : showOpacity ? 320 : 260;
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - 8) {
      top = Math.max(8, r.top - estH - 6);
    }
    setPos({ top, left });
  }, [open, showOpacity, view, panelW]);

  useEffect(() => {
    if (!open) return;
    const hex = normalizeHex(color) ?? color;
    setDraftHex(hex);
    setHsv(hexToHsv(hex));
    setCustoms(loadCustomColors());
    setView('palette');
  }, [open, color]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'custom') setView('palette');
        else setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, view]);

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

  const active = activeProp ?? open;
  const opacityPct = Math.round(Math.max(0, Math.min(1, opacity)) * 100);
  const hueColor = hsvToHex(hsv.h, 1, 1);
  const currentHex = normalizeHex(color) ?? color;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-v9-color-swatch=""
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        style={{
          backgroundColor: color,
          opacity: disabled ? 0.38 : opacity,
          cursor: disabled ? 'not-allowed' : 'default',
          outline: active
            ? '2px solid color-mix(in oklab, var(--accent) 55%, transparent)'
            : undefined,
          outlineOffset: 1,
        }}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            data-v9-chrome="1"
            data-tv-cp="1"
            data-view={view}
            className="fixed z-[220]"
            style={{ top: pos.top, left: pos.left, width: panelW }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {view === 'palette' ? (
              <>
                <div data-tv-cp-grid="">
                  {TV_COLOR_GRID.map((c) => {
                    const selected =
                      currentHex.toLowerCase() === c.toLowerCase();
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
                    const selected =
                      currentHex.toLowerCase() === c.toLowerCase();
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
                            onChange({
                              opacity: Number(e.target.value) / 100,
                            })
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
          </div>,
          document.body,
        )}
    </>
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
