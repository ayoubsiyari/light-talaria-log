import type { ChartAppearance } from '@/types/chartAppearance';
import type { ThemeMode } from '@/theme/theme';

/** Hex #RRGGBB + 0–100 opacity → #RRGGBBAA */
export function withOpacity(hex: string, opacityPct: number): string {
  const h = hex.replace('#', '').slice(0, 6);
  const a = Math.max(0, Math.min(255, Math.round((opacityPct / 100) * 255)));
  return `#${h}${a.toString(16).padStart(2, '0')}`;
}

export interface ChartStyleTemplate {
  id: string;
  name: string;
  /** Apply matching app chrome theme. */
  theme: ThemeMode;
  /** Preview swatches: [bg, bull, bear] */
  preview: [string, string, string];
  /** Partial appearance applied on select (merged onto current). */
  patch: Partial<ChartAppearance>;
}

function darkCandlePatch(
  bull: string,
  bullPct: number,
  bear: string,
  bearPct: number,
  bg: string,
): Partial<ChartAppearance> {
  const up = withOpacity(bull, bullPct);
  const down = withOpacity(bear, bearPct);
  return {
    seriesType: 'candle',
    showBody: true,
    showBorder: false,
    showWick: true,
    hollowCandles: false,
    upBody: up,
    downBody: down,
    upBorder: up,
    downBorder: down,
    upWick: up,
    downWick: down,
    background: bg,
    gridHorizontal: withOpacity('#ffffff', 6),
    gridVertical: withOpacity('#ffffff', 6),
    showGridH: true,
    showGridV: true,
    axisText: withOpacity('#ffffff', 45),
    crosshair: withOpacity('#ffffff', 35),
  };
}

function lightCandlePatch(
  bull: string,
  bullPct: number,
  bear: string,
  bearPct: number,
  bg: string,
  border = '#000000',
): Partial<ChartAppearance> {
  const up = withOpacity(bull, bullPct);
  const down = withOpacity(bear, bearPct);
  return {
    seriesType: 'candle',
    showBody: true,
    showBorder: true,
    showWick: true,
    hollowCandles: false,
    upBody: up,
    downBody: down,
    upBorder: border,
    downBorder: border,
    upWick: border,
    downWick: border,
    background: bg,
    gridHorizontal: withOpacity('#000000', 8),
    gridVertical: withOpacity('#000000', 8),
    showGridH: true,
    showGridV: true,
    axisText: withOpacity('#000000', 55),
    crosshair: withOpacity('#000000', 40),
  };
}

/**
 * Community chart style templates (bg + candle palette).
 * FVG/IFVG zone colors are noted for future drawing styles — not wired yet.
 */
export const CHART_STYLE_TEMPLATES: readonly ChartStyleTemplate[] = [
  {
    id: 'sapphire',
    name: 'Sapphire',
    theme: 'dark',
    preview: ['#080808', '#d3ddf4', '#787b86'],
    patch: darkCandlePatch('#d3ddf4', 71, '#787b86', 71, '#080808'),
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    theme: 'dark',
    preview: ['#080808', '#c90111', '#474747'],
    patch: darkCandlePatch('#c90111', 53, '#474747', 53, '#080808'),
  },
  {
    id: 'zenith',
    name: 'Zenith',
    theme: 'dark',
    preview: ['#080808', '#5778d3', '#bcc7ed'],
    patch: darkCandlePatch('#5778d3', 71, '#bcc7ed', 71, '#080808'),
  },
  {
    id: 'pearl',
    name: 'Pearl',
    theme: 'light',
    preview: ['#b7bbc3', '#aaced4', '#5b6372'],
    patch: lightCandlePatch('#aaced4', 71, '#5b6372', 83, '#b7bbc3'),
  },
  {
    id: 'olive',
    name: 'Olive',
    theme: 'light',
    preview: ['#b7bbc3', '#6c898d', '#5b6372'],
    patch: lightCandlePatch('#6c898d', 71, '#5b6372', 83, '#b7bbc3'),
  },
  {
    id: 'willow',
    name: 'Willow',
    theme: 'light',
    preview: ['#b7bac1', '#8b8f93', '#054244'],
    patch: lightCandlePatch('#8b8f93', 71, '#054244', 83, '#b7bac1'),
  },
  {
    id: 'marine',
    name: 'Marine',
    theme: 'light',
    preview: ['#b7bbc3', '#aeb4c9', '#0e347d'],
    patch: lightCandlePatch('#aeb4c9', 71, '#0e347d', 83, '#b7bbc3'),
  },
  {
    id: 'blue-ash',
    name: 'Blue Ash',
    theme: 'light',
    preview: ['#b7bbc3', '#7889a1', '#5b6372'],
    patch: lightCandlePatch('#7889a1', 71, '#5b6372', 83, '#b7bbc3'),
  },
];

export function getChartStyleTemplate(id: string): ChartStyleTemplate | undefined {
  return CHART_STYLE_TEMPLATES.find((t) => t.id === id);
}
