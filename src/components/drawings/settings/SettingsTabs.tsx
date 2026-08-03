export interface SettingsTabItem<T extends string = string> {
  id: T;
  label: string;
}

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
    <div className="flex border-b border-border px-3 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              'px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap min-h-11 shrink-0',
              active
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted hover:text-foreground',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
