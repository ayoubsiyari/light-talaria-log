/**
 * V9 chrome helpers used by the chart shell.
 * Do not export or mount TalariaV8bLive from here.
 */
export {
  CHROME_FONT_UI,
  CHROME_FONT_MONO,
  formatTfLabel,
  chromeTokens,
  chromeToolClusters,
  chromePresetById,
  resolveChromeThemeAttr,
  readStoredChromeColorMode,
  readStoredChromePresetId,
  persistChromeColorMode,
  persistChromePresetId,
} from './chromeTheme.js';

export { installForbidNativeTooltips } from './forbidNativeTooltips.js';
export { useChromeTheme } from './useChromeTheme';
export { ChromeIcon } from './chromeIcons.jsx';