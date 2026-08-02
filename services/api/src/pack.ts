/** Packed bar format — must match client `BYTES_PER_BAR = 28`. */
export const BYTES_PER_BAR = 28;
export const CHUNK_SIZE = 5000;

export function packBars(
  times: number[],
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): Buffer {
  const n = times.length;
  const buf = Buffer.alloc(n * BYTES_PER_BAR);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    buf.writeDoubleLE(times[i]!, offset);
    offset += 8;
    buf.writeFloatLE(opens[i]!, offset);
    offset += 4;
    buf.writeFloatLE(highs[i]!, offset);
    offset += 4;
    buf.writeFloatLE(lows[i]!, offset);
    offset += 4;
    buf.writeFloatLE(closes[i]!, offset);
    offset += 4;
    buf.writeFloatLE(volumes[i]!, offset);
    offset += 4;
  }
  return buf;
}

/** Deterministic demo OHLC (~1000 1m bars) for SaaS seed. */
export function buildDemoBars(count = 1000): {
  times: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
} {
  const start = Date.UTC(2024, 0, 2, 8, 0, 0) / 1000;
  const times: number[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];
  let price = 1.1045;
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < count; i++) {
    const open = price;
    const delta = (rand() - 0.48) * 0.0015;
    const close = open + delta;
    const high = Math.max(open, close) + rand() * 0.0004;
    const low = Math.min(open, close) - rand() * 0.0004;
    times.push(start + i * 60);
    opens.push(open);
    highs.push(high);
    lows.push(low);
    closes.push(close);
    volumes.push(50 + rand() * 200);
    price = close;
  }
  return { times, opens, highs, lows, closes, volumes };
}
