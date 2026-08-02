/**
 * Backtest results live outside the chart engine (like orders / replay cursor).
 * In-memory for the open chart session; cleared on exit.
 * Durable copy for Journal is written via `journalStore` (Step 14).
 */
import type { BacktestResult, BacktestStatus } from '@/types/backtest';

export interface BacktestUiState {
  status: BacktestStatus;
  result: BacktestResult | null;
  error: string | null;
  /** Optional note (e.g. truncated cap). */
  note: string | null;
}

let state: BacktestUiState = {
  status: 'idle',
  result: null,
  error: null,
  note: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getBacktestState(): BacktestUiState {
  return state;
}

export function subscribeBacktest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setBacktestRunning(): void {
  // Clear previous overlays so cancel/re-run never paints stale markers.
  state = { status: 'running', result: null, error: null, note: null };
  emit();
}

export function setBacktestResult(result: BacktestResult, note: string | null = null): void {
  state = { status: 'done', result, error: null, note };
  emit();
}

export function setBacktestError(message: string): void {
  state = { status: 'error', result: null, error: message, note: null };
  emit();
}

export function setBacktestCancelled(): void {
  state = { status: 'cancelled', result: null, error: null, note: null };
  emit();
}

export function clearBacktestResult(): void {
  state = { status: 'idle', result: null, error: null, note: null };
  emit();
}
