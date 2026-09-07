import { getFinishedNights } from '@dwd/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HistoryScreen } from '@/features/nights/history-screen';
import { TourHistoryScreen } from '@/features/tour/tour-screens';
export const metadata = { title: 'Night history' };
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tour?: string }>;
}) {
  const params = await searchParams;
  if (params.tour === 'history') return <TourHistoryScreen />;
  const page = /^\d{1,5}$/.test(params.page ?? '') ? Number(params.page) : 0;
  const client = await createServerSupabaseClient();
  const result = await getFinishedNights(client, page).catch(() => null);
  return <HistoryScreen result={result} page={page} />;
}
