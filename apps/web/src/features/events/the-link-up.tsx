import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, GlassWater, Plus } from 'lucide-react';
import { LinkUpMemories } from './link-up-memories';
import styles from './the-link-up.module.css';

export function TheLinkUp() {
  return (
    <div className={styles['page']}>
      <div className={styles['foliage']} aria-hidden="true" />
      <header className={styles['header']}>
        <span className={styles['miniWordmark']}>THE LINK UP</span>
        <a href="#memories" className={styles['headerLink']}>
          Our shared album <ArrowDown size={13} aria-hidden="true" />
        </a>
      </header>

      <main id="main-content" className={styles['main']}>
        <section className={styles['hero']} aria-labelledby="link-up-heading">
          <p className={styles['eyebrow']}>A night worth keeping</p>
          <h1 id="link-up-heading" className={styles['wordmark']}>
            <Image
              src="/events/the-link-up/wordmark.webp"
              alt="The Link Up"
              width={698}
              height={368}
              sizes="(max-width: 640px) 82vw, 560px"
              preload
            />
          </h1>
          <p className={styles['tagline']}>
            The night. The people. <em>The memories.</em>
          </p>
          <p className={styles['heroNote']}>Every link-up has a story. Let’s capture ours.</p>
          <a href="#memories" className={styles['heroLink']} aria-label="Explore our shared album">
            <ArrowDown size={18} aria-hidden="true" />
          </a>
        </section>

        <LinkUpMemories />

        <section className={styles['quickLog']} aria-labelledby="quick-log-heading">
          <div className={styles['quickLogArt']} aria-hidden="true">
            <Image
              src="/events/the-link-up/cocktail.webp"
              alt=""
              fill
              sizes="(max-width: 640px) 150px, 250px"
            />
          </div>
          <div className={styles['quickLogCopy']}>
            <span className={styles['eyebrow']}>
              <GlassWater size={14} aria-hidden="true" /> DWD Quick Log
            </span>
            <h2 id="quick-log-heading">
              Enjoy the Night.
              <br />
              <em>Keep Count.</em>
            </h2>
            <p className={styles['description']}>
              Track your drinks and shots with just a tap. No account needed.
            </p>
            <Link href="/quick-log?scope=guest" className={styles['quickLogButton']}>
              Start Quick Log <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
          </div>
          <span className={styles['quickLogMark']} aria-hidden="true">
            <Plus size={36} strokeWidth={1} />
          </span>
        </section>
      </main>

      <footer className={styles['footer']}>
        <div className={styles['footerTop']}>
          <Link href="/" className={styles['poweredBy']} aria-label="Powered by DWD">
            <span>Powered by</span>
            <span className={styles['dwdMark']} aria-hidden="true" />
          </Link>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
        <p>Good company. Lasting memories.</p>
      </footer>
    </div>
  );
}
