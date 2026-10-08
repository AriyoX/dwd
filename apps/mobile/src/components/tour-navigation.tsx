import { useContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useSupabase } from '@/providers/supabase-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { rememberTourSeen, shouldStartTour, tourSeenKey } from '@/lib/practice-tour';
import { withRequestTimeout } from '@/lib/request-timeout';
import { PermissionContext } from '@/providers/permission-context';

export function TourNavigation() {
  const { session, client, access } = useSupabase();
  const { online } = useConnectivity();
  const permissions = useContext(PermissionContext);
  const permissionsPending = permissions ? !permissions.ready || permissions.busy : false;
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const router = useRouter();
  const shown = useRef(new Set<string>());
  const saving = useRef(false);
  const owner = session?.user.id;
  const accountSeen = session?.user.user_metadata['tour_seen'] === true;
  useEffect(() => {
    // Let authentication, invitations and push deep links finish before touring.
    if (
      !navigation.key ||
      permissionsPending ||
      access !== 'ready' ||
      !owner ||
      pathname !== '/' ||
      shown.current.has(owner)
    )
      return;
    const timer = setTimeout(() => {
      if (!shouldStartTour(globalThis.localStorage, owner)) return;
      shown.current.add(owner);
      try {
        rememberTourSeen(globalThis.localStorage, owner);
      } catch {
        /* One tour per session. */
      }
      router.push('/tour');
    }, 0);
    return () => clearTimeout(timer);
  }, [navigation.key, access, owner, pathname, accountSeen, router, permissionsPending]);
  useEffect(() => {
    if (!owner || !client || access !== 'ready' || accountSeen || online === false) return;
    let active = true;
    const save = async () => {
      if (!active || saving.current) return;
      try {
        if (
          !shown.current.has(owner) &&
          globalThis.localStorage.getItem(tourSeenKey(owner)) !== 'true'
        ) {
          return;
        }
        saving.current = true;
        // Match the web's display preference. This is never an authorization claim.
        await withRequestTimeout(() => client.auth.updateUser({ data: { tour_seen: true } }));
      } catch {
        /* Local dismissal remains saved; reconnecting retries the preference. */
      } finally {
        saving.current = false;
      }
    };
    void save();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void save();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [owner, client, access, accountSeen, online, pathname]);
  return null;
}
