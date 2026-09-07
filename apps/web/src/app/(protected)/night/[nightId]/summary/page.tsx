import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getNightSnapshot } from '@dwd/data';
import { EndedNightOutbox } from '@/features/offline/ended-night-outbox';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SummaryScreen } from '@/features/nights/summary-screen';
import { TourSummaryScreen } from '@/features/tour/tour-screens';
export const metadata: Metadata = { title: 'Night summary' };
export default async function NightSummaryPage({
  params,
}: {
  params: Promise<{ nightId: string }>;
}) {
  const { nightId } = await params;
  if (nightId === 'tour') return <TourSummaryScreen />;
  const client = await createServerSupabaseClient();
  const snapshot = await getNightSnapshot(client, nightId).catch(() => null);
  if (snapshot === null) notFound();
  if (snapshot.night.status !== 'ended') redirect(`/night/${nightId}`);
  return (
    <SummaryScreen
      snapshot={snapshot}
      pendingEntries={
        <EndedNightOutbox nightId={snapshot.night.id} currentUserId={snapshot.currentUserId} />
      }
    />
  );
}
