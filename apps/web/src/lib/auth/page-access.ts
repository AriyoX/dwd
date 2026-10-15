import 'server-only';
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
  const client = await createServerSupabaseClient();
  // Validate the current user, never a caller-supplied email or editable JWT metadata.
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    throw new PageAccessError('authentication_required', 'Sign in to access this page.', 401);
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
