import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConnectionProvider } from '@/providers/connection-provider';
import { getAuthenticatedUserId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  if ((await getAuthenticatedUserId()) === null) redirect('/login');
  return <ConnectionProvider>{children}</ConnectionProvider>;
}
