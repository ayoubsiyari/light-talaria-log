import { useEffect, useMemo, useState } from 'react';
import { getTheme, subscribeTheme, type ThemeMode } from '@/theme/theme';
import {
  persistChromeColorMode,
  persistChromePresetId,
  readStoredChromeColorMode,
  readStoredChromePresetId,
  resolveChromeThemeAttr,
  type ChromeColorMode,
  type ChromeThemeAttr,
} from '@/v9/chromeTheme.js';

/**
 * Sync V9 chrome theme attrs with the app ThemeToggle (fast-chart.theme).
 * Preset cycles stay local to V9 storage for future rail control.
 */
export function useChromeTheme(): {
  colorMode: ChromeColorMode;
  presetId: number;
  themeAttr: ChromeThemeAttr;
  setPresetId: (id: number) => void;
} {
  const [colorMode, setColorMode] = useState<ChromeColorMode>(() => {
    const app = getTheme();
    return app === 'light' ? 'light' : readStoredChromeColorMode();
  });
  const [presetId, setPresetIdState] = useState(() => readStoredChromePresetId());

  useEffect(() => {
    const sync = (mode: ThemeMode) => {
      const next: ChromeColorMode = mode === 'light' ? 'light' : 'dark';
      setColorMode(next);
      persistChromeColorMode(next);
    };
    sync(getTheme());
    return subscribeTheme(sync);
  }, []);

  const setPresetId = (id: number) => {
    const n = id >= 1 && id <= 4 ? id : 1;
    setPresetIdState(n);
    persistChromePresetId(n);
  };

  const themeAttr = useMemo(
    () => resolveChromeThemeAttr(colorMode, presetId),
    [colorMode, presetId],
  );

  return { colorMode, presetId, themeAttr, setPresetId };
}
