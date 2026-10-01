'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  requestKey: z.uuid(),
  kind: z.enum(['feedback', 'problem']),
  message: z.string().trim().min(10).max(4000),
});
export async function submitSupportRequest(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Write between 10 and 4,000 characters.' };
  try {
    const client = await createServerSupabaseClient();
    const claims = await client.auth.getClaims();
    if (claims.error || !claims.data?.claims.sub)
      return { ok: false, error: 'Sign in again to submit your request.' };
    const { data, error } = await client.rpc('submit_support_request', {
      p_request_key: parsed.data.requestKey,
      p_kind: parsed.data.kind,
      p_message: parsed.data.message,
    });
    if (error || !data)
      return {
        ok: false,
        error:
          error?.code === '54000'
            ? 'You have reached today’s request limit. Try tomorrow.'
            : 'We couldn’t send your message. Please try again.',
      };
    revalidatePath('/account');
    revalidatePath('/feedback');
    return { ok: true, id: data };
  } catch {
    return { ok: false, error: 'We lost the connection. Please try again.' };
  }
}
