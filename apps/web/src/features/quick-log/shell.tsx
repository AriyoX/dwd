import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { QuickLogProvider } from './provider';
import { QuickLogHeader } from './header';
import { ConnectionProvider } from '@/providers/connection-provider';

export function QuickLogShell({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      className="page-shell quick-log-shell"
      style={{
        maxWidth: 620,
        paddingBottom: 'calc(48px + env(safe-area-inset-bottom) + var(--quick-ad-height, 0px))',
      }}
    >
      <Suspense fallback={<p role="status">Opening device logs…</p>}>
        <ConnectionProvider>
          <QuickLogProvider>
            <QuickLogHeader />
            {children}
          </QuickLogProvider>
        </ConnectionProvider>
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
