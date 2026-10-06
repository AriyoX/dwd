import { Redirect, useLocalSearchParams } from 'expo-router';
import { legacyAuthRoute } from '@/lib/auth-routing';

// Keep links from earlier native versions usable.
export default function LegacyAuthScreen() {
  const { mode, next, updated } = useLocalSearchParams<{
    mode?: string;
    next?: string;
    updated?: string;
  }>();
  return (
    <Redirect
      href={{
        pathname: legacyAuthRoute(mode),
        params: { ...(next ? { next } : {}), ...(updated ? { updated } : {}) },
      }}
    />
  );
}
