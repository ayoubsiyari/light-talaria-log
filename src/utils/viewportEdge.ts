import { BUFFER_BARS } from '@/utils/constants';

/** Fraction of BUFFER_BARS that triggers an edge prefetch. */
export const EDGE_PREFETCH_RATIO = 0.35;

export interface BufferEdgeCheck {
  localFrom: number;
  localTo: number;
  bufferLen: number;
  windowFrom: number;
  totalBars: number;
}

/** True when visible local range is near a buffer edge that still has series data. */
export function isNearBufferEdge(opts: BufferEdgeCheck): boolean {
  const edge = BUFFER_BARS * EDGE_PREFETCH_RATIO;
  // Empty left pad (negative fromIndex) → always try history load (TV-style).
  // Also when approaching buffer start and series has older bars (windowFrom > 0).
  const nearLeft =
    opts.localFrom < 0 ||
    (opts.localFrom < edge && opts.windowFrom > 0);
  const nearRight =
    opts.localTo > opts.bufferLen - edge &&
    opts.windowFrom + opts.bufferLen < opts.totalBars;
  return nearLeft || nearRight;
}
