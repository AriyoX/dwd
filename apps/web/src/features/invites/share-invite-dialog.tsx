'use client';

import { Copy, Link2, RefreshCw, Share2, Unlink } from 'lucide-react';
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
        setMessage('Invite links are off. Create a new link whenever you’re ready.');
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
            ? 'New link ready. Earlier links no longer work.'
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
      description="Friends join and log their own drinks. Your private link expires in 24 hours."
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {pending && (
        <p className="notice-box" role="status">
          Just a moment…
        </p>
      )}
      {effectiveUrl && (
        <div className="invite-link-card">
          <span className="invite-link-label">
            <Link2 size={17} aria-hidden="true" /> Your invite link
          </span>
          <div className="invite-url" tabIndex={0} aria-label="Your invite link">
            {effectiveUrl}
          </div>
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
        {effectiveUrl && (
          <div className="invite-share-actions">
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
          </div>
        )}
        {effectiveUrl && (
          <details className="invite-link-options">
            <summary>Link options</summary>
            <div className="stack">
              <p className="muted small">
                Replacing or turning off links stops anyone else joining with the old ones. Friends
                already in the night stay.
              </p>
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
                Turn off invite links
              </Button>
            </div>
          </details>
        )}
      </div>
    </Dialog>
  );
}
