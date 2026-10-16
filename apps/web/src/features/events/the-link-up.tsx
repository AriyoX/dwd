import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, GlassWater, Plus } from 'lucide-react';
import { LinkUpMemories } from './link-up-memories';
import styles from './the-link-up.module.css';

export function TheLinkUp() {
  return (
    <div className={styles['page']}>
      <header className={styles['header']}>
        <span className={styles['miniWordmark']}>THE LINK UP</span>
        <nav className={styles['headerActions']} aria-label="Event links">
          <Link href="/quick-log?scope=guest" className={styles['headerLink']}>
            Count shots <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
          <a href="#shared-gallery" className={styles['headerLink']}>
            Photos <ArrowDown size={13} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main id="main-content" className={styles['main']}>
        <section className={styles['hero']} aria-labelledby="link-up-heading">
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
          <p className={styles['tagline']}>17 October 2026</p>
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
              Count your <em>shots.</em>
            </h2>
            <p className={styles['description']}>Your count for the night. No sign-in needed.</p>
            <Link href="/quick-log?scope=guest" className={styles['quickLogButton']}>
              Count my shots <ArrowUpRight size={19} aria-hidden="true" />
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
      </footer>
    </div>
  );
}
