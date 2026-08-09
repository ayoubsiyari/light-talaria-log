/** Obsidian chip toggle (Extend / Labels) — styled by [data-sett-v3] CSS. */
export function SettingsChip({
  label,
  on,
  onClick,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-sett-chip=""
      data-on={on ? '1' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={disabled ? 'opacity-40 pointer-events-none' : ''}
      aria-pressed={on}
    >
      {label}
    </button>
  );
}
