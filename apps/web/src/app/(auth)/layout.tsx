import type { ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardList, Droplets, Users } from 'lucide-react';
import { Wordmark } from '@/components/layout/wordmark';
import { NightIllustration } from '@/components/layout/night-illustration';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell" id="main-content">
      <aside className="auth-aside">
        <Wordmark linked={false} />
        <NightIllustration />
        <ol className="auth-steps" aria-label="How Drink with Desire works">
          <li>
            <ClipboardList size={20} aria-hidden="true" />
            <span>Make a plan</span>
            <span className="muted">01</span>
          </li>
          <li>
            <Droplets size={20} aria-hidden="true" />
            <span>Track your drinks</span>
            <span className="muted">02</span>
          </li>
          <li>
            <Users size={20} aria-hidden="true" />
            <span>Stay together</span>
            <span className="muted">03</span>
          </li>
        </ol>
      </aside>
      <div className="auth-main">
        <div className="auth-mobile-brand">
          <Wordmark linked={false} />
        </div>
        <div className="auth-form-wrap">{children}</div>
        <footer className="auth-footer">
          <span>For adults 18+</span>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
