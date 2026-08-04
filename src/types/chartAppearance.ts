export type GridLineStyle = 'solid' | 'dashed' | 'dotted';
export type LastPriceLineStyle = 'solid' | 'dashed' | 'dotted';
export type AppearanceSeriesType = 'candle' | 'bar' | 'line';
export type AppearanceCrosshairMode = 'normal' | 'magnet' | 'magnetOhlc' | 'hidden';

/** Full chart + chrome appearance (TradingView-style settings). */
export interface ChartAppearance {
  /* ── Symbol / series ─────────────────────────────── */
  seriesType: AppearanceSeriesType;
  showBody: boolean;
  showBorder: boolean;
  showWick: boolean;
  /** Hollow up candles (body fill off for close ≥ open). */
  hollowCandles: boolean;
  /** Color by close vs previous close (else open vs close). */
  colorBasedOnPrevClose: boolean;
  upBody: string;
  downBody: string;
  upBorder: string;
  downBorder: string;
  upWick: string;
  downWick: string;
  /** Line series */
  lineColor: string | null;
  lineWidth: number;

  /* ── Volume ──────────────────────────────────────── */
  showVolume: boolean;
  volumeOpacity: number;

  /* ── Status line (legend) ────────────────────────── */
  statusShowSymbol: boolean;
  statusShowInterval: boolean;
  statusShowOhlc: boolean;
  statusShowChange: boolean;
  statusShowVolumeLegend: boolean;

  /* ── Scales & lines ──────────────────────────────── */
  crosshairMode: AppearanceCrosshairMode;
  crosshair: string | null;
  showLastPrice: boolean;
  showLastPriceLabel: boolean;
  lastPriceLineStyle: LastPriceLineStyle;
  showPriceScale: boolean;
  showTimeScale: boolean;
  axisText: string | null;

  /* ── Canvas ──────────────────────────────────────── */
  /** null = follow theme token */
  background: string | null;
  gridHorizontal: string | null;
  gridVertical: string | null;
  showGridH: boolean;
  showGridV: boolean;
  gridHStyle: GridLineStyle;
  gridVStyle: GridLineStyle;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkColor: string | null;
  watermarkOpacity: number;
  watermarkFontSize: number;

  /* ── Layout chrome ───────────────────────────────── */
  showTopBar: boolean;
  showBottomBar: boolean;
  showToolbar: boolean;
  topBarBg: string | null;
  bottomBarBg: string | null;
  toolbarBg: string | null;
  chromeText: string | null;
  chromeBorder: string | null;
  /**
   * UI accent — buttons, TF selection, active tools, focus rings.
   * null = Hero theme `--accent`.
   */
  accent: string | null;
  /** Text/icon on solid accent surfaces; null = auto from luminance. */
  accentForeground: string | null;
}

export const DEFAULT_CHART_APPEARANCE: ChartAppearance = {
  seriesType: 'candle',
  showBody: true,
  showBorder: true,
  showWick: true,
  hollowCandles: false,
  colorBasedOnPrevClose: false,
  upBody: '#089981',
  downBody: '#F23645',
  upBorder: '#089981',
  downBorder: '#F23645',
  upWick: '#089981',
  downWick: '#F23645',
  lineColor: null,
  lineWidth: 2,

  showVolume: false,
  volumeOpacity: 0.4,

  statusShowSymbol: true,
  statusShowInterval: true,
  statusShowOhlc: true,
  statusShowChange: true,
  statusShowVolumeLegend: true,

  crosshairMode: 'normal',
  crosshair: null,
  showLastPrice: true,
  showLastPriceLabel: true,
  lastPriceLineStyle: 'dashed',
  showPriceScale: true,
  showTimeScale: true,
  axisText: null,

  background: null,
  gridHorizontal: null,
  gridVertical: null,
  showGridH: true,
  showGridV: true,
  gridHStyle: 'solid',
  gridVStyle: 'solid',
  watermarkEnabled: false,
  watermarkText: '',
  watermarkColor: null,
  watermarkOpacity: 0.12,
  watermarkFontSize: 48,

  showTopBar: true,
  showBottomBar: true,
  showToolbar: true,
  topBarBg: null,
  bottomBarBg: null,
  toolbarBg: null,
  chromeText: null,
  chromeBorder: null,
  accent: null,
  accentForeground: null,
};
