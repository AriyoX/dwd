import 'server-only';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function allowInviteLookup(key: string, now = Date.now()): boolean {
  const current = attempts.get(key);
  if (current === undefined || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}
