/** Registry indicator ids (Worker-computed). */
export type IndicatorId =
  | 'sma'
  | 'ema'
  | 'wma'
  | 'hma'
  | 'vwma'
  | 'dema'
  | 'tema'
  | 'rma'
  | 'bb'
  | 'keltner'
  | 'donchian'
  | 'envelopes'
  | 'supertrend'
  | 'psar'
  | 'ichimoku'
  | 'vwap'
  | 'linearreg'
  | 'pivot'
  | 'atrBands'
  | 'rsi'
  | 'stoch'
  | 'stochrsi'
  | 'cci'
  | 'willr'
  | 'momentum'
  | 'roc'
  | 'macd'
  | 'ppo'
  | 'trix'
  | 'adx'
  | 'aroon'
  | 'ao'
  | 'ultimate'
  | 'vortex'
  | 'chop'
  | 'mfi'
  | 'obv'
  | 'adline'
  | 'cmf'
  | 'atr'
  | 'stddev'
  | 'fisher'
  | 'elderRay'
  | 'fvg'
  | 'orderBlock'
  | 'liquidity'
  | 'premiumDiscount'
  | 'killzone'
  | 'bosChoch'
  | 'ote';

export type IndicatorPlacement = 'overlay' | 'pane';

export type IndicatorSeriesStyle = 'line' | 'histogram' | 'band';

export type IndicatorCategory =
  | 'Moving Averages'
  | 'Volatility'
  | 'Oscillators'
  | 'Trend'
  | 'Volume'
  | 'ICT';

/** Flexible numeric/string params — keys defined per indicator via ParamField. */
export type IndicatorParams = Record<string, number | string | boolean>;

export interface ParamField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
}

export interface IndicatorDef {
  id: IndicatorId;
  label: string;
  shortLabel: string;
  category: IndicatorCategory;
  placement: IndicatorPlacement;
  defaultParams: IndicatorParams;
  fields: ParamField[];
  /** Number of colored series outputs (for theme palette). */
  seriesCount: number;
  scaleMode?: 'fixed' | 'auto';
  fixedMin?: number;
  fixedMax?: number;
  levels?: number[];
}

/** UI / runtime toggle — colors resolved on main from theme. */
export interface IndicatorInstance {
  key: string;
  id: IndicatorId;
  params: IndicatorParams;
  visible: boolean;
  colors: readonly string[];
}

/** Enabled indicator config owned by App (persisted in React state). */
export interface EnabledIndicator {
  id: IndicatorId;
  params: IndicatorParams;
  /** When false, kept in legend but not painted (default true). */
  visible?: boolean;
  /** Optional per-series color overrides (CSS colors). */
  colors?: string[];
  /** Stroke width for line series (default 1.5). */
  lineWidth?: number;
}

export interface IndicatorSeries {
  key: string;
  style: IndicatorSeriesStyle;
  color: string;
  values: Float32Array;
  bandPairKey?: string;
  lineWidth?: number;
}

export interface IndicatorOverlayResult {
  instanceKey: string;
  id: IndicatorId;
  label: string;
  placement: 'overlay';
  series: IndicatorSeries[];
}

export interface IndicatorPaneResult {
  instanceKey: string;
  id: IndicatorId;
  label: string;
  placement: 'pane';
  scaleMode: 'fixed' | 'auto';
  fixedMin?: number;
  fixedMax?: number;
  levels?: number[];
  series: IndicatorSeries[];
}

export type IndicatorComputeResult = IndicatorOverlayResult | IndicatorPaneResult;

export type IndicatorKind = IndicatorId;

export interface IndicatorWorkerSpec {
  key: string;
  id: IndicatorId;
  params: IndicatorParams;
}

export type IndicatorWorkerRequest = {
  type: 'compute';
  requestId: number;
  opens: Float32Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  volumes: Float32Array;
  times: Float64Array;
  specs: IndicatorWorkerSpec[];
};

export type IndicatorWorkerSeries = {
  key: string;
  style: IndicatorSeriesStyle;
  values: Float32Array;
  bandPairKey?: string;
};

export type IndicatorWorkerItem =
  | {
      instanceKey: string;
      id: IndicatorId;
      label: string;
      placement: 'overlay';
      series: IndicatorWorkerSeries[];
    }
  | {
      instanceKey: string;
      id: IndicatorId;
      label: string;
      placement: 'pane';
      scaleMode: 'fixed' | 'auto';
      fixedMin?: number;
      fixedMax?: number;
      levels?: number[];
      series: IndicatorWorkerSeries[];
    };

export type IndicatorWorkerResponse =
  | {
      type: 'result';
      requestId: number;
      items: IndicatorWorkerItem[];
    }
  | { type: 'error'; requestId: number; message: string };

export type IndicatorOverlay = IndicatorOverlayResult;
export type IndicatorPane = IndicatorPaneResult;

/** Soft caps so layout/FPS stay sane. */
/** Max total indicators on screen (overlays + panes). */
export const MAX_INDICATORS = 10;
/** Pane sub-cap within the total (layout height). */
export const MAX_PANE_INDICATORS = 4;
