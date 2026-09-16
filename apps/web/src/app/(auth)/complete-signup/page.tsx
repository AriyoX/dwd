import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/navigation';
import { CompleteSignupForm } from '@/features/auth/complete-signup-form';

export const metadata = { title: 'Finish your account' };
export default async function CompleteSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnPath((await searchParams).next);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) redirect(`/login?next=${encodeURIComponent(next)}`);
  const profile = await client.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
  if (profile.error) throw profile.error;
  if (profile.data) redirect(next);
  const name: unknown = data.user.user_metadata['full_name'] ?? data.user.user_metadata['name'];
  return (
    <section className="stack-lg">
      <h1>One last step.</h1>
      <CompleteSignupForm next={next} name={typeof name === 'string' ? name.slice(0, 60) : ''} />
    </section>
  );
}
