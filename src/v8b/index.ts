/**
 * Reference exports only — the app shell does not mount TalariaV8b.
 * Prefer Hero pages under `src/components/{dashboard,session,journal,strategy,shell}`.
 */
export type { V8bSessionLike } from '@/components/v8b/v8bSessionBridge';
export {
  resolveChartSessionFromV8b,
  normalizeV8bTicker,
} from '@/components/v8b/v8bSessionBridge';
