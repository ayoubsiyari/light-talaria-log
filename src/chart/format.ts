import {
  formatZonedClockHms,
  formatZonedCrosshairTime,
  formatZonedTime,
} from '@/chart/timezone';

/** Per-instrument price display (from InstrumentSpec.digits). */
export interface PriceFormat {
  /** Fixed decimal places (FX 5/3, NQ 2, …). */
  digits: number;
  /** Optional min increment — used for axis tick alignment. */
  tickSize?: number;
}

export type PriceFormatter = (price: number) => string;

/** Format with instrument digits, or adaptive fallback when digits unknown. */
export function formatPrice(price: number, digits?: number): string {
  if (!Number.isFinite(price)) return '—';
  if (digits != null && Number.isFinite(digits) && digits >= 0) {
    return price.toFixed(Math.min(12, Math.max(0, Math.floor(digits))));
  }
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(1);
  if (abs >= 1) return price.toFixed(4);
  return price.toFixed(5);
}

export function createPriceFormatter(fmt: PriceFormat | number): PriceFormatter {
  const digits = typeof fmt === 'number' ? fmt : fmt.digits;
  return (price: number) => formatPrice(price, digits);
}

/** Snap a price to the instrument tick (half-up). */
export function snapPriceToTick(price: number, tickSize: number): number {
  if (!(tickSize > 0) || !Number.isFinite(price)) return price;
  const ticks = Math.round(price / tickSize);
  const rounded = ticks * tickSize;
  // Avoid 1.2500000001 drift for binary fractions (0.25, etc.).
  const decimals = Math.min(
    12,
    Math.max(0, Math.ceil(-Math.log10(tickSize)) + 1),
  );
  const f = 10 ** decimals;
  return Math.round(rounded * f) / f;
}

/** Axis time label — respects chart timezone setting. */
export function formatTime(unixSec: number): string {
  return formatZonedTime(unixSec);
}

/** Crosshair chip — weekday + time in chart timezone. */
export function formatCrosshairTime(unixSec: number): string {
  return formatZonedCrosshairTime(unixSec);
}

/** HH:mm:ss for HUD / replay clock. */
export function formatClockHms(unixSec: number): string {
  return formatZonedClockHms(unixSec);
}
