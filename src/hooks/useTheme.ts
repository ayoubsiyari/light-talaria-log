import { useEffect, useState } from 'react';
import {
  getTheme,
  setTheme as applyThemeMode,
  subscribeTheme,
  toggleTheme as toggleThemeMode,
  type ThemeMode,
} from '@/theme/theme';

/** Reactive dark / light mode (Hero UI `.dark` + `data-theme`). */
export function useTheme(): {
  theme: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
} {
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());

  useEffect(() => subscribeTheme(setThemeState), []);

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme: () => {
      toggleThemeMode();
    },
    setTheme: (mode) => {
      applyThemeMode(mode);
    },
  };
}
