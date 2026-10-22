import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/auth-form';
import { safeReturnPath } from '@/lib/navigation';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; updated?: string; deletion?: string }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  return (
    <section className="stack-lg auth-login">
      <header>
        <h1>Sign in.</h1>
      </header>
      {(params.error === 'google' || params.error === 'apple') && (
        <p className="error-box" role="alert">
          {params.error === 'apple' ? 'Apple' : 'Google'} sign-in wasn’t completed. Try again or use
          email.
        </p>
      )}
      {params.error === 'confirmation' ? (
        <div className="error-box" role="alert">
          This email link has expired or was already used. Sign in or request a new password reset.
        </div>
      ) : null}
      {params.updated === '1' ? (
        <div className="success-box" role="status">
          Password updated. Sign in with your new password.
        </div>
      ) : null}
      {params.deletion === 'scheduled' ? (
        <p className="notice-box" role="status">
          Account deletion is scheduled in 30 days. Signing in before deletion starts cancels it.
        </p>
      ) : null}
      <LoginForm next={next} />
      <Link className="auth-guest-link" href="/quick-log?scope=guest">
        Continue without an account <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
