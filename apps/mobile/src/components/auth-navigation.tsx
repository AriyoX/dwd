import { useEffect, useRef } from 'react';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { authHandoff } from '@/lib/auth-state';
import { authRedirect } from '@/lib/auth-routing';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useSupabase } from '@/providers/supabase-provider';

export function AuthNavigation() {
  const { access } = useSupabase();
  const { seen, complete } = useOnboarding();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const router = useRouter();
  const redirecting = useRef<string | null>(null);
  useEffect(() => {
    if (!navigation.key) return;
    const redirect = authRedirect(access, pathname, seen);
    const source = `${access}:${pathname}`;
    if (redirect && redirecting.current === source) return;
    redirecting.current = redirect ? source : null;
    if (access === 'ready' && !seen) complete();
    // Keep the handoff until a product screen actually opens. Protected-route
    // fallback and profile completion may both trigger navigation in one commit.
    if (redirect === 'destination') router.replace(authHandoff().read().next as Href);
    else if (redirect) router.replace(redirect as Href);
    else if (access === 'ready' && !pathname.startsWith('/auth') && pathname !== '/legal')
      authHandoff().clear();
  }, [navigation.key, pathname, access, seen, complete, router]);
  return null;
}
