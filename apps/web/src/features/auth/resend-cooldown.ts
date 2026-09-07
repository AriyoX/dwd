const attempts = new Map<string, number>();
export const CONFIRMATION_COOLDOWN_MS = 60_000;
export function reserveConfirmationAttempt(key: string, now = Date.now()): number | null {
  const until = attempts.get(key) ?? 0;
  if (until > now) return until;
  for (const [id, expires] of attempts) if (expires <= now) attempts.delete(id);
  // Bound process memory. Supabase also enforces delivery rate limits across instances.
  if (attempts.size >= 10_000) return now + CONFIRMATION_COOLDOWN_MS;
  attempts.set(key, now + CONFIRMATION_COOLDOWN_MS);
  return null;
}
