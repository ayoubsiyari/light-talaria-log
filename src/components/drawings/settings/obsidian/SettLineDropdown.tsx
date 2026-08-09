import type { LineStyleKind } from '@/drawings/drawingStyle';
import {
  LINE_TYPE_OPTS,
  LineTypePreview,
  LineWidthPreview,
} from './dashPreview';
import { SettDropOption, SettDropdownShell } from './SettDropdownShell';

interface SettLineTypeDropdownProps {
  value: LineStyleKind;
  onChange: (v: LineStyleKind) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

/** Dash type dropdown with SVG previews (bold/solid, dotted, dashed, dashdot). */
export function SettLineTypeDropdown({
  value,
  onChange,
  open,
  onOpenChange,
  disabled,
}: SettLineTypeDropdownProps) {
  return (
    <SettDropdownShell
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      ariaLabel="Line style"
      btnWidth={56}
      preview={<LineTypePreview type={value} active={open} />}
    >
      {LINE_TYPE_OPTS.map((opt) => (
        <SettDropOption
          key={opt.id}
          selected={value === opt.id}
          onSelect={() => {
            onChange(opt.id);
            onOpenChange(false);
          }}
        >
          <LineTypePreview type={opt.id} active={value === opt.id} width={28} />
        </SettDropOption>
      ))}
    </SettDropdownShell>
  );
}

interface SettLineWidthDropdownProps {
  value: number;
  onChange: (w: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets?: readonly number[];
  disabled?: boolean;
  /** Highlighter-style "8x" text labels instead of stroke previews. */
  textMode?: boolean;
}

/** Width 1–4 (or highlighter presets) with SVG / text previews. */
export function SettLineWidthDropdown({
  value,
  onChange,
  open,
  onOpenChange,
  presets = [1, 2, 3, 4],
  disabled,
  textMode = false,
}: SettLineWidthDropdownProps) {
  const current = presets.includes(value)
    ? value
    : (presets.find((w) => w >= value) ?? presets[presets.length - 1]!);

  return (
    <SettDropdownShell
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      ariaLabel="Line width"
      btnWidth={56}
      rightAlign
      preview={
        textMode ? (
          <span
            style={{
              fontSize: 12,
              color: open ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {current}x
          </span>
        ) : (
          <LineWidthPreview widthPx={current} active={open} />
        )
      }
    >
      {presets.map((w) => (
        <SettDropOption
          key={w}
          selected={current === w}
          onSelect={() => {
            onChange(w);
            onOpenChange(false);
          }}
        >
          {textMode ? (
            <span
              style={{
                fontSize: 13,
                color:
                  current === w ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: current === w ? 700 : 500,
              }}
            >
              {w}x
            </span>
          ) : (
            <LineWidthPreview widthPx={w} active={current === w} previewW={28} />
          )}
        </SettDropOption>
      ))}
    </SettDropdownShell>
  );
}
