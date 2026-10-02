import { inviteTokenSchema } from '@dwd/core';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'dwd.mobile.auth-handoff.v1';
const MAX_AGE = 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN = 60_000;

export function safeDestination(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (['/', '/night/new', '/account', '/history', '/join'].includes(value)) return value;
  const invite = value.match(/^\/join\?token=([A-Za-z0-9_-]+)$/)?.[1];
  if (invite && inviteTokenSchema.safeParse(invite).success) return value;
  if (
    /^\/night\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/(?:plan|summary|log))?(?:\?memberId=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/.test(
      value,
    )
  )
    return value;
  return '/';
}

interface Handoff {
  next: string;
  email: string;
  retryAt: number;
  expiresAt: number;
}

// Store only the destination and confirmation UI state. Credentials belong to Supabase.
export class AuthHandoff {
  constructor(
    private readonly storage: Store,
    private readonly now = Date.now,
  ) {}

  read(): Handoff {
    const empty = { next: '/', email: '', retryAt: 0, expiresAt: this.now() + MAX_AGE };
    try {
      const raw: unknown = JSON.parse(this.storage.getItem(KEY) ?? 'null');
      if (!raw || typeof raw !== 'object') return empty;
      const state = raw as Partial<Handoff>;
      if (typeof state.expiresAt !== 'number' || state.expiresAt < this.now()) {
        this.clear();
        return empty;
      }
      return {
        next: safeDestination(state.next),
        email: typeof state.email === 'string' && state.email.length <= 254 ? state.email : '',
        retryAt: typeof state.retryAt === 'number' ? state.retryAt : 0,
        expiresAt: state.expiresAt,
      };
    } catch {
      return empty;
    }
  }

  remember(next: string) {
    const destination = safeDestination(next);
    if (destination === '/' && next !== '/') return;
    this.write({ ...this.read(), next: destination });
  }

  confirmation(email: string, retryAt = 0) {
    this.write({ ...this.read(), email: email.trim().toLowerCase(), retryAt });
  }

  reserveResend(email: string): number | null {
    const state = this.read();
    if (state.email === email.toLowerCase() && state.retryAt > this.now()) return null;
    const retryAt = this.now() + RESEND_COOLDOWN;
    this.confirmation(email, retryAt);
    return retryAt;
  }

  consume(): string {
    const next = this.read().next;
    this.clear();
    return next;
  }

  clear() {
    this.storage.removeItem(KEY);
  }

  private write(state: Handoff) {
    this.storage.setItem(KEY, JSON.stringify({ ...state, expiresAt: this.now() + MAX_AGE }));
  }
}

export const authHandoff = () => new AuthHandoff(globalThis.localStorage);

export function authCallbackUrl(next: string, flow: 'signup' | 'recovery' | 'google') {
  // Installed builds register this scheme; email templates append &token_hash.
  const query = new URLSearchParams({ flow, next: safeDestination(next) });
  return `dwd://auth/callback?${query.toString()}`;
}

export function nativeLinkDestination(path: string): string {
  try {
    const url = new URL(path, 'dwd:///');
    const native = url.protocol === 'dwd:';
    const development =
      (url.protocol === 'exp:' || url.protocol === 'exps:') && url.pathname.startsWith('/--/');
    if (!native && !development && url.protocol !== 'https:' && url.protocol !== 'http:')
      return '/';
    const pathname = development
      ? url.pathname.slice(3)
      : native && url.hostname
        ? `/${url.hostname}${url.pathname}`
        : url.pathname;
    const token =
      pathname.match(/^\/join\/([^/]+)\/?$/)?.[1] ??
      (pathname === '/' || pathname === '/join'
        ? (url.searchParams.get('token') ?? url.searchParams.get('join'))
        : null);
    if (token && inviteTokenSchema.safeParse(token).success) return `/join?token=${token}`;
    // Auth exchanges are accepted only on the app's callback route.
    if ((native || development) && pathname === '/auth/callback') {
      const params = new URLSearchParams(url.search);
      return `/auth/callback?${params.toString()}`;
    }
    if (native || development) {
      if (
        [
          '/auth',
          '/auth/sign-in',
          '/auth/sign-up',
          '/auth/confirm',
          '/auth/forgot-password',
          '/auth/reset-password',
          '/auth/complete-profile',
          '/welcome',
          '/onboarding',
          '/legal',
        ].includes(pathname)
      )
        return `${pathname}${url.search}`;
      return safeDestination(`${pathname}${url.search}`);
    }
    return '/';
  } catch {
    return '/';
  }
}

// Runs before the navigator discards a protected deep link. Never persist callback credentials.
export function captureNativeDestination(path: string, handoff: AuthHandoff): string {
  const destination = nativeLinkDestination(path);
  const url = new URL(destination, 'dwd:///');
  const next = safeDestination(url.searchParams.get('next') ?? destination);
  if (next !== '/') handoff.remember(next);
  return destination;
}
