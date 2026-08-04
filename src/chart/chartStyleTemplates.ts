import { patchAppearance, resetAppearance } from '@/chart/appearanceStore';
import type { ChartAppearance } from '@/types/chartAppearance';
import { setTheme, type ThemeMode } from '@/theme/theme';

/** Hex #RRGGBB + 0–100 opacity → #RRGGBBAA */
export function withOpacity(hex: string, opacityPct: number): string {
  const h = hex.replace('#', '').slice(0, 6);
  const a = Math.max(0, Math.min(255, Math.round((opacityPct / 100) * 255)));
  return `#${h}${a.toString(16).padStart(2, '0')}`;
}

const ACTIVE_KEY = 'talaria.chartStyleTemplate.v1';

export type ChartTemplateCategory = 'mix' | 'dark' | 'light' | 'classic';

export interface ChartStyleTemplate {
  id: string;
  name: string;
  /** Short blurb shown in the templates menu. */
  description: string;
  category: ChartTemplateCategory;
  /** Apply matching app chrome theme. */
  theme: ThemeMode;
  /** Preview swatches: [bg, bull, bear, accent?] */
  preview: [string, string, string] | [string, string, string, string];
  /** Partial appearance applied on select (merged onto current). */
  patch: Partial<ChartAppearance>;
}

interface PaletteOpts {
  bull: string;
  bullPct?: number;
  bear: string;
  bearPct?: number;
  bg: string;
  /** Optional distinct wick / border (defaults to body). */
  wickUp?: string;
  wickDown?: string;
  borderUp?: string;
  borderDown?: string;
  gridPct?: number;
  axisPct?: number;
  crosshairPct?: number;
  showBorder?: boolean;
  hollow?: boolean;
  seriesType?: ChartAppearance['seriesType'];
  showVolume?: boolean;
  volumeOpacity?: number;
  gridStyle?: ChartAppearance['gridHStyle'];
  lineColor?: string;
  chromeBg?: string;
  watermark?: boolean;
  watermarkText?: string;
}

/** Complete dark chart look — series, grid, scales, volume, chrome tint. */
function fullDark(p: PaletteOpts): Partial<ChartAppearance> {
  const bullPct = p.bullPct ?? 100;
  const bearPct = p.bearPct ?? 100;
  const up = withOpacity(p.bull, bullPct);
  const down = withOpacity(p.bear, bearPct);
  const upW = p.wickUp ? withOpacity(p.wickUp, bullPct) : up;
  const downW = p.wickDown ? withOpacity(p.wickDown, bearPct) : down;
  const upB = p.borderUp ? withOpacity(p.borderUp, bullPct) : up;
  const downB = p.borderDown ? withOpacity(p.borderDown, bearPct) : down;
  const gridPct = p.gridPct ?? 7;
  const axisPct = p.axisPct ?? 48;
  const xPct = p.crosshairPct ?? 40;
  const chrome = p.chromeBg ?? p.bg;

  return {
    seriesType: p.seriesType ?? 'candle',
    showBody: true,
    showBorder: p.showBorder ?? false,
    showWick: true,
    hollowCandles: p.hollow ?? false,
    colorBasedOnPrevClose: false,
    upBody: up,
    downBody: down,
    upBorder: upB,
    downBorder: downB,
    upWick: upW,
    downWick: downW,
    lineColor: p.lineColor ?? p.bull,
    lineWidth: 2,

    showVolume: p.showVolume ?? true,
    volumeOpacity: p.volumeOpacity ?? 0.35,

    statusShowSymbol: true,
    statusShowInterval: true,
    statusShowOhlc: true,
    statusShowChange: true,
    statusShowVolumeLegend: true,

    crosshairMode: 'normal',
    crosshair: withOpacity('#ffffff', xPct),
    showLastPrice: true,
    showLastPriceLabel: true,
    lastPriceLineStyle: 'dashed',
    showPriceScale: true,
    showTimeScale: true,
    axisText: withOpacity('#ffffff', axisPct),

    background: p.bg,
    gridHorizontal: withOpacity('#ffffff', gridPct),
    gridVertical: withOpacity('#ffffff', gridPct),
    showGridH: true,
    showGridV: true,
    gridHStyle: p.gridStyle ?? 'solid',
    gridVStyle: p.gridStyle ?? 'solid',
    watermarkEnabled: p.watermark ?? false,
    watermarkText: p.watermarkText ?? 'Talaria Log',
    watermarkColor: withOpacity('#ffffff', 100),
    watermarkOpacity: 0.08,
    watermarkFontSize: 56,

    showTopBar: true,
    showBottomBar: true,
    showToolbar: true,
    topBarBg: chrome,
    bottomBarBg: chrome,
    toolbarBg: chrome,
    chromeText: withOpacity('#ffffff', 78),
    chromeBorder: withOpacity('#ffffff', 10),
  };
}

/** Complete light chart look. */
function fullLight(p: PaletteOpts): Partial<ChartAppearance> {
  const bullPct = p.bullPct ?? 100;
  const bearPct = p.bearPct ?? 100;
  const up = withOpacity(p.bull, bullPct);
  const down = withOpacity(p.bear, bearPct);
  const border = '#1a1a1a';
  const upW = p.wickUp ? withOpacity(p.wickUp, 100) : border;
  const downW = p.wickDown ? withOpacity(p.wickDown, 100) : border;
  const upB = p.borderUp ? withOpacity(p.borderUp, 100) : border;
  const downB = p.borderDown ? withOpacity(p.borderDown, 100) : border;
  const gridPct = p.gridPct ?? 9;
  const axisPct = p.axisPct ?? 55;
  const xPct = p.crosshairPct ?? 42;
  const chrome = p.chromeBg ?? p.bg;

  return {
    seriesType: p.seriesType ?? 'candle',
    showBody: true,
    showBorder: p.showBorder ?? true,
    showWick: true,
    hollowCandles: p.hollow ?? false,
    colorBasedOnPrevClose: false,
    upBody: up,
    downBody: down,
    upBorder: upB,
    downBorder: downB,
    upWick: upW,
    downWick: downW,
    lineColor: p.lineColor ?? p.bull,
    lineWidth: 2,

    showVolume: p.showVolume ?? true,
    volumeOpacity: p.volumeOpacity ?? 0.3,

    statusShowSymbol: true,
    statusShowInterval: true,
    statusShowOhlc: true,
    statusShowChange: true,
    statusShowVolumeLegend: true,

    crosshairMode: 'normal',
    crosshair: withOpacity('#000000', xPct),
    showLastPrice: true,
    showLastPriceLabel: true,
    lastPriceLineStyle: 'dashed',
    showPriceScale: true,
    showTimeScale: true,
    axisText: withOpacity('#000000', axisPct),

    background: p.bg,
    gridHorizontal: withOpacity('#000000', gridPct),
    gridVertical: withOpacity('#000000', gridPct),
    showGridH: true,
    showGridV: true,
    gridHStyle: p.gridStyle ?? 'solid',
    gridVStyle: p.gridStyle ?? 'solid',
    watermarkEnabled: p.watermark ?? false,
    watermarkText: p.watermarkText ?? 'Talaria Log',
    watermarkColor: withOpacity('#000000', 100),
    watermarkOpacity: 0.07,
    watermarkFontSize: 56,

    showTopBar: true,
    showBottomBar: true,
    showToolbar: true,
    topBarBg: chrome,
    bottomBarBg: chrome,
    toolbarBg: chrome,
    chromeText: withOpacity('#0a0a0a', 80),
    chromeBorder: withOpacity('#000000', 12),
  };
}

/**
 * Full chart style templates — colors, series, grid, volume, scales, chrome.
 * Apply via {@link applyChartStyleTemplate}.
 */
export const CHART_STYLE_TEMPLATES: readonly ChartStyleTemplate[] = [
  /* ── Color mix (hero set) ─────────────────────────── */
  {
    id: 'color-mix',
    name: 'Color Mix',
    description: 'Teal × coral on deep navy — balanced, high-contrast mix',
    category: 'mix',
    theme: 'dark',
    preview: ['#0b1220', '#2dd4bf', '#fb7185', '#6366f1'],
    patch: fullDark({
      bg: '#0b1220',
      bull: '#2dd4bf',
      bear: '#fb7185',
      chromeBg: '#0a101c',
      gridPct: 8,
      showVolume: true,
      volumeOpacity: 0.4,
      gridStyle: 'dotted',
      watermark: true,
    }),
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Violet × cyan glow on near-black',
    category: 'mix',
    theme: 'dark',
    preview: ['#0a0a12', '#a78bfa', '#22d3ee', '#f472b6'],
    patch: fullDark({
      bg: '#0a0a12',
      bull: '#22d3ee',
      bear: '#a78bfa',
      wickUp: '#67e8f9',
      wickDown: '#c4b5fd',
      chromeBg: '#08080f',
      gridPct: 6,
      showVolume: true,
      volumeOpacity: 0.38,
      gridStyle: 'dashed',
      watermark: true,
    }),
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Amber × slate fire on charcoal',
    category: 'mix',
    theme: 'dark',
    preview: ['#12100e', '#f59e0b', '#78716c', '#ef4444'],
    patch: fullDark({
      bg: '#12100e',
      bull: '#f59e0b',
      bear: '#78716c',
      wickUp: '#fbbf24',
      wickDown: '#a8a29e',
      chromeBg: '#0f0d0b',
      showVolume: true,
      volumeOpacity: 0.42,
      watermark: true,
    }),
  },
  {
    id: 'mint-rose',
    name: 'Mint Rose',
    description: 'Soft mint ups, rose downs — clean mix',
    category: 'mix',
    theme: 'dark',
    preview: ['#0c1412', '#6ee7b7', '#fb7185', '#94a3b8'],
    patch: fullDark({
      bg: '#0c1412',
      bull: '#6ee7b7',
      bear: '#fb7185',
      chromeBg: '#0a1210',
      showVolume: true,
      volumeOpacity: 0.36,
      gridStyle: 'dotted',
    }),
  },

  /* ── Classic ──────────────────────────────────────── */
  {
    id: 'classic',
    name: 'Classic',
    description: 'TradingView-style green / red on dark',
    category: 'classic',
    theme: 'dark',
    preview: ['#131722', '#089981', '#F23645'],
    patch: fullDark({
      bg: '#131722',
      bull: '#089981',
      bear: '#F23645',
      showBorder: true,
      chromeBg: '#131722',
      showVolume: true,
      volumeOpacity: 0.4,
      gridPct: 6,
    }),
  },
  {
    id: 'classic-light',
    name: 'Classic Light',
    description: 'Green / red on paper white',
    category: 'classic',
    theme: 'light',
    preview: ['#ffffff', '#089981', '#F23645'],
    patch: fullLight({
      bg: '#ffffff',
      bull: '#089981',
      bear: '#F23645',
      chromeBg: '#f8f9fb',
      showVolume: true,
      volumeOpacity: 0.28,
      gridPct: 7,
    }),
  },

  /* ── Dark community ───────────────────────────────── */
  {
    id: 'sapphire',
    name: 'Sapphire',
    description: 'Ice blue vs ash on pure black',
    category: 'dark',
    theme: 'dark',
    preview: ['#080808', '#d3ddf4', '#787b86'],
    patch: fullDark({
      bg: '#080808',
      bull: '#d3ddf4',
      bullPct: 71,
      bear: '#787b86',
      bearPct: 71,
      chromeBg: '#080808',
      showVolume: true,
    }),
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Blood red vs charcoal',
    category: 'dark',
    theme: 'dark',
    preview: ['#080808', '#c90111', '#474747'],
    patch: fullDark({
      bg: '#080808',
      bull: '#c90111',
      bullPct: 53,
      bear: '#474747',
      bearPct: 53,
      chromeBg: '#080808',
      showVolume: true,
    }),
  },
  {
    id: 'zenith',
    name: 'Zenith',
    description: 'Royal blue vs lavender haze',
    category: 'dark',
    theme: 'dark',
    preview: ['#080808', '#5778d3', '#bcc7ed'],
    patch: fullDark({
      bg: '#080808',
      bull: '#5778d3',
      bullPct: 71,
      bear: '#bcc7ed',
      bearPct: 71,
      chromeBg: '#080808',
      showVolume: true,
    }),
  },

  /* ── Light community ──────────────────────────────── */
  {
    id: 'pearl',
    name: 'Pearl',
    description: 'Cool aqua on soft steel',
    category: 'light',
    theme: 'light',
    preview: ['#b7bbc3', '#aaced4', '#5b6372'],
    patch: fullLight({
      bg: '#b7bbc3',
      bull: '#aaced4',
      bullPct: 71,
      bear: '#5b6372',
      bearPct: 83,
      chromeBg: '#c4c7ce',
      showVolume: true,
    }),
  },
  {
    id: 'olive',
    name: 'Olive',
    description: 'Muted teal vs slate',
    category: 'light',
    theme: 'light',
    preview: ['#b7bbc3', '#6c898d', '#5b6372'],
    patch: fullLight({
      bg: '#b7bbc3',
      bull: '#6c898d',
      bullPct: 71,
      bear: '#5b6372',
      bearPct: 83,
      chromeBg: '#c4c7ce',
      showVolume: true,
    }),
  },
  {
    id: 'willow',
    name: 'Willow',
    description: 'Silver ups, deep teal downs',
    category: 'light',
    theme: 'light',
    preview: ['#b7bac1', '#8b8f93', '#054244'],
    patch: fullLight({
      bg: '#b7bac1',
      bull: '#8b8f93',
      bullPct: 71,
      bear: '#054244',
      bearPct: 83,
      chromeBg: '#c3c5cb',
      showVolume: true,
    }),
  },
  {
    id: 'marine',
    name: 'Marine',
    description: 'Mist blue vs navy',
    category: 'light',
    theme: 'light',
    preview: ['#b7bbc3', '#aeb4c9', '#0e347d'],
    patch: fullLight({
      bg: '#b7bbc3',
      bull: '#aeb4c9',
      bullPct: 71,
      bear: '#0e347d',
      bearPct: 83,
      chromeBg: '#c4c7ce',
      showVolume: true,
    }),
  },
  {
    id: 'blue-ash',
    name: 'Blue Ash',
    description: 'Steel blue vs ash gray',
    category: 'light',
    theme: 'light',
    preview: ['#b7bbc3', '#7889a1', '#5b6372'],
    patch: fullLight({
      bg: '#b7bbc3',
      bull: '#7889a1',
      bullPct: 71,
      bear: '#5b6372',
      bearPct: 83,
      chromeBg: '#c4c7ce',
      showVolume: true,
    }),
  },

  /* ── Extra full looks ─────────────────────────────── */
  {
    id: 'hollow-night',
    name: 'Hollow Night',
    description: 'Hollow candles, dotted grid, volume on',
    category: 'dark',
    theme: 'dark',
    preview: ['#0e1116', '#26a69a', '#ef5350'],
    patch: fullDark({
      bg: '#0e1116',
      bull: '#26a69a',
      bear: '#ef5350',
      hollow: true,
      showBorder: true,
      chromeBg: '#0e1116',
      gridStyle: 'dotted',
      showVolume: true,
      volumeOpacity: 0.45,
    }),
  },
  {
    id: 'line-pulse',
    name: 'Line Pulse',
    description: 'Line series with Color Mix palette',
    category: 'mix',
    theme: 'dark',
    preview: ['#0b1220', '#2dd4bf', '#6366f1'],
    patch: fullDark({
      bg: '#0b1220',
      bull: '#2dd4bf',
      bear: '#fb7185',
      seriesType: 'line',
      lineColor: '#2dd4bf',
      chromeBg: '#0a101c',
      showVolume: true,
      gridStyle: 'dotted',
    }),
  },
];

export const CHART_TEMPLATE_CATEGORIES: {
  id: ChartTemplateCategory;
  label: string;
}[] = [
  { id: 'mix', label: 'Color mix' },
  { id: 'classic', label: 'Classic' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

export function getChartStyleTemplate(id: string): ChartStyleTemplate | undefined {
  return CHART_STYLE_TEMPLATES.find((t) => t.id === id);
}

export function getActiveTemplateId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveTemplateId(id: string | null): void {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

/** Apply a full chart template: appearance + chrome theme. */
export function applyChartStyleTemplate(id: string): ChartStyleTemplate | undefined {
  const t = getChartStyleTemplate(id);
  if (!t) return undefined;
  setTheme(t.theme);
  patchAppearance(t.patch);
  setActiveTemplateId(t.id);
  return t;
}

/** Reset appearance to defaults and clear active template. */
export function resetChartStyleTemplate(): void {
  resetAppearance();
  setTheme('dark');
  setActiveTemplateId(null);
}

/** Heuristic: does current appearance match a template’s core colors? */
export function matchTemplateId(a: ChartAppearance): string | null {
  const stored = getActiveTemplateId();
  if (stored && getChartStyleTemplate(stored)) return stored;
  for (const t of CHART_STYLE_TEMPLATES) {
    const bg = t.patch.background;
    const up = t.patch.upBody;
    const down = t.patch.downBody;
    if (
      bg &&
      up &&
      down &&
      a.background?.toLowerCase() === String(bg).toLowerCase() &&
      a.upBody.toLowerCase() === String(up).toLowerCase() &&
      a.downBody.toLowerCase() === String(down).toLowerCase()
    ) {
      return t.id;
    }
  }
  return null;
}
