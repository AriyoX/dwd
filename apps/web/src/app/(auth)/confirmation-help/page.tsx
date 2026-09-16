import { ConfirmationForm } from '@/features/auth/confirmation-form';
import { safeReturnPath } from '@/lib/navigation';
import { MailCheck } from 'lucide-react';
import { readPendingConfirmation } from '@/features/auth/pending-confirmation';

export const metadata = { title: 'Confirm your email' };
export default async function ConfirmationHelp({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const pending = await readPendingConfirmation();
  const codeEnabled = process.env['DWD_EMAIL_CONFIRMATION_CODE_ENABLED'] === 'true';
  const destination = safeReturnPath(params.next);
  // Password recovery wraps the original invitation in a reset-password destination.
  const next = destination.startsWith('/reset-password?')
    ? safeReturnPath(new URL(destination, 'https://dwd.invalid').searchParams.get('next'))
    : destination;
  return (
    <section className="stack-lg">
      <MailCheck size={36} aria-hidden="true" />
      <h1>{pending ? 'Check your email.' : 'Confirm your email.'}</h1>
      {params.error && (
        <p className="warning-box" role="alert">
          {codeEnabled
            ? 'This link could not be verified. Enter the code from your latest email or resend it.'
            : 'This link could not be verified. Open the latest email link in the browser where you signed up, or resend it.'}
        </p>
      )}
      <ConfirmationForm
        next={next}
        email={pending?.email ?? ''}
        retryAt={pending?.retryAt ?? 0}
        codeEnabled={codeEnabled}
      />
    </section>
  );
}
