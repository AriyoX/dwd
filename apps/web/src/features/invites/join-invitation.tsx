'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { redeemInviteAction } from './actions';

export function JoinInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

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
      {error === null ? null : (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <Button type="button" full disabled={pending} onClick={() => void redeem()}>
        {pending ? 'Joining…' : 'Join this night'}
      </Button>
    </div>
  );
}
