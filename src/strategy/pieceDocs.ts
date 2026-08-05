/**
 * Rich docs for every puzzle piece — how it works + chart look.
 * Visual kinds drive SVG mini-chart previews in the builder.
 */
import type { PieceKind } from '@/strategy/graphTypes';

export type PieceVisualKind =
  | 'logic'
  | 'ma_cross'
  | 'ma_stack'
  | 'ma_slope'
  | 'osc_cross'
  | 'osc_level'
  | 'hist_flip'
  | 'band_touch'
  | 'squeeze'
  | 'breakout'
  | 'candle'
  | 'fvg'
  | 'fib'
  | 'sweep'
  | 'equal_levels'
  | 'zone'
  | 'impulse'
  | 'retest'
  | 'trail_flip'
  | 'cloud'
  | 'volatility'
  | 'session'
  | 'level_touch';

export interface PieceDoc {
  kind: PieceKind;
  /** Longer explanation of the rule. */
  howItWorks: string;
  /** What the user should see after Run on chart. */
  onChart: string;
  visual: PieceVisualKind;
}

export const PIECE_DOCS: Record<PieceKind, PieceDoc> = {

  and: {
    kind: 'and',
    howItWorks: 'Combines inputs: the node is true only when every wired condition is true at the same bar.',
    onChart: 'No diamond by itself — entry/exit fires when the whole AND path turns true (triangle + label).',
    visual: 'logic',
  },
  or: {
    kind: 'or',
    howItWorks: 'True when any wired input is true.',
    onChart: 'Entry/exit marks when the OR path rises; child pieces still paint their own diamonds.',
    visual: 'logic',
  },
  not: {
    kind: 'not',
    howItWorks: 'Inverts one input — true when that piece is false.',
    onChart: 'Useful as a filter; rising edge of NOT can trigger entry when the blocked condition clears.',
    visual: 'logic',
  },
  xor: {
    kind: 'xor',
    howItWorks: 'Exactly one of two inputs is true (exclusive or).',
    onChart: 'Fires when one side is on and the other off — diamond/entry labeled XOR(…).',
    visual: 'logic',
  },
  sma_cross: {
    kind: 'sma_cross',
    howItWorks: 'Fast SMA crosses above (buy) or below (sell) the slow SMA.',
    onChart: 'Diamond on the cross bar; optional SMA overlays appear after Run.',
    visual: 'ma_cross',
  },
  ema_cross: {
    kind: 'ema_cross',
    howItWorks: 'Same as SMA cross but with EMAs (reacts faster).',
    onChart: 'Diamond at the cross; EMA lines auto-show on the chart.',
    visual: 'ma_cross',
  },
  wma_cross: {
    kind: 'wma_cross',
    howItWorks: 'Weighted MA cross — recent bars weigh more than SMA.',
    onChart: 'Diamond on cross bar with WMA overlays when available.',
    visual: 'ma_cross',
  },
  hma_cross: {
    kind: 'hma_cross',
    howItWorks: 'Hull MA cross — smoother/faster trend flip signal.',
    onChart: 'Diamond when HMA fast crosses HMA slow.',
    visual: 'ma_cross',
  },
  donchian_break: {
    kind: 'donchian_break',
    howItWorks: 'Price breaks the prior N-bar high (buy) or low (sell).',
    onChart: 'Diamond at the breakout candle; Donchian channel can auto-show.',
    visual: 'breakout',
  },
  rsi_gate: {
    kind: 'rsi_gate',
    howItWorks: 'RSI is below level (buy / oversold) or above level (sell / overbought).',
    onChart: 'Diamond on the first bar RSI enters the zone; RSI pane may auto-open.',
    visual: 'osc_level',
  },
  rsi_cross: {
    kind: 'rsi_cross',
    howItWorks: 'RSI crosses up/down through a level (e.g. 50).',
    onChart: 'Diamond exactly on the cross bar in price + RSI context.',
    visual: 'osc_cross',
  },
  macd_cross: {
    kind: 'macd_cross',
    howItWorks: 'MACD line crosses its signal line.',
    onChart: 'Diamond on cross; MACD pane auto-shows after Run.',
    visual: 'osc_cross',
  },
  macd_hist_flip: {
    kind: 'macd_hist_flip',
    howItWorks: 'MACD histogram flips from ≤0 to >0 (buy) or reverse (sell).',
    onChart: 'Diamond when hist changes color/sign.',
    visual: 'hist_flip',
  },
  bb_touch: {
    kind: 'bb_touch',
    howItWorks: 'Close pierces lower Bollinger (buy) or upper (sell).',
    onChart: 'Diamond at the touch candle; BB bands overlay.',
    visual: 'band_touch',
  },
  bb_squeeze: {
    kind: 'bb_squeeze',
    howItWorks: 'Bandwidth was compressed, then expands (volatility ignition).',
    onChart: 'Diamond when expansion starts after a squeeze.',
    visual: 'squeeze',
  },
  bb_walk: {
    kind: 'bb_walk',
    howItWorks: 'Close stays outside the band for N bars (trend walk).',
    onChart: 'Diamond when the N-bar outside walk completes.',
    visual: 'band_touch',
  },
  keltner_break: {
    kind: 'keltner_break',
    howItWorks: 'Close breaks above/below EMA ± ATR channel.',
    onChart: 'Diamond on the break bar.',
    visual: 'breakout',
  },
  envelopes_touch: {
    kind: 'envelopes_touch',
    howItWorks: 'Close touches SMA envelope (± percent).',
    onChart: 'Diamond at envelope contact.',
    visual: 'band_touch',
  },
  price_vs_ma: {
    kind: 'price_vs_ma',
    howItWorks: 'Close crosses above/below a chosen MA.',
    onChart: 'Diamond on the cross through the MA.',
    visual: 'ma_cross',
  },
  ma_stack: {
    kind: 'ma_stack',
    howItWorks: 'Bull: price > fast > slow. Bear: price < fast < slow.',
    onChart: 'Diamond while stack aligns (rising edge into alignment).',
    visual: 'ma_stack',
  },
  ma_slope: {
    kind: 'ma_slope',
    howItWorks: 'MA is rising (buy) or falling (sell) over slope bars.',
    onChart: 'Diamond when slope direction is confirmed.',
    visual: 'ma_slope',
  },
  stoch_cross: {
    kind: 'stoch_cross',
    howItWorks: '%K crosses %D near oversold/overbought.',
    onChart: 'Diamond on the stoch cross; Stoch pane may open.',
    visual: 'osc_cross',
  },
  stoch_gate: {
    kind: 'stoch_gate',
    howItWorks: '%K is in oversold (buy) or overbought (sell).',
    onChart: 'Diamond when %K first enters the zone.',
    visual: 'osc_level',
  },
  atr_surge: {
    kind: 'atr_surge',
    howItWorks: 'ATR jumps above its average (volatility spike).',
    onChart: 'Diamond on the surge bar; side from candle direction.',
    visual: 'volatility',
  },
  atr_compress: {
    kind: 'atr_compress',
    howItWorks: 'ATR drops below its average (quiet market).',
    onChart: 'Diamond when compression begins — often a pre-breakout filter.',
    visual: 'volatility',
  },
  momentum: {
    kind: 'momentum',
    howItWorks: 'Rate of change crosses above/below zero.',
    onChart: 'Diamond on ROC zero-line cross.',
    visual: 'osc_cross',
  },
  roc_extreme: {
    kind: 'roc_extreme',
    howItWorks: 'ROC exceeds ± threshold percent.',
    onChart: 'Diamond when momentum is extreme.',
    visual: 'osc_level',
  },
  cci_gate: {
    kind: 'cci_gate',
    howItWorks: 'CCI beyond ±level (typically ±100).',
    onChart: 'Diamond when CCI enters extreme.',
    visual: 'osc_level',
  },
  cci_cross: {
    kind: 'cci_cross',
    howItWorks: 'CCI crosses a level (often 0).',
    onChart: 'Diamond on the CCI cross.',
    visual: 'osc_cross',
  },
  willr_gate: {
    kind: 'willr_gate',
    howItWorks: 'Williams %R in oversold/overbought.',
    onChart: 'Diamond when %R enters the zone.',
    visual: 'osc_level',
  },
  adx_trend: {
    kind: 'adx_trend',
    howItWorks: 'ADX rises through a trend-strength level.',
    onChart: 'Diamond when market turns from chop to trend.',
    visual: 'volatility',
  },
  ao_cross: {
    kind: 'ao_cross',
    howItWorks: 'Awesome Oscillator crosses zero.',
    onChart: 'Diamond on AO zero cross.',
    visual: 'osc_cross',
  },
  supertrend_flip: {
    kind: 'supertrend_flip',
    howItWorks: 'Close flips from one side of Supertrend to the other.',
    onChart: 'Diamond on the flip candle; trail flips color conceptually.',
    visual: 'trail_flip',
  },
  psar_flip: {
    kind: 'psar_flip',
    howItWorks: 'Parabolic SAR dots jump from below price to above (or reverse).',
    onChart: 'Diamond on the SAR flip bar.',
    visual: 'trail_flip',
  },
  ichimoku_tk_cross: {
    kind: 'ichimoku_tk_cross',
    howItWorks: 'Tenkan-sen crosses Kijun-sen.',
    onChart: 'Diamond on TK cross.',
    visual: 'ma_cross',
  },
  ichimoku_cloud: {
    kind: 'ichimoku_cloud',
    howItWorks: 'Close breaks out of the Ichimoku cloud.',
    onChart: 'Diamond when price exits the cloud boundary.',
    visual: 'cloud',
  },
  trix_cross: {
    kind: 'trix_cross',
    howItWorks: 'TRIX crosses zero.',
    onChart: 'Diamond on TRIX zero cross.',
    visual: 'osc_cross',
  },
  ppo_cross: {
    kind: 'ppo_cross',
    howItWorks: 'Percentage Price Oscillator crosses its signal.',
    onChart: 'Diamond on PPO signal cross.',
    visual: 'osc_cross',
  },
  aroon_cross: {
    kind: 'aroon_cross',
    howItWorks: 'Aroon Up crosses Aroon Down.',
    onChart: 'Diamond on Aroon cross.',
    visual: 'osc_cross',
  },
  chop_filter: {
    kind: 'chop_filter',
    howItWorks: 'Choppiness index says trend (low) or range (high).',
    onChart: 'Diamond when regime first matches the mode — use with AND.',
    visual: 'volatility',
  },
  candle_confirm: {
    kind: 'candle_confirm',
    howItWorks: 'N bars in a row advance (buy) or decline (sell) by reference.',
    onChart: 'Diamond on the confirming Nth candle.',
    visual: 'candle',
  },
  engulfing: {
    kind: 'engulfing',
    howItWorks: 'Current body fully engulfs prior body.',
    onChart: 'Diamond on the engulfing candle.',
    visual: 'candle',
  },
  pin_bar: {
    kind: 'pin_bar',
    howItWorks: 'Long rejection wick vs small body (hammer / shooting star).',
    onChart: 'Diamond on the pin bar.',
    visual: 'candle',
  },
  inside_bar: {
    kind: 'inside_bar',
    howItWorks: 'High/low inside the previous bar.',
    onChart: 'Diamond on the inside bar (compression).',
    visual: 'candle',
  },
  outside_bar: {
    kind: 'outside_bar',
    howItWorks: 'Bar engulfs prior high and low.',
    onChart: 'Diamond on the outside bar; side from close.',
    visual: 'candle',
  },
  doji: {
    kind: 'doji',
    howItWorks: 'Very small body vs range (indecision).',
    onChart: 'Diamond on the doji candle.',
    visual: 'candle',
  },
  gap: {
    kind: 'gap',
    howItWorks: 'Open gaps above prior high (buy) or below prior low (sell).',
    onChart: 'Diamond on the gap-open bar.',
    visual: 'candle',
  },
  body_direction: {
    kind: 'body_direction',
    howItWorks: 'Bullish close>open or bearish close<open.',
    onChart: 'Diamond on matching body bars (rising edge into that state).',
    visual: 'candle',
  },
  hh_ll: {
    kind: 'hh_ll',
    howItWorks: 'Makes a higher high (buy) or lower low (sell) vs lookback.',
    onChart: 'Diamond on the breakout extreme bar.',
    visual: 'breakout',
  },
  hl_lh: {
    kind: 'hl_lh',
    howItWorks: 'Higher low (buy structure) or lower high (sell structure).',
    onChart: 'Diamond when HL/LH prints.',
    visual: 'breakout',
  },
  session_range_break: {
    kind: 'session_range_break',
    howItWorks: 'Break of the first N bars of each UTC day (ORB-style).',
    onChart: 'Diamond when price closes beyond the day opening range.',
    visual: 'breakout',
  },
  morning_star: {
    kind: 'morning_star',
    howItWorks: '3-bar bullish reversal (bear → small → strong bull).',
    onChart: 'Diamond on the third candle.',
    visual: 'candle',
  },
  evening_star: {
    kind: 'evening_star',
    howItWorks: '3-bar bearish reversal.',
    onChart: 'Diamond on the third candle.',
    visual: 'candle',
  },
  three_soldiers: {
    kind: 'three_soldiers',
    howItWorks: 'Three strong consecutive bullish closes.',
    onChart: 'Diamond on the third soldier.',
    visual: 'candle',
  },
  three_crows: {
    kind: 'three_crows',
    howItWorks: 'Three strong consecutive bearish closes.',
    onChart: 'Diamond on the third crow.',
    visual: 'candle',
  },
  harami: {
    kind: 'harami',
    howItWorks: 'Small body inside prior opposite body.',
    onChart: 'Diamond on the harami candle.',
    visual: 'candle',
  },
  piercing_dark: {
    kind: 'piercing_dark',
    howItWorks: 'Piercing line (buy) or dark-cloud (sell) two-bar reverse.',
    onChart: 'Diamond on the second candle.',
    visual: 'candle',
  },
  marubozu: {
    kind: 'marubozu',
    howItWorks: 'Almost full-range body, tiny wicks.',
    onChart: 'Diamond on the marubozu.',
    visual: 'candle',
  },
  spinning_top: {
    kind: 'spinning_top',
    howItWorks: 'Small body with wicks both sides.',
    onChart: 'Diamond on the spinning top.',
    visual: 'candle',
  },
  tweezer: {
    kind: 'tweezer',
    howItWorks: 'Matching highs (sell) or lows (buy) on two bars.',
    onChart: 'Diamond on the second tweezer bar.',
    visual: 'candle',
  },
  nr_bar: {
    kind: 'nr_bar',
    howItWorks: 'Narrowest range in the last N bars (NR7-style).',
    onChart: 'Diamond on the NR bar — often precedes expansion.',
    visual: 'candle',
  },
  wide_range_bar: {
    kind: 'wide_range_bar',
    howItWorks: 'Range much larger than average (WRB).',
    onChart: 'Diamond on the wide bar; side from close.',
    visual: 'candle',
  },
  close_in_range: {
    kind: 'close_in_range',
    howItWorks: 'Close in the top (buy) or bottom (sell) of the bar.',
    onChart: 'Diamond when close sits in that zone.',
    visual: 'candle',
  },
  rejection_wick: {
    kind: 'rejection_wick',
    howItWorks: 'Wick is a large % of the bar (rejection).',
    onChart: 'Diamond on the rejection candle.',
    visual: 'candle',
  },
  two_bar_reversal: {
    kind: 'two_bar_reversal',
    howItWorks: 'Strong opposite close beyond prior extreme.',
    onChart: 'Diamond on the reversal bar.',
    visual: 'candle',
  },
  fvg: {
    kind: 'fvg',
    howItWorks: '3-candle fair value gap; price still inside the imbalance.',
    onChart: 'Diamond while price is in the FVG (rising edge into the gap).',
    visual: 'fvg',
  },
  ifvg: {
    kind: 'ifvg',
    howItWorks: 'Prior FVG inverted (traded through) then revisited.',
    onChart: 'Diamond on the inversion revisit.',
    visual: 'fvg',
  },
  ote_touch: {
    kind: 'ote_touch',
    howItWorks: 'Retrace into 62–79% of the recent swing (OTE).',
    onChart: 'Diamond when close sits in the OTE band.',
    visual: 'fib',
  },
  bos_choch: {
    kind: 'bos_choch',
    howItWorks: 'Close breaks prior swing high/low (structure break).',
    onChart: 'Diamond on the BOS bar.',
    visual: 'breakout',
  },
  liquidity_sweep: {
    kind: 'liquidity_sweep',
    howItWorks: 'Wick beyond swing then close back inside (stop hunt).',
    onChart: 'Diamond on the sweep candle.',
    visual: 'sweep',
  },
  equal_highs_lows: {
    kind: 'equal_highs_lows',
    howItWorks: 'Near-equal highs (sell liquidity) or lows (buy liquidity).',
    onChart: 'Diamond when equal levels form.',
    visual: 'equal_levels',
  },
  order_block: {
    kind: 'order_block',
    howItWorks: 'Last opposing candle before a displacement; price revisits that zone.',
    onChart: 'Diamond when price trades back into the OB.',
    visual: 'zone',
  },
  displacement: {
    kind: 'displacement',
    howItWorks: 'Impulse candle much larger than average range.',
    onChart: 'Diamond on the displacement bar.',
    visual: 'impulse',
  },
  breaker_block: {
    kind: 'breaker_block',
    howItWorks: 'Failed level that flips and gets retested.',
    onChart: 'Diamond on the breaker retest.',
    visual: 'zone',
  },
  premium_discount: {
    kind: 'premium_discount',
    howItWorks: 'Discount = below 50% of swing (buy); premium = above (sell).',
    onChart: 'Diamond when price is in that half of the range.',
    visual: 'fib',
  },
  fib_touch: {
    kind: 'fib_touch',
    howItWorks: 'Price touches a chosen fib of the swing (38.2/50/61.8/78.6).',
    onChart: 'Diamond when the fib level is tagged.',
    visual: 'fib',
  },
  retest_break: {
    kind: 'retest_break',
    howItWorks: 'Break a swing, then retest and hold.',
    onChart: 'Diamond on the successful retest bar.',
    visual: 'retest',
  },
  swing_failure: {
    kind: 'swing_failure',
    howItWorks: 'Failed break of a swing (SFP) — wick beyond, close inside.',
    onChart: 'Diamond on the failure candle.',
    visual: 'sweep',
  },
  untapped_extreme: {
    kind: 'untapped_extreme',
    howItWorks: 'Approaches a prior extreme that has not been revisited.',
    onChart: 'Diamond near the untapped high/low.',
    visual: 'equal_levels',
  },
  mss: {
    kind: 'mss',
    howItWorks: 'Market structure shift — body opens and closes beyond the swing.',
    onChart: 'Diamond on the MSS candle (stronger than a wick BOS).',
    visual: 'breakout',
  },
  killzone: {
    kind: 'killzone',
    howItWorks: 'True during a UTC killzone window (London/NY/Asia).',
    onChart: 'Diamond when the session window starts — combine with AND for entries.',
    visual: 'session',
  },
  asian_range_break: {
    kind: 'asian_range_break',
    howItWorks: 'Break of the 00:00–08:00 UTC Asian range later in the day.',
    onChart: 'Diamond on the break of Asia high/low.',
    visual: 'breakout',
  },
  london_open_break: {
    kind: 'london_open_break',
    howItWorks: 'Break of the first hour after 07:00 UTC.',
    onChart: 'Diamond when London open range breaks.',
    visual: 'breakout',
  },
  ny_open_break: {
    kind: 'ny_open_break',
    howItWorks: 'Break of the first hour after 12:00 UTC.',
    onChart: 'Diamond when NY open range breaks.',
    visual: 'breakout',
  },
  prev_day_hl: {
    kind: 'prev_day_hl',
    howItWorks: 'Close breaks prior UTC day high/low.',
    onChart: 'Diamond on the PDH/PDL break.',
    visual: 'breakout',
  },
  prev_week_hl: {
    kind: 'prev_week_hl',
    howItWorks: 'Close breaks prior week high/low.',
    onChart: 'Diamond on the PWH/PWL break.',
    visual: 'breakout',
  },
  week_open_break: {
    kind: 'week_open_break',
    howItWorks: 'Close breaks Monday’s week-open price.',
    onChart: 'Diamond on the week-open break.',
    visual: 'breakout',
  },
  round_number: {
    kind: 'round_number',
    howItWorks: 'Price tags a psychological step (e.g. 0.01).',
    onChart: 'Diamond when the round level is crossed/touched.',
    visual: 'level_touch',
  },
  day_of_week: {
    kind: 'day_of_week',
    howItWorks: 'True on the selected UTC weekday.',
    onChart: 'Diamond at the first bar of that weekday — use as AND filter.',
    visual: 'session',
  },
  hour_window: {
    kind: 'hour_window',
    howItWorks: 'True inside a UTC hour range.',
    onChart: 'Diamond when the hour window opens — filter with AND.',
    visual: 'session',
  },
};

export function getPieceDoc(kind: PieceKind): PieceDoc {
  return (
    PIECE_DOCS[kind] ?? {
      kind,
      howItWorks: 'Condition piece evaluated each bar in the Worker.',
      onChart: 'Diamond + label when it first turns true.',
      visual: 'candle' as PieceVisualKind,
    }
  );
}
