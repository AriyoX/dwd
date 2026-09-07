'use client';

import { Copy, RefreshCw, Share2, Unlink } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { BrowserShareService } from '@/adapters/share-service.browser';
import { createInviteAction, revokeInviteAction } from './actions';
import { newInviteRequestToken } from './invite-request';

type Attempt = { kind: 'create' | 'rotate' | 'revoke'; token: string };
export function ShareInviteDialog({
  nightId,
  currentUserId,
  nightTitle,
  open,
  initialUrl,
  onClose,
}: {
  nightId: string;
  currentUserId: string;
  nightTitle: string;
  open: boolean;
  initialUrl: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const storageKey = `dwd-invite-request:${currentUserId}:${nightId}`;
  const effectiveUrl = revoked ? null : (url ?? initialUrl);

  async function mutate(kind: Attempt['kind']) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    try {
      if (attempt.current === null) {
        try {
          const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
          if (
            saved &&
            typeof saved === 'object' &&
            'kind' in saved &&
            'token' in saved &&
            (saved.kind === 'create' || saved.kind === 'rotate' || saved.kind === 'revoke') &&
            typeof saved.token === 'string' &&
            /^[A-Za-z0-9_-]{43}$/.test(saved.token)
          )
            attempt.current = { kind: saved.kind, token: saved.token };
        } catch {
          /* In-memory retries remain available. */
        }
      }
      // Recover any uncertain operation before starting another one.
      const operation = attempt.current ?? { kind, token: newInviteRequestToken() };
      attempt.current = operation;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(operation));
      } catch {
        /* Keep the same token in memory. */
      }
      if (operation.kind === 'revoke') {
        const result = await revokeInviteAction(nightId, operation.token);
        if (!result.ok) {
          setFailed(true);
          setMessage(result.error);
          return;
        }
        setRevoked(true);
        setUrl(null);
        setMessage('Invite links revoked. Create a new link when you are ready.');
      } else {
        const result = await createInviteAction(
          nightId,
          operation.kind === 'rotate',
          operation.token,
        );
        if (!result.ok) {
          setFailed(true);
          setMessage(result.error);
          return;
        }
        setRevoked(false);
        setUrl(result.data.url);
        setMessage(
          operation.kind === 'rotate'
            ? 'New link ready. Earlier links were revoked.'
            : 'Private link ready. It expires in 24 hours.',
        );
      }
      attempt.current = null;
      setFailed(false);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Replaying the same request is safe. */
      }
    } catch {
      setFailed(true);
      setMessage('Connection lost. Try again to finish updating your invite link.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function copy() {
    if (effectiveUrl === null || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await new BrowserShareService().copy(effectiveUrl);
      setMessage('Invite link copied.');
    } catch {
      setMessage('Copy is unavailable. Select the link manually.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  async function share() {
    if (effectiveUrl === null || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const service = new BrowserShareService();
      const result = await service.share(
        `Join ${nightTitle} on DWD`,
        'Join our shared night on DWD.',
        effectiveUrl,
      );
      if (result === 'unavailable') {
        await service.copy(effectiveUrl);
        setMessage('Invite link copied.');
      }
    } catch {
      setMessage('Sharing did not complete. Retry or copy the link.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      title="Invite someone"
      description="They use their own account and phone, and manage their own entries. This private link expires in 24 hours."
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {pending && (
        <p className="notice-box" role="status">
          Working?
        </p>
      )}
      {effectiveUrl && (
        <div className="invite-url" tabIndex={0}>
          {effectiveUrl}
        </div>
      )}
      {message && (
        <p className="notice-box" role="status">
          {message}
        </p>
      )}
      <div className="stack">
        {failed ? (
          <Button type="button" disabled={pending} onClick={() => void mutate('create')}>
            Try again
          </Button>
        ) : (
          effectiveUrl === null && (
            <Button type="button" disabled={pending} onClick={() => void mutate('create')}>
              Create invite link
            </Button>
          )
        )}
        <Button
          type="button"
          full
          disabled={!effectiveUrl || pending || failed}
          onClick={() => void share()}
        >
          <Share2 size={20} aria-hidden="true" />
          Share
        </Button>
        <Button
          type="button"
          full
          variant="secondary"
          disabled={!effectiveUrl || pending || failed}
          onClick={() => void copy()}
        >
          <Copy size={20} aria-hidden="true" />
          Copy link
        </Button>
        <Button
          type="button"
          full
          variant="ghost"
          disabled={pending || failed || !effectiveUrl}
          onClick={() => void mutate('rotate')}
        >
          <RefreshCw size={18} aria-hidden="true" />
          Replace invite link
        </Button>
        <Button
          type="button"
          full
          variant="ghost"
          disabled={pending || failed || !effectiveUrl}
          onClick={() => void mutate('revoke')}
        >
          <Unlink size={18} aria-hidden="true" />
          Revoke links
        </Button>
      </div>
    </Dialog>
  );
}
