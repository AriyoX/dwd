'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { getSupabaseEnvironment } from '@/lib/supabase/env';
import { safeReturnPath } from '@/lib/navigation';

export function GoogleSignIn({ next }: { next: string }) {
  return (
    <OAuthSignIn provider="google" next={next}>
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
    </OAuthSignIn>
  );
}

export function AppleSignIn({ next }: { next: string }) {
  return (
    <OAuthSignIn provider="apple" next={next}>
      <svg width="20" height="23" viewBox="0 0 24 28" fill="currentColor" aria-hidden="true">
        <path d="M19.3 14.7c0-3.1 2.5-4.6 2.6-4.7-1.4-2.1-3.7-2.4-4.5-2.4-1.9-.2-3.8 1.2-4.8 1.2-1 0-2.5-1.2-4.1-1.1-2.1 0-4 1.2-5.1 3-2.2 3.8-.6 9.4 1.5 12.5 1 1.5 2.2 3.1 3.8 3 1.5-.1 2.1-1 4-1s2.4 1 4.1 1c1.7 0 2.7-1.5 3.7-3 .8-1.1 1.4-2.3 1.7-3.5-.1 0-2.9-1.1-2.9-5ZM16.2 5.6c.8-1 1.4-2.4 1.2-3.8-1.2.1-2.7.8-3.6 1.8-.8.9-1.5 2.3-1.3 3.7 1.4.1 2.8-.7 3.7-1.7Z" />
      </svg>
    </OAuthSignIn>
  );
}

export function SocialSignIn({ next }: { next: string }) {
  return (
    <div className="stack auth-social">
      <AppleSignIn next={next} />
      <GoogleSignIn next={next} />
      <div className="auth-divider">
        <span>or use email</span>
      </div>
    </div>
  );
}

function OAuthSignIn({
  provider,
  next,
  children,
}: {
  provider: 'google' | 'apple';
  next: string;
  children: ReactNode;
}) {
  const name = provider === 'apple' ? 'Apple' : 'Google';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function signIn() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const environment = getSupabaseEnvironment();
      const response = await fetch(`${environment.url}/auth/v1/settings`, {
        headers: { apikey: environment.publishableKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('settings unavailable');
      const settings = (await response.json()) as {
        external?: { google?: boolean; apple?: boolean };
      };
      if (!settings.external?.[provider]) {
        setError(`${name} sign-in isn’t available yet. Please use email.`);
        setPending(false);
        return;
      }
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', safeReturnPath(next));
      callback.searchParams.set('provider', provider);
      const { data, error: authError } = await createBrowserSupabaseClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
      });
      if (authError || !data.url) throw new Error('oauth unavailable');
      window.location.assign(data.url);
    } catch {
      setError(`Couldn’t connect to ${name}. Try again or use email.`);
      setPending(false);
    }
  }
  return (
    <div className="stack">
      <Button
        type="button"
        variant="secondary"
        className={provider === 'apple' ? 'auth-apple-button' : ''}
        full
        onClick={() => void signIn()}
        disabled={pending}
        aria-busy={pending}
      >
        {children}
        {pending ? 'Connecting…' : `Continue with ${name}`}
      </Button>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
