import 'server-only';
import { TURNSTILE_ACTION } from '@/features/events/photo-contracts';
import { PhotoError } from './errors';

export function localProtectionBypass(hostname: string) {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env['LINK_UP_ALLOW_LOCAL_TURNSTILE_BYPASS'] === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  );
}
export function protectionStatus(hostname: string): 'turnstile' | 'local-bypass' | 'unavailable' {
  if (localProtectionBypass(hostname)) return 'local-bypass';
  return process.env['TURNSTILE_SECRET_KEY'] && process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY']
    ? 'turnstile'
    : 'unavailable';
}
export async function verifyTurnstile(token: string | undefined, hostname: string) {
  if (localProtectionBypass(hostname)) return;
  const secret = process.env['TURNSTILE_SECRET_KEY'];
  if (!secret || !process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY']) {
    throw new PhotoError(
      'turnstile_configuration',
      'Upload verification is not configured. Please contact an organizer.',
      503,
    );
  }
  if (!token || token.length > 2048)
    throw new PhotoError('turnstile_required', 'Complete the upload verification and try again.');
  let result: { success?: boolean; hostname?: string; action?: string };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('siteverify');
    result = (await response.json()) as typeof result;
  } catch {
    throw new PhotoError(
      'turnstile_unavailable',
      'Verification could not connect. Refresh the verification and retry.',
      503,
    );
  }
  if (!result.success || result.hostname !== hostname || result.action !== TURNSTILE_ACTION) {
    throw new PhotoError(
      'turnstile_failed',
      'Verification expired or failed. Refresh the verification and try again.',
    );
  }
}
