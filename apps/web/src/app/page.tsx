import { redirect } from 'next/navigation';
import { inviteTokenSchema } from '@dwd/core';
import { getAuthenticatedUserId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  const params = await searchParams;
  if (params.join !== undefined && inviteTokenSchema.safeParse(params.join).success) {
    redirect(`/join/${encodeURIComponent(params.join)}`);
  }
  const userId = await getAuthenticatedUserId();
  redirect(userId === null ? '/login' : '/home');
}
