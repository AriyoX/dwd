import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Camera } from 'lucide-react';
import styles from '@/components/layout/public-pages.module.css';

export function EventCard({ eager = false }: { eager?: boolean }) {
  return (
    <Link className={styles['eventCard']} href="/events/the-link-up">
      <div className={styles['eventImage']}>
        <Image
          src="/ads/link-up-banner.jpg"
          alt="The Link Up"
          fill
          sizes="(max-width: 700px) 100vw, 600px"
          loading={eager ? 'eager' : 'lazy'}
        />
        <span className={styles['eventBadge']}>
          <Camera size={14} aria-hidden="true" /> Photo memories
        </span>
      </div>
      <div className={styles['eventInfo']}>
        <div>
          <span className={styles['eventDate']}>
            Past event · <time dateTime="2026-10-17">17 October 2026</time>
          </span>
          <h3>The Link Up</h3>
        </div>
        <span className={styles['roundArrow']} aria-hidden="true">
          <ArrowUpRight size={25} />
        </span>
      </div>
    </Link>
  );
}
