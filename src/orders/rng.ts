/**
 * Seeded PRNG for deterministic slippage / optional randomness.
 * Math.random is banned inside src/orders/ (except journal display timestamps).
 */

/** mulberry32 — small, fast, deterministic. */
export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const next = t >>> 0;
  const value = ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** Hash a session id string into a u32 seed. */
export function seedFromSessionId(sessionId: string): number {
  let h = 2166136261;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}
