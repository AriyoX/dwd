import { TourNightScreen } from '@/features/tour/tour-screens';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getNightSnapshot } from '@dwd/data';
import { ActiveNightClient } from '@/features/nights/active-night-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Active night' };

export default async function ActiveNightPage({
  params,
  searchParams,
}: {
  params: Promise<{ nightId: string }>;
  searchParams: Promise<{ invite?: string; setup?: string }>;
}) {
  const { nightId } = await params;
  if (nightId === 'tour') return <TourNightScreen />;
  const query = await searchParams;
  const client = await createServerSupabaseClient();
  const snapshot = await getNightSnapshot(client, nightId).catch(() => null);
  if (snapshot === null) notFound();
  if (snapshot.night.status === 'ended') redirect(`/night/${nightId}/summary`);
  return (
    <ActiveNightClient
      initialSnapshot={snapshot}
      openInviteInitially={query.invite === '1'}
      setupPlanInitially={query.setup === '1'}
    />
  );
}
