/**
 * Maps Hero UI CSS variables to canvas theme colors.
 * Reads computed styles at runtime so dark/light switches work.
 */
export interface ChartColors {
  background: string;
  text: string;
  muted: string;
  grid: string;
  border: string;
  upColor: string;
  downColor: string;
  crosshair: string;
  accent: string;
  /** Handle fill (selection points). */
  handleFill: string;
  /** Label chip background behind drawing text. */
  labelBg: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.classList.contains('dark');
}

/** Read Hero UI tokens from :root / .dark */
export function getChartColors(): ChartColors {
  const dark = isDarkTheme();
  return {
    background: cssVar('--background', dark ? '#0a0a0f' : '#f4f4f5'),
    text: cssVar('--foreground', dark ? '#ecedee' : '#18181b'),
    muted: cssVar('--muted', dark ? '#71717a' : '#71717a'),
    grid: cssVar('--border', dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
    border: cssVar('--separator', dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
    upColor: cssVar('--success', '#17c964'),
    downColor: cssVar('--danger', '#f31260'),
    crosshair: cssVar('--muted', '#71717a'),
    accent: cssVar('--accent', '#006fee'),
    handleFill: cssVar('--surface', dark ? '#18181b' : '#ffffff'),
    labelBg: dark ? 'rgba(19,23,34,0.88)' : 'rgba(255,255,255,0.92)',
  };
}
