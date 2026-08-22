import { listSessions } from '@/sessions/sessionStore';
import type { BacktestSession } from '@/types/session';

function norm(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Latest session whose legs include this journal symbol. */
export function findSessionForSymbol(symbol: string): BacktestSession | null {
  const want = norm(symbol);
  if (!want) return null;
  const sessions = [...listSessions()].sort((a, b) => b.createdAt - a.createdAt);
  return (
    sessions.find(
      (s) =>
        norm(s.pair) === want || s.legs.some((leg) => norm(leg.pair) === want),
    ) ?? null
  );
}
