import {
  DEFAULT_CHART_APPEARANCE,
  type ChartAppearance,
} from '@/types/chartAppearance';

const STORAGE_KEY = 'talaria.chartAppearance.v1';

type Listener = (a: ChartAppearance) => void;

let current: ChartAppearance = { ...DEFAULT_CHART_APPEARANCE };
const listeners = new Set<Listener>();

function readStored(): ChartAppearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

  setCssVar('--chrome-topbar', a.topBarBg);
  setCssVar('--chrome-bottombar', a.bottomBarBg);
  setCssVar('--chrome-toolbar', a.toolbarBg);
  setCssVar('--chrome-foreground', a.chromeText);
  setCssVar('--chrome-border', a.chromeBorder);

  // Boolean / style flags for canvas (read in getChartColors)
  setCssVar('--chart-show-body', a.showBody ? '1' : '0');
  setCssVar('--chart-show-border', a.showBorder ? '1' : '0');
  setCssVar('--chart-show-wick', a.showWick ? '1' : '0');
  setCssVar('--chart-show-grid-h', a.showGridH ? '1' : '0');
  setCssVar('--chart-show-grid-v', a.showGridV ? '1' : '0');
  setCssVar('--chart-grid-h-style', a.gridHStyle);
  setCssVar('--chart-grid-v-style', a.gridVStyle);
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
