import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { Wordmark } from '@/components/layout/wordmark';
import { QuickLogProvider } from './provider';
import { GetApp } from './account-benefits';

export function QuickLogShell({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      className="page-shell quick-log-shell"
      style={{ maxWidth: 620, paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
    >
      <header className="topbar">
        <Wordmark />
        <GetApp />
      </header>
      <Suspense fallback={<p role="status">Opening device logs…</p>}>
        <QuickLogProvider>{children}</QuickLogProvider>
      </Suspense>
      <footer className="app-footer">
        <p>For adults 18+. Meet your local legal drinking age.</p>
        <p>Take your time. DWD cannot determine sobriety or driving safety.</p>
        <nav aria-label="Legal">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/safety">Drinking & safety</Link>
        </nav>
      </footer>
    </main>
  );
}
