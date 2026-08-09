import {
  formatZonedClockHms,
  formatZonedCrosshairTime,
  formatZonedTime,
} from '@/chart/timezone';

export function formatPrice(price: number): string {
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(1);
  if (abs >= 1) return price.toFixed(4);
  return price.toFixed(5);
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
