import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewNightWizard } from '@/features/nights/new-night-wizard';
import { requireAuthenticatedUserId } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Start a night' };

export default async function NewNightPage() {
  const userId = await requireAuthenticatedUserId();
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Link className="row muted" href="/home">
          <ChevronLeft aria-hidden="true" size={22} /> Home
        </Link>
      </header>
      <NewNightWizard userId={userId} key={userId} />
    </main>
  );
}
