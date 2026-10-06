'use server';
import { z } from 'zod';
import {
  blockUser,
  unblockUser,
  getBlockedUsers,
  reportContent,
  reportContentSchema,
} from '@dwd/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function connection() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) throw new Error('Sign in required.');
  return client;
}
export async function reportContentAction(input: unknown) {
  try {
    await reportContent(await connection(), reportContentSchema.parse(input));
    return { ok: true } as const;
  } catch {
    return { ok: false, error: 'Report could not be sent. Retry when connected.' } as const;
  }
}
export async function blockUserAction(userId: unknown) {
  try {
    await blockUser(await connection(), z.uuid().parse(userId));
    return { ok: true } as const;
  } catch {
    return { ok: false, error: 'This person could not be blocked. Retry when connected.' } as const;
  }
}
export async function unblockUserAction(userId: unknown) {
  try {
    await unblockUser(await connection(), z.uuid().parse(userId));
    return { ok: true } as const;
  } catch {
    return {
      ok: false,
      error: 'This person could not be unblocked. Retry when connected.',
    } as const;
  }
}
export async function getBlockedUsersAction() {
  try {
    return { ok: true, users: await getBlockedUsers(await connection()) } as const;
  } catch {
    return { ok: false, error: 'Blocked people could not load.' } as const;
  }
}
