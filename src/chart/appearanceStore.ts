import {
  DEFAULT_CHART_APPEARANCE,
  type ChartAppearance,
} from '@/types/chartAppearance';

const STORAGE_KEY = 'talaria.chartAppearance.v2';

type Listener = (a: ChartAppearance) => void;

let current: ChartAppearance = { ...DEFAULT_CHART_APPEARANCE };
const listeners = new Set<Listener>();

function readStored(): ChartAppearance {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('talaria.chartAppearance.v1');
    if (!raw) return { ...DEFAULT_CHART_APPEARANCE };
    const parsed = JSON.parse(raw) as Partial<ChartAppearance>;
    return { ...DEFAULT_CHART_APPEARANCE, ...parsed };
  } catch {
    return { ...DEFAULT_CHART_APPEARANCE };
  }
}

function setCssVar(name: string, value: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (value == null || value === '') {
    root.style.removeProperty(name);
  } else {
    root.style.setProperty(name, value);
  }
}

/** Readable text color on a solid accent fill. */
function contrastOn(hex: string): string {
  const h = hex.replace('#', '').slice(0, 6);
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#ffffff';
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0a0a0a' : '#ffffff';
}

function setFlag(name: string, on: boolean): void {
  setCssVar(name, on ? '1' : '0');
}

function setData(name: string, on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset[name] = on ? '1' : '0';
}

/** Push appearance into CSS variables consumed by chrome + chartTheme. */
export function applyAppearanceToDom(a: ChartAppearance): void {
  setCssVar('--chart-bg', a.background);
  setCssVar('--chart-grid-h', a.gridHorizontal);
  setCssVar('--chart-grid-v', a.gridVertical);
  setCssVar('--chart-crosshair', a.crosshair);
  setCssVar('--chart-up-body', a.upBody);
  setCssVar('--chart-down-body', a.downBody);
  setCssVar('--chart-up-border', a.upBorder);
  setCssVar('--chart-down-border', a.downBorder);
  setCssVar('--chart-up-wick', a.upWick);
  setCssVar('--chart-down-wick', a.downWick);
  setCssVar('--chart-line', a.lineColor);
  setCssVar('--chart-line-width', String(a.lineWidth));
  setCssVar('--chart-axis-text', a.axisText);
  setCssVar('--chart-last-price-style', a.lastPriceLineStyle);
  setCssVar('--chart-watermark-text', a.watermarkEnabled ? a.watermarkText : '');
  setCssVar('--chart-watermark-color', a.watermarkColor);
  setCssVar('--chart-watermark-opacity', String(a.watermarkOpacity));
  setCssVar('--chart-watermark-size', String(a.watermarkFontSize));

  setCssVar('--chrome-topbar', a.topBarBg);
  setCssVar('--chrome-bottombar', a.bottomBarBg);
  setCssVar('--chrome-toolbar', a.toolbarBg);
  setCssVar('--chrome-foreground', a.chromeText);
  setCssVar('--chrome-border', a.chromeBorder);

  // Buttons / selection / focus — Hero tokens; soft/hover derive from --accent
  setCssVar('--accent', a.accent);
  setCssVar(
    '--accent-foreground',
    a.accent
      ? (a.accentForeground ?? contrastOn(a.accent))
      : a.accentForeground,
  );

  setFlag('--chart-show-body', a.showBody);
  setFlag('--chart-show-border', a.showBorder);
  setFlag('--chart-show-wick', a.showWick);
  setFlag('--chart-hollow', a.hollowCandles);
  setFlag('--chart-color-prev-close', a.colorBasedOnPrevClose);
  setFlag('--chart-show-grid-h', a.showGridH);
  setFlag('--chart-show-grid-v', a.showGridV);
  setFlag('--chart-show-last-price', a.showLastPrice);
  setFlag('--chart-show-last-price-label', a.showLastPriceLabel);
  setFlag('--chart-show-price-scale', a.showPriceScale);
  setFlag('--chart-show-time-scale', a.showTimeScale);
  setFlag('--chart-watermark', a.watermarkEnabled);
  setCssVar('--chart-grid-h-style', a.gridHStyle);
  setCssVar('--chart-grid-v-style', a.gridVStyle);

  setData('showTopbar', a.showTopBar);
  setData('showBottombar', a.showBottomBar);
  setData('showToolbar', a.showToolbar);
}

export function getAppearance(): ChartAppearance {
  return current;
}

export function setAppearance(next: ChartAppearance): void {
  current = { ...DEFAULT_CHART_APPEARANCE, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  applyAppearanceToDom(current);
  for (const cb of listeners) cb(current);
}

export function patchAppearance(partial: Partial<ChartAppearance>): void {
  setAppearance({ ...current, ...partial });
}

export function resetAppearance(): void {
  setAppearance({ ...DEFAULT_CHART_APPEARANCE });
}

export function subscribeAppearance(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Call once at app boot (after theme init). */
export function initAppearance(): ChartAppearance {
  current = readStored();
  applyAppearanceToDom(current);
  return current;
}
