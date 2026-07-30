import type { ChartInstance } from '@/chart/createChart';

/** Live chart engines by pane id — TF switch reads camera from here (not stale React range). */
const charts = new Map<string, ChartInstance>();

export function registerChart(chartId: string, instance: ChartInstance): void {
  charts.set(chartId, instance);
}

export function unregisterChart(chartId: string, instance?: ChartInstance): void {
  if (instance && charts.get(chartId) !== instance) return;
  charts.delete(chartId);
}

export function getChart(chartId: string): ChartInstance | null {
  return charts.get(chartId) ?? null;
}
