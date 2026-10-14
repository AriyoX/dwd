import { redirect } from 'next/navigation';
import { getAuthenticatedUserId } from '@/lib/supabase/server';
import { QuickLogShell } from '@/features/quick-log/shell';
import { QuickLogger } from '@/features/quick-log/logger';
import { quickEntryDestination } from '@/features/quick-log/entry-routing';

export const dynamic = 'force-dynamic';

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  const params = await searchParams;
  const invitation = quickEntryDestination(null, params.join);
  if (invitation) redirect(invitation);
  const userId = await getAuthenticatedUserId().catch(() => null);
  const destination = quickEntryDestination(userId);
  if (destination) redirect(destination);
  return (
    <QuickLogShell>
      <QuickLogger homepage />
    </QuickLogShell>
  );
}
