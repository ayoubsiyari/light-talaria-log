/** Hex / HSV helpers + custom-color persistence for the TV-style picker. */

const CUSTOM_KEY = 'fast-chart:custom-colors';
const MAX_CUSTOM = 8;

/** Full TradingView-like grid (10 × 7). */
export const TV_COLOR_GRID: readonly string[] = [
  // Grayscale
  '#FFFFFF',
  '#E0E3EB',
  '#B2B5BE',
  '#9598A1',
  '#787B86',
  '#5D606B',
  '#434651',
  '#2A2E39',
  '#131722',
  '#000000',
  // Reds → pinks (light)
  '#FFEBEE',
  '#FCE4EC',
  '#F3E5F5',
  '#EDE7F6',
  '#E8EAF6',
  '#E3F2FD',
  '#E0F7FA',
  '#E0F2F1',
  '#E8F5E9',
  '#FFF8E1',
  // Mid lights
  '#FFCDD2',
  '#F8BBD0',
  '#E1BEE7',
  '#D1C4E9',
  '#C5CAE9',
  '#BBDEFB',
  '#B2EBF2',
  '#B2DFDB',
  '#C8E6C9',
  '#FFE0B2',
  // Mid
  '#EF5350',
  '#EC407A',
  '#AB47BC',
  '#7E57C2',
  '#5C6BC0',
  '#42A5F5',
  '#26C6DA',
  '#26A69A',
  '#66BB6A',
  '#FFA726',
  // Strong (TV defaults)
  '#F44336',
  '#E91E63',
  '#9C27B0',
  '#673AB7',
  '#3F51B5',
  '#2196F3',
  '#00BCD4',
  '#009688',
  '#4CAF50',
  '#FF9800',
  // Deep
  '#C62828',
  '#AD1457',
  '#6A1B9A',
  '#4527A0',
  '#283593',
  '#1565C0',
  '#00838F',
  '#00695C',
  '#2E7D32',
  '#EF6C00',
  // Chart classics
  '#FF5252',
  '#FF4081',
  '#E040FB',
  '#7C4DFF',
  '#536DFE',
  '#448AFF',
  '#18FFFF',
  '#64FFDA',
  '#69F0AE',
  '#FFD740',
] as const;

export function normalizeHex(input: string): string | null {
  const s = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1]!;
    const g = s[2]!;
    const b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: h * 360, s, v: max };
}

export function hsvToRgb(
  h: number,
  s: number,
  v: number,
): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 210, s: 1, v: 1 };
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

export function loadCustomColors(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c) => (typeof c === 'string' ? normalizeHex(c) : null))
      .filter((c): c is string => !!c)
      .slice(0, MAX_CUSTOM);
  } catch {
    return [];
  }
}

export function saveCustomColor(hex: string): string[] {
  const n = normalizeHex(hex);
  if (!n) return loadCustomColors();
  const prev = loadCustomColors().filter((c) => c !== n);
  const next = [n, ...prev].slice(0, MAX_CUSTOM);
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function removeCustomColor(hex: string): string[] {
  const n = normalizeHex(hex);
  const next = loadCustomColors().filter((c) => c !== n);
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
