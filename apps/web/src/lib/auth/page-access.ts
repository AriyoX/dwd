import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

interface PageAccessDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      has_page_admin_access: { Args: { p_user: string; p_page_path: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
export class PageAccessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function requirePageAdmin(pagePath: string) {
  let user: User;
  try {
    const client = await createServerSupabaseClient();
    // Validate the current user, never a caller-supplied email or editable JWT metadata.
    const result = await client.auth.getUser();
    if (result.error && ![400, 401, 403].includes(Number(result.error.status))) throw result.error;
    if (result.error)
      throw new PageAccessError('authentication_required', 'Sign in to access this page.', 401);
    user = result.data.user;
  } catch (cause) {
    if (cause instanceof PageAccessError) throw cause;
    throw new PageAccessError(
      'authorization_unavailable',
      'Sign-in could not connect. Please try again.',
      503,
    );
  }
  if (user.is_anonymous || !user.email_confirmed_at || !user.email) {
    throw new PageAccessError('forbidden', 'This account does not have access to this page.', 403);
  }
  try {
    const result = await createServiceSupabaseClient<PageAccessDatabase>().rpc(
      'has_page_admin_access',
      { p_user: user.id, p_page_path: pagePath },
    );
    if (result.error) throw new Error('Access lookup failed.');
    if (!result.data)
      throw new PageAccessError(
        'forbidden',
        'This account does not have access to this page.',
        403,
      );
  } catch (cause) {
    if (cause instanceof PageAccessError) throw cause;
    throw new PageAccessError(
      'authorization_unavailable',
      'Page access could not be verified. Please retry.',
      503,
    );
  }
  return user;
}
