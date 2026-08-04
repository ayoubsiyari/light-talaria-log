/**
 * TalariaV8b module boundary (Phase 3 split-port entry).
 * The monolith lives in TalariaV8b.jsx; typed hosts/pages compose it by view.
 */
export { TalariaV8bHost, appTabToV8bView, v8bViewToAppTab } from '@/components/v8b/TalariaV8bHost';
export type { V8bSessView } from '@/components/v8b/TalariaV8bHost';
export {
  resolveChartSessionFromV8b,
  normalizeV8bTicker,
} from '@/components/v8b/v8bSessionBridge';
export type { V8bSessionLike } from '@/components/v8b/v8bSessionBridge';
