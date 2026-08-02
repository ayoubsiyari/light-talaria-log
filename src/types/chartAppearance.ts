export type GridLineStyle = 'solid' | 'dashed' | 'dotted';

/** Full chart + chrome appearance (TradingView-style settings). */
export interface ChartAppearance {
  /** Candles */
  showBody: boolean;
  showBorder: boolean;
  showWick: boolean;
  upBody: string;
  downBody: string;
  upBorder: string;
  downBorder: string;
  upWick: string;
  downWick: string;

  /** Canvas — null = follow theme token */
  background: string | null;
  gridHorizontal: string | null;
  gridVertical: string | null;
  showGridH: boolean;
  showGridV: boolean;
  gridHStyle: GridLineStyle;
  gridVStyle: GridLineStyle;
  crosshair: string | null;

  /** App chrome — null = follow --surface / theme */
  topBarBg: string | null;
  bottomBarBg: string | null;
  toolbarBg: string | null;
  chromeText: string | null;
  chromeBorder: string | null;
}

export const DEFAULT_CHART_APPEARANCE: ChartAppearance = {
  showBody: true,
  showBorder: true,
  showWick: true,
  upBody: '#089981',
  downBody: '#F23645',
  upBorder: '#089981',
  downBorder: '#F23645',
  upWick: '#089981',
  downWick: '#F23645',

  background: null,
  gridHorizontal: null,
  gridVertical: null,
  showGridH: true,
  showGridV: true,
  gridHStyle: 'solid',
  gridVStyle: 'solid',
  crosshair: null,

  topBarBg: null,
  bottomBarBg: null,
  toolbarBg: null,
  chromeText: null,
  chromeBorder: null,
};
