'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { getSupabaseEnvironment } from '@/lib/supabase/env';
import { safeReturnPath } from '@/lib/navigation';

export function GoogleSignIn({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function signIn() {
    setPending(true);
    setError('');
    try {
      const environment = getSupabaseEnvironment();
      const response = await fetch(`${environment.url}/auth/v1/settings`, {
        headers: { apikey: environment.publishableKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('settings unavailable');
      const settings = (await response.json()) as { external?: { google?: boolean } };
      if (!settings.external?.google) {
        setError('Google sign-in isn’t available yet. Please use email.');
        setPending(false);
        return;
      }
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', safeReturnPath(next));
      const { data, error: authError } = await createBrowserSupabaseClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
      });
      if (authError || !data.url) throw new Error('oauth unavailable');
      window.location.assign(data.url);
    } catch {
      setError('Couldn’t connect to Google. Try again or use email.');
      setPending(false);
    }
  }
  return (
    <div className="stack">
      <Button
        type="button"
        variant="secondary"
        full
        onClick={() => void signIn()}
        disabled={pending}
        aria-busy={pending}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.06.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.41 13.93a6 6 0 0 1 0-3.86V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.59Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59C7.2 7.71 9.4 5.95 12 5.95Z"
          />
        </svg>
        {pending ? 'Connecting…' : 'Continue with Google'}
      </Button>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="auth-divider">
        <span>or use email</span>
      </div>
    </div>
  );
}
