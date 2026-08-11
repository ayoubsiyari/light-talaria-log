import type { ChartBarWithVolume } from '@/types/bar';
import { sanitizeOhlc } from './ohlcGuard';

/** Bytes per bar in packed binary format: time(f64) + ohlcv(f32×5) = 8 + 20 = 28 */
export const BYTES_PER_BAR = 28;

export interface BinaryBarStore {
  time: Float64Array;
  open: Float32Array;
  high: Float32Array;
  low: Float32Array;
  close: Float32Array;
  volume: Float32Array;
  length: number;
}

export function createBarStore(capacity: number): BinaryBarStore {
  return {
    time: new Float64Array(capacity),
    open: new Float32Array(capacity),
    high: new Float32Array(capacity),
    low: new Float32Array(capacity),
    close: new Float32Array(capacity),
    volume: new Float32Array(capacity),
    length: 0,
  };
}

export function toChartBars(store: BinaryBarStore, from: number, to: number): ChartBarWithVolume[] {
  const end = Math.min(to, store.length);
  const bars: ChartBarWithVolume[] = [];
  let prevClose = 0;
  for (let i = from; i < end; i++) {
    let ohlc = sanitizeOhlc({
      open: store.open[i]!,
      high: store.high[i]!,
      low: store.low[i]!,
      close: store.close[i]!,
    });
    // Keep logical length stable — flat-fill only when totally unusable.
    if (!ohlc) {
      if (!(prevClose > 0)) continue;
      ohlc = {
        open: prevClose,
        high: prevClose,
        low: prevClose,
        close: prevClose,
      };
    }
    prevClose = ohlc.close;
    bars.push({
      time: store.time[i]!,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
      volume: store.volume[i]!,
    });
  }
  return bars;
}

export function packStore(store: BinaryBarStore): ArrayBuffer {
  const n = store.length;
  const buf = new ArrayBuffer(n * BYTES_PER_BAR);
  const view = new DataView(buf);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    view.setFloat64(offset, store.time[i], true);
    offset += 8;
    view.setFloat32(offset, store.open[i], true);
    offset += 4;
    view.setFloat32(offset, store.high[i], true);
    offset += 4;
    view.setFloat32(offset, store.low[i], true);
    offset += 4;
    view.setFloat32(offset, store.close[i], true);
    offset += 4;
    view.setFloat32(offset, store.volume[i], true);
    offset += 4;
  }
  return buf;
}

export function unpackBuffer(buf: ArrayBuffer): BinaryBarStore {
  const n = buf.byteLength / BYTES_PER_BAR;
  const store = createBarStore(n);
  const view = new DataView(buf);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    store.time[i] = view.getFloat64(offset, true);
    offset += 8;
    store.open[i] = view.getFloat32(offset, true);
    offset += 4;
    store.high[i] = view.getFloat32(offset, true);
    offset += 4;
    store.low[i] = view.getFloat32(offset, true);
    offset += 4;
    store.close[i] = view.getFloat32(offset, true);
    offset += 4;
    store.volume[i] = view.getFloat32(offset, true);
    offset += 4;
  }
  store.length = n;
  return store;
}
