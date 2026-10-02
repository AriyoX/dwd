export type AccessState = 'restoring' | 'signed-out' | 'profile' | 'recovery' | 'ready';
export type ProfileState = 'loading' | 'complete' | 'incomplete' | 'error';

export function accountAccess({
  restoring,
  signedIn,
  profile,
  recovering,
}: {
  restoring: boolean;
  signedIn: boolean;
  profile: ProfileState;
  recovering: boolean;
}): AccessState {
  if (restoring) return 'restoring';
  if (!signedIn) return 'signed-out';
  if (recovering) return 'recovery';
  if (profile === 'loading') return 'restoring';
  return profile === 'complete' ? 'ready' : 'profile';
}

export const authRoutes = {
  login: '/auth/sign-in',
  signup: '/auth/sign-up',
  confirm: '/auth/confirm',
  recover: '/auth/forgot-password',
  reset: '/auth/reset-password',
  complete: '/auth/complete-profile',
} as const;
export type AuthMode = keyof typeof authRoutes;

export function legacyAuthRoute(mode: unknown) {
  return typeof mode === 'string' && Object.hasOwn(authRoutes, mode)
    ? authRoutes[mode as AuthMode]
    : authRoutes.login;
}

// Public callback and legal screens remain reachable during every account state.
// Product routes are also guarded by Stack.Protected, including their back history.
export function authRedirect(access: AccessState, pathname: string, introductionSeen: boolean) {
  if (pathname === '/auth/callback' || pathname === '/legal') return null;
  if (access === 'restoring') return null;
  if (access === 'recovery') return pathname === authRoutes.reset ? null : authRoutes.reset;
  if (access === 'profile') return pathname === authRoutes.complete ? null : authRoutes.complete;
  if (access === 'ready')
    return pathname === '/welcome' || pathname === '/onboarding' || pathname.startsWith('/auth')
      ? 'destination'
      : null;
  if (
    !introductionSeen &&
    ['/welcome', '/auth', authRoutes.login, authRoutes.signup].includes(pathname)
  )
    return '/onboarding';
  if (pathname === authRoutes.complete) return authRoutes.login;
  return null;
}

const INTRODUCTION_KEY = 'dwd.mobile.introduction.v1';
type IntroductionStore = Pick<Storage, 'getItem' | 'setItem'>;
export function introductionSeen(storage: IntroductionStore): boolean {
  try {
    return storage.getItem(INTRODUCTION_KEY) === 'seen';
  } catch {
    return false;
  }
}
export function rememberIntroduction(storage: IntroductionStore) {
  try {
    storage.setItem(INTRODUCTION_KEY, 'seen');
  } catch {
    // The current launch can continue even if device storage is unavailable.
  }
}
