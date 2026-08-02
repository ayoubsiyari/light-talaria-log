import type { GridLineStyle, LastPriceLineStyle } from '@/types/chartAppearance';

/**
 * Maps Hero UI CSS variables (+ appearance overrides) to canvas theme colors.
 * Reads computed styles at runtime so dark/light and Settings modal work.
 */
export interface ChartColors {
  background: string;
  text: string;
  muted: string;
  grid: string;
  gridHorizontal: string;
  gridVertical: string;
  showGridH: boolean;
  showGridV: boolean;
  gridHStyle: GridLineStyle;
  gridVStyle: GridLineStyle;
  border: string;
  upColor: string;
  downColor: string;
  upBody: string;
  downBody: string;
  upBorder: string;
  downBorder: string;
  upWick: string;
  downWick: string;
  showBody: boolean;
  showBorder: boolean;
  showWick: boolean;
  hollowCandles: boolean;
  colorBasedOnPrevClose: boolean;
  lineColor: string;
  lineWidth: number;
  crosshair: string;
  axisText: string;
  showPriceScale: boolean;
  showTimeScale: boolean;
  showLastPrice: boolean;
  showLastPriceLabel: boolean;
  lastPriceLineStyle: LastPriceLineStyle;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkColor: string;
  watermarkOpacity: number;
  watermarkFontSize: number;
  accent: string;
  /** Handle fill (selection points). */
  handleFill: string;
  /** Label chip background behind drawing text. */
  labelBg: string;
  /** Text on solid up/down / accent chips (TV last-price axis label). */
  onSolid: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function cssFlag(name: string, defaultOn: boolean): boolean {
  if (typeof document === 'undefined') return defaultOn;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v === '') return defaultOn;
  return v !== '0' && v !== 'false';
}

function cssStyle(name: string, fallback: GridLineStyle): GridLineStyle {
  const v = cssVar(name, fallback);
  if (v === 'dashed' || v === 'dotted' || v === 'solid') return v;
  return fallback;
}

function cssNumber(name: string, fallback: number): number {
  const v = cssVar(name, String(fallback));
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.classList.contains('dark');
}

/** Read Hero UI tokens + appearance overrides from :root / .dark */
export function getChartColors(): ChartColors {
  const dark = isDarkTheme();
  const themeBg = cssVar('--background', dark ? '#0a0a0f' : '#f4f4f5');
  const themeGrid = cssVar('--border', dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)');
  const up = cssVar('--success', '#17c964');
  const down = cssVar('--danger', '#f31260');
  const upBody = cssVar('--chart-up-body', up);
  const downBody = cssVar('--chart-down-body', down);
  const text = cssVar('--foreground', dark ? '#ecedee' : '#18181b');
  const muted = cssVar('--muted', dark ? '#71717a' : '#71717a');
  const lastStyle = cssVar('--chart-last-price-style', 'dashed');
  const lastPriceLineStyle: LastPriceLineStyle =
    lastStyle === 'solid' || lastStyle === 'dotted' || lastStyle === 'dashed'
      ? lastStyle
      : 'dashed';

  return {
    background: cssVar('--chart-bg', themeBg),
    text,
    muted,
    grid: themeGrid,
    gridHorizontal: cssVar('--chart-grid-h', themeGrid),
    gridVertical: cssVar('--chart-grid-v', themeGrid),
    showGridH: cssFlag('--chart-show-grid-h', true),
    showGridV: cssFlag('--chart-show-grid-v', true),
    gridHStyle: cssStyle('--chart-grid-h-style', 'solid'),
    gridVStyle: cssStyle('--chart-grid-v-style', 'solid'),
    border: cssVar('--separator', dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
    upColor: upBody,
    downColor: downBody,
    upBody,
    downBody,
    upBorder: cssVar('--chart-up-border', upBody),
    downBorder: cssVar('--chart-down-border', downBody),
    upWick: cssVar('--chart-up-wick', upBody),
    downWick: cssVar('--chart-down-wick', downBody),
    showBody: cssFlag('--chart-show-body', true),
    showBorder: cssFlag('--chart-show-border', true),
    showWick: cssFlag('--chart-show-wick', true),
    hollowCandles: cssFlag('--chart-hollow', false),
    colorBasedOnPrevClose: cssFlag('--chart-color-prev-close', false),
    lineColor: cssVar('--chart-line', upBody),
    lineWidth: Math.min(8, Math.max(1, cssNumber('--chart-line-width', 2))),
    crosshair: cssVar('--chart-crosshair', muted),
    axisText: cssVar('--chart-axis-text', muted),
    showPriceScale: cssFlag('--chart-show-price-scale', true),
    showTimeScale: cssFlag('--chart-show-time-scale', true),
    showLastPrice: cssFlag('--chart-show-last-price', true),
    showLastPriceLabel: cssFlag('--chart-show-last-price-label', true),
    lastPriceLineStyle,
    watermarkEnabled: cssFlag('--chart-watermark', false),
    watermarkText: cssVar('--chart-watermark-text', ''),
    watermarkColor: cssVar('--chart-watermark-color', muted),
    watermarkOpacity: Math.min(1, Math.max(0, cssNumber('--chart-watermark-opacity', 0.12))),
    watermarkFontSize: Math.min(120, Math.max(16, cssNumber('--chart-watermark-size', 48))),
    accent: cssVar('--accent', '#006fee'),
    handleFill: cssVar('--surface', dark ? '#18181b' : '#ffffff'),
    labelBg: dark ? 'rgba(19,23,34,0.88)' : 'rgba(255,255,255,0.92)',
    onSolid: '#ffffff',
  };
}
