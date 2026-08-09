import type { Drawing } from '@/drawings/drawingStore';
import {
  normalizeVisRanges,
  type VisRanges,
} from '@/drawings/drawingStyle';
import { SettCheckbox, SettRow } from './SettCheckbox';
import { SettVisRanges } from './SettVisRanges';

interface ObsidianVisibilityPaneProps {
  draft: Drawing;
  onChange: (partial: Partial<Drawing>) => void;
  onVisRangesChange: (ranges: VisRanges) => void;
}

/** Visibility tab — Visible + Locked toggles + SettVisRanges. */
export function ObsidianVisibilityPane({
  draft,
  onChange,
  onVisRangesChange,
}: ObsidianVisibilityPaneProps) {
  const ranges = normalizeVisRanges(draft.meta?.visRanges);

  return (
    <>
      <SettRow
        label={
          <SettCheckbox
            checked={draft.visible !== false}
            onChange={(visible) => onChange({ visible })}
            label="Visible"
          />
        }
      />
      <SettRow
        label={
          <SettCheckbox
            checked={!!draft.locked}
            onChange={(locked) => onChange({ locked })}
            label="Locked"
          />
        }
      />
      <div data-sett-rule="" style={{ margin: '8px 0' }} />
      <SettVisRanges value={ranges} onChange={onVisRangesChange} />
      <p
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          marginTop: 8,
        }}
      >
        Ranges store in drawing meta (visRanges). Paint/filter wiring comes later —
        use Object tree to show/hide globally.
      </p>
    </>
  );
}
