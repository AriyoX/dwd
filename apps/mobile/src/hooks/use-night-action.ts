import { useLayoutEffect, useRef, useState } from 'react';
import { useSupabase } from '@/providers/supabase-provider';
import { featureError } from '@/lib/night-features';

export function useNightAction(refresh: () => Promise<void>) {
  const { session } = useSupabase();
  const owner = session?.user.id;
  const currentOwner = useRef(owner);
  useLayoutEffect(() => {
    currentOwner.current = owner;
  }, [owner]);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run<T>(
    action: () => Promise<T>,
    success?: string,
    saved?: (value: T) => void,
    rejected?: (error: unknown) => void,
  ) {
    if (inFlight.current || !owner || !mounted.current || currentOwner.current !== owner)
      return false;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    setNotice(null);
    const valid = () => mounted.current && currentOwner.current === owner;
    try {
      const value = await action();
      if (!valid()) return false;
      await refresh();
      if (!valid()) return false;
      if (success) setNotice(success);
      saved?.(value);
      return true;
    } catch (error) {
      if (valid()) {
        setIssue(featureError(error));
        rejected?.(error);
      }
      return false;
    } finally {
      inFlight.current = false;
      if (valid()) setBusy(false);
    }
  }
  return { busy, issue, notice, run };
}
