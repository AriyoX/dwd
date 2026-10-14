'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { redeemInviteAction } from './actions';
import { QuickInviteOffer } from '@/features/quick-log/invite-offer';
import { browserQuickOffer } from '@/features/quick-log/local';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export function JoinInvitation({
  token,
  nightTitle,
  accountId,
}: {
  token: string;
  nightTitle: string;
  accountId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [joined, setJoined] = useState<{ nightId: string; needsPlan: boolean } | null>(null);
  const owner = useRef(accountId);
  useEffect(() => {
    const { data } = createBrowserSupabaseClient().auth.onAuthStateChange((_, session) => {
      owner.current = session?.user.id ?? '';
      if (owner.current !== accountId) {
        setJoined(null);
        setError('Your account changed. Open this invitation again.');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [accountId]);

  async function redeem() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await redeemInviteAction(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (owner.current !== accountId) {
        router.refresh();
        return;
      }
      if (browserQuickOffer(accountId)) setJoined(result.data);
      else
        router.replace(`/night/${result.data.nightId}${result.data.needsPlan ? '?setup=1' : ''}`);
    } catch {
      setError('Couldn’t join. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="stack">
      {joined ? (
        <QuickInviteOffer
          nightId={joined.nightId}
          nightTitle={nightTitle}
          accountId={accountId}
          onNotNow={() =>
            router.replace(`/night/${joined.nightId}${joined.needsPlan ? '?setup=1' : ''}`)
          }
        />
      ) : (
        <>
          {error === null ? null : (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <Button type="button" full disabled={pending} onClick={() => void redeem()}>
            {pending ? 'Joining…' : 'Join this night'}
          </Button>
        </>
      )}
    </div>
  );
}
