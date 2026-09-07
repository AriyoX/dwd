import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/auth-form';
import { safeReturnPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; updated?: string }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  return (
    <section className="stack-lg">
      <Link className="button button-secondary" href={`/demo?next=${encodeURIComponent(next)}`}>
        Try a demo
      </Link>
      <header>
        <h1>Welcome back.</h1>
      </header>
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
      <LoginForm next={next} />
    </section>
  );
}
