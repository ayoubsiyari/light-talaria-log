export function formatPrice(price: number): string {
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(1);
  if (abs >= 1) return price.toFixed(4);
  return price.toFixed(5);
}

export function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}
