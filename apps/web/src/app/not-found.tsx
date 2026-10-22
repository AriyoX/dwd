import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PublicFooter, PublicHeader } from '@/components/layout/public-layout';
import styles from '@/components/layout/public-pages.module.css';

export default function NotFound() {
  return (
    <div className={styles['page']}>
      <PublicHeader />
      <main className={styles['notFound']} id="main-content">
        <span>404</span>
        <h1>Page not found.</h1>
        <p>This link may have changed, or the page may be unavailable to you.</p>
        <Link className="button button-primary" href="/">
          Back to DWD <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </main>
      <PublicFooter />
    </div>
  );
}
