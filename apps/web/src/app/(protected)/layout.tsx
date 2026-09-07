import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConnectionProvider } from '@/providers/connection-provider';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TourProvider } from '@/features/tour/tour-provider';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) redirect('/login');
  return (
    <ConnectionProvider>
      <TourProvider
        key={data.user.id}
        userId={data.user.id}
        seen={data.user.user_metadata['tour_seen'] === true}
      >
        {children}
      </TourProvider>
    </ConnectionProvider>
  );
}
