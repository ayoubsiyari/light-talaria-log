/**
 * Luminance / contrast helpers for chart plot surfaces.
 * Keeps axis, watermark, and overlay text readable when the user
 * sets a light or dark `--chart-bg` independently of the app theme.
 */

export function parseHexRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const raw = hex.trim();
  const m6 = raw.match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (m6) {
    const h = m6[1]!;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const m3 = raw.match(/^#?([0-9a-fA-F]{3})$/);
  if (m3) {
    const h = m3[1]!;
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    };
  }
  const mRgb = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  if (mRgb) {
    return {
      r: Math.round(Number(mRgb[1])),
      g: Math.round(Number(mRgb[2])),
      b: Math.round(Number(mRgb[3])),
    };
  }
  return null;
}

/** Relative luminance 0–1 (sRGB YIQ-ish, same as accent contrastOn). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHexRgb(color);
  if (!rgb) return null;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

export function isLightColor(color: string, threshold = 0.62): boolean {
  const lum = relativeLuminance(color);
  if (lum == null) return false;
  return lum > threshold;
}

/** Solid text on a filled chip/button. */
export function contrastOn(bg: string): string {
  return isLightColor(bg) ? '#0a0a0a' : '#ffffff';
}

/** Primary plot text (status symbol, OHLC). */
export function contrastPlotText(bg: string): string {
  return isLightColor(bg) ? '#18181b' : '#f4f6fb';
}

/** Muted plot text (axes, watermark, interval). */
export function contrastPlotMuted(bg: string): string {
  return isLightColor(bg) ? '#52525b' : '#8b95a8';
}

/** Soft grid line that stays visible on light or dark plots. */
export function contrastPlotGrid(bg: string): string {
  return isLightColor(bg) ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)';
}

/** Rough contrast ratio from YIQ luminances (not full WCAG sRGB). */
export function roughContrastRatio(fg: string, bg: string): number | null {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  if (a == null || b == null) return null;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * If `fg` is missing or washed out on `bg`, return a readable fallback.
 * Used so stale light axis/status colors cannot disappear on a white plot.
 */
export function ensureContrastText(
  fg: string | null | undefined,
  bg: string,
  kind: 'text' | 'muted' = 'muted',
): string {
  const fallback =
    kind === 'text' ? contrastPlotText(bg) : contrastPlotMuted(bg);
  if (!fg) return fallback;
  const ratio = roughContrastRatio(fg, bg);
  // ~3:1 keeps axes/labels readable; below that → auto-pick
  if (ratio == null || ratio < 3) return fallback;
  return fg;
}
