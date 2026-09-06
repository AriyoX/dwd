'use client';

import Link from 'next/link';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Wordmark } from '@/components/layout/wordmark';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="page-shell error-page">
      <Wordmark />
      <WifiOff size={36} aria-hidden="true" />
      <h1>We couldn’t load this page.</h1>
      <p className="muted">Check your connection and try again.</p>
      <div className="row">
        <Button onClick={reset}>
          <RefreshCw size={18} aria-hidden="true" /> Try again
        </Button>
        <Link className="button button-secondary" href="/home">
          Back home
        </Link>
      </div>
    </main>
  );
}
