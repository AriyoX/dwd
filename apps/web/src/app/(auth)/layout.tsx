import type { ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardList, Droplets, Users } from 'lucide-react';
import { Wordmark } from '@/components/layout/wordmark';
import { NightIllustration } from '@/components/layout/night-illustration';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell" id="main-content">
      <aside className="auth-aside">
        <Wordmark />
        <h2 className="auth-aside-heading">
          A night of
          <br />
          <em>your own.</em>
        </h2>
        <NightIllustration />
        <ol className="auth-steps" aria-label="How DWD works">
          <li>
            <ClipboardList size={20} aria-hidden="true" />
            <span>Start your night</span>
            <span className="muted">01</span>
          </li>
          <li>
            <Droplets size={20} aria-hidden="true" />
            <span>Log drinks &amp; chasers</span>
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
          <Wordmark />
          <Link className="text-link small" href="/events">
            Events
          </Link>
        </div>
        <nav className="auth-desktop-nav" aria-label="Site navigation">
          <Link href="/">Home</Link>
          <Link href="/events">Events</Link>
        </nav>
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
