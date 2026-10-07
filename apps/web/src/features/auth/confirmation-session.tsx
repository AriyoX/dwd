'use client';

import { useEffect, useRef } from 'react';
import { safeReturnPath } from '@/lib/navigation';

export function ConfirmationSession({ next }: { next: string }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Remove bearer tokens before any network request or navigation.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const destination = safeReturnPath(next);
    const recovery = destination.startsWith('/reset-password')
      ? `/forgot-password?error=expired&next=${encodeURIComponent(
          safeReturnPath(new URL(destination, window.location.origin).searchParams.get('next')),
        )}`
      : `/confirmation-help?error=confirmation&next=${encodeURIComponent(destination)}`;
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (params.has('error') || !accessToken || !refreshToken) {
      window.location.replace(recovery);
      return;
    }
    void fetch('/auth/confirm/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    })
      .then((response) => window.location.replace(response.ok ? destination : recovery))
      .catch(() => window.location.replace(recovery));
  }, [next]);
  return <p role="status">Confirming your email…</p>;
}
