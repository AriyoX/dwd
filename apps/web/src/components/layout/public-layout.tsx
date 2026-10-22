import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Wordmark } from './wordmark';
import styles from './public-pages.module.css';

export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className={styles['header']}>
      <Wordmark />
      <nav aria-label="Main navigation">
        <Link className={styles['desktopLink']} href="/#how-it-works">
          How it works
        </Link>
        <Link href="/events">Events</Link>
        <Link className={styles['desktopLink']} href="/#questions">
          FAQs
        </Link>
        <Link className="button button-secondary" href={signedIn ? '/home' : '/login'}>
          {signedIn ? 'Your home' : 'Sign in'} <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className={styles['footer']}>
      <div className={styles['footerBrand']}>
        <Wordmark />
        <span>For adults 18+ and of legal drinking age.</span>
      </div>
      <nav aria-label="Footer navigation">
        <div>
          <span>Explore</span>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/quick-log?scope=guest">Log now</Link>
          <Link href="/events">Events</Link>
        </div>
        <div>
          <span>Need a hand?</span>
          <Link href="/support">Support</Link>
          <Link href="/safety">Drinking &amp; safety</Link>
          <Link href="/delete-account">Delete account</Link>
        </div>
        <div>
          <span>The details</span>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/#questions">FAQs</Link>
        </div>
      </nav>
      <div className={styles['footerBottom']}>
        <span>© {new Date().getFullYear()} DWD</span>
        <p>DWD cannot determine sobriety or driving safety.</p>
      </div>
    </footer>
  );
}
