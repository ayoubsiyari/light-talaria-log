export type ChromeColorMode = 'dark' | 'light';
export type ChromeThemeAttr = 'dark' | 'light' | 'light-soft';

export const CHROME_FONT_UI: string;
export const CHROME_FONT_DISPLAY: string;
export const CHROME_FONT_MONO: string;
export const CHROME_BRAND: Record<string, string>;

export function formatTfLabel(t: string | null | undefined): string | null | undefined;
export function formatV9HudDateLineTitle(
  ms: number,
  convertToTimezone?: (ms: number) => Date,
): string;
export function chromeTokens(colorMode?: ChromeColorMode): Record<string, string | number>;
export function chromeDarkTokens(): Record<string, string | number>;

export interface ChromePreset {
  id: number;
  key: string;
  short: string;
  label: string;
  orderMode: string;
  lightTheme: 'light' | 'light-soft';
}

export const CHROME_PRESETS: ChromePreset[];
export function chromePresetById(id: number): ChromePreset;
export function resolveChromeThemeAttr(
  colorMode: ChromeColorMode,
  presetId: number,
): ChromeThemeAttr;
export function readStoredChromeColorMode(): ChromeColorMode;
export function readStoredChromePresetId(): number;
export function persistChromeColorMode(mode: ChromeColorMode): void;
export function persistChromePresetId(id: number): void;
export function chromeToolClusters(): {
  cursor: unknown[];
  drawing: unknown[];
  analysis: unknown[];
  management: unknown[];
};
