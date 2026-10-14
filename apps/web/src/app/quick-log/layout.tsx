import { Suspense, type ReactNode } from 'react';
import { QuickLogProvider } from '@/features/quick-log/provider';
export default function QuickLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      className="page-shell quick-log-shell"
      style={{ maxWidth: 620, paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
    >
      <Suspense fallback={<p role="status">Opening device logs…</p>}>
        <QuickLogProvider>{children}</QuickLogProvider>
      </Suspense>
    </main>
  );
}
