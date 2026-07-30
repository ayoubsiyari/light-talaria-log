import type { ChartBar } from '@/types/bar';

/** Matches Lightweight Charts CrosshairMode. */
export type CrosshairMode = 'normal' | 'magnet' | 'magnetOhlc' | 'hidden';

export type SeriesType = 'candle' | 'bar' | 'line';

export interface CrosshairPoint {
  /** Canvas x (media pixels). */
  x: number;
  /** Canvas y (media pixels). */
  y: number;
  /** Snapped or free logical index. */
  index: number;
  time: number;
  price: number;
  bar: ChartBar | null;
  barIndex: number | null;
}

export type CrosshairListener = (point: CrosshairPoint | null) => void;

export interface VolumeSettings {
  visible: boolean;
  /** 0–1 histogram opacity */
  opacity: number;
}

export interface ChartViewOptions {
  seriesType: SeriesType;
  crosshairMode: CrosshairMode;
  showVolume: boolean;
  showLastPrice: boolean;
  volumeOpacity: number;
}
