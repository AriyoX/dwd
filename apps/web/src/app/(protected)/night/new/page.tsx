import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewNightWizard } from '@/features/nights/new-night-wizard';

export const metadata: Metadata = { title: 'Start a night' };

export default function NewNightPage() {
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Link className="row muted" href="/home">
          <ChevronLeft aria-hidden="true" size={22} /> Home
        </Link>
      </header>
      <NewNightWizard />
    </main>
  );
}
