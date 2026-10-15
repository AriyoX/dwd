import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { photoDatabase } from './database';
import { databaseError, PhotoError } from './errors';

const APPROVED = new Set(['shebatindy@gmail.com', 'ahumuzaariyo@gmail.com']);
export function approvedOrganizerEmail(email: string | undefined) {
  return !!email && APPROVED.has(email.trim().toLowerCase());
}
export function verifiedOrganizer(
  user: Pick<User, 'email' | 'email_confirmed_at' | 'is_anonymous'> | null,
) {
  return (
    !!user && !user.is_anonymous && !!user.email_confirmed_at && approvedOrganizerEmail(user.email)
  );
}
export async function requireOrganizer() {
  const client = await createServerSupabaseClient();
  // Network validation deliberately used instead of cached claims or user_metadata.
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    throw new PhotoError('authentication_required', 'Sign in to manage this album.', 401);
  if (!verifiedOrganizer(user))
    throw new PhotoError('forbidden', 'This account cannot manage The Link Up album.', 403);
  const result = await photoDatabase().rpc('link_up_provision_organizer', { p_user: user.id });
  if (result.error) databaseError(result.error);
  if (!result.data)
    throw new PhotoError('forbidden', 'This account cannot manage The Link Up album.', 403);
  return user;
}
