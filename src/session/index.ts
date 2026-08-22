export type {
  PaneConfig,
  PaneView,
  RevealMode,
  SessionBounds,
  SessionState,
} from '@/session/sessionState';
export { createSessionController } from '@/session/sessionController';
export type { SessionController, CreateSessionArgs } from '@/session/sessionController';
export { revealedViewport, assertNoLookahead } from '@/session/revealedViewport';
export { warmCache, WarmCache, WARM_CACHE_MAX_ENTRIES } from '@/session/warmCache';
export { collectLiveCacheTargets } from '@/session/liveCacheTargets';
export { paneFollowsTip, paneSpanOrDefault } from '@/session/paneFollow';
export { derivePaneSync, derivePaneAsync } from '@/session/derivePane';
export {
  checkCrossTfCandles,
  checkViewportCompleteness,
  fullViewportMinBars,
  minBarsForSpan,
  needsViewportHeal,
  scanBarIntegrity,
} from '@/session/viewportCompleteness';
export type {
  CompletenessInput,
  CompletenessReason,
  CompletenessResult,
} from '@/session/viewportCompleteness';
