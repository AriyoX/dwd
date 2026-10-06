import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { isConnectionFailure } from './offline-cache';

const storedSession = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expires_in: z.number(),
    token_type: z.string(),
    user: z
      .object({
        id: z.uuid(),
        app_metadata: z.record(z.string(), z.unknown()),
        user_metadata: z.record(z.string(), z.unknown()),
        aud: z.string(),
        created_at: z.string(),
      })
      .loose(),
  })
  .loose();

export const nativeSessionKey = (url: string) =>
  `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

export function readOfflineSession(
  storage: Pick<Storage, 'getItem'>,
  key: string,
  error: unknown,
): Session | null {
  if (!isConnectionFailure(error)) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = storedSession.safeParse(JSON.parse(raw));
    // This only restores local access. Supabase still validates every server request.
    // Read the SDK's current storage, never a second token copy that survives sign-out.
    return parsed.success ? (parsed.data as Session) : null;
  } catch {
    return null;
  }
}
