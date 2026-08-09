export interface SettingsTabItem<T extends string = string> {
  id: T;
  label: string;
}

/** Obsidian pill tabs — uses [data-sett-nav] chrome-settings.css. */
export function SettingsTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly SettingsTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav data-sett-nav="" data-tool-sett-nav="" role="tablist" aria-label="Settings tabs">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? '1' : undefined}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
