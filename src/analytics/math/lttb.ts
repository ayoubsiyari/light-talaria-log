/**
 * Largest-Triangle-Three-Buckets downsampling — preserves peaks/troughs (§6.4).
 * Returns indices into the source arrays.
 */
export function lttbIndices(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  threshold: number,
): Uint32Array {
  const n = x.length;
  if (threshold >= n || threshold < 3) {
    const all = new Uint32Array(n);
    for (let i = 0; i < n; i++) all[i] = i;
    return all;
  }

  const sampled = new Uint32Array(threshold);
  sampled[0] = 0;
  sampled[threshold - 1] = n - 1;

  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);

    const avgRangeStart = Math.floor((i + 2) * bucketSize) + 1;
    const avgRangeEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, n);

    let avgX = 0;
    let avgY = 0;
    const avgRangeLength = Math.max(1, avgRangeEnd - avgRangeStart);
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += x[j]!;
      avgY += y[j]!;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    let maxArea = -1;
    let nextA = rangeStart;
    const ax = x[a]!;
    const ay = y[a]!;

    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs(
        (ax - avgX) * (y[j]! - ay) - (ax - x[j]!) * (avgY - ay),
      );
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }
    sampled[i + 1] = nextA;
    a = nextA;
  }

  return sampled;
}
