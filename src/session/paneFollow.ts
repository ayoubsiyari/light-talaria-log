import { MAX_BARS_IN_MEMORY, VISIBLE_BARS_TARGET } from '@/utils/constants';

/**
 * Whether this pane should tip-follow / tip-chase fill-ahead during Play.
 * Detaching one pane must not force every sibling onto the detached path.
 */
export function paneFollowsTip(
  paneId: string,
  defaultFollow: boolean,
  detachedPaneIds?: ReadonlySet<string> | null,
): boolean {
  if (!defaultFollow) return false;
  if (detachedPaneIds?.has(paneId)) return false;
  return true;
}

/** Bar-count zoom for a pane; falls back to session.span. */
export function paneSpanOrDefault(
  paneId: string,
  fallback: number,
  paneSpans?: Readonly<Record<string, number>> | null,
): number {
  const raw = paneSpans?.[paneId];
  const n =
    typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.max(10, Math.min(MAX_BARS_IN_MEMORY, VISIBLE_BARS_TARGET, n));
}
