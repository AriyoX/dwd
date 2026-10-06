'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getBlockedUsersAction, unblockUserAction } from '@/features/support/moderation-actions';
export function BlockedUsers() {
  const [users, setUsers] = useState<{ userId: string; displayName: string }[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    void getBlockedUsersAction().then((result) => {
      if (current) {
        if (result.ok) setUsers(result.users);
        else setMessage(result.error);
      }
    });
    return () => {
      current = false;
    };
  }, []);
  return (
    <details className="stack">
      <summary>Blocked people</summary>
      <div className="stack">
        {users?.length === 0 ? <p>No blocked people.</p> : null}
        {users?.map((user) => (
          <Button
            key={user.userId}
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void unblockUserAction(user.userId)
                .then((result) => {
                  if (result.ok)
                    setUsers(
                      (current) => current?.filter((entry) => entry.userId !== user.userId) ?? [],
                    );
                  else setMessage(result.error);
                })
                .catch(() => setMessage('Could not connect. Retry.'))
                .finally(() => setBusy(false));
            }}
          >
            Unblock {user.displayName}
          </Button>
        ))}
        {message ? <p role="status">{message}</p> : null}
      </div>
    </details>
  );
}
