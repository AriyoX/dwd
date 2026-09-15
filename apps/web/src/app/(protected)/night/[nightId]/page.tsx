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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { nightId } = await params;
  if (nightId === 'tour') return <TourNightScreen />;
  const query = await searchParams;
  const client = await createServerSupabaseClient();
  const snapshot = await getNightSnapshot(client, nightId).catch(() => null);
  if (snapshot === null) notFound();
  if (snapshot.night.status === 'ended') redirect(`/night/${nightId}/summary`);
  const currentMember = snapshot.members.find((member) => member.id === snapshot.currentMemberId);
  if (currentMember === undefined) notFound();
  if (query['setup'] === '1' && currentMember.planSetupCompletedAt !== null) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === 'setup' || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
    }
    const suffix = next.toString();
    redirect(`/night/${nightId}${suffix === '' ? '' : `?${suffix}`}`);
  }
  return (
    <ActiveNightClient
      initialSnapshot={snapshot}
      openInviteInitially={query['invite'] === '1'}
      setupPlanInitially={query['setup'] === '1' || currentMember.planSetupCompletedAt === null}
    />
  );
}
