'use client';

import { Copy, RefreshCw, Share2, Unlink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { BrowserShareService } from '@/adapters/share-service.browser';
import { createInviteAction, revokeInviteAction } from './actions';

export function ShareInviteDialog({
  nightId,
  nightTitle,
  open,
  initialUrl,
  onClose,
}: {
  nightId: string;
  nightTitle: string;
  open: boolean;
  initialUrl: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (!open || revoked || (url ?? initialUrl) !== null || requested.current) return;
    requested.current = true;
    queueMicrotask(() => {
      setPending(true);
      void createInviteAction(nightId).then((result) => {
        setPending(false);
        if (result.ok) setUrl(result.data.url);
        else setMessage(result.error);
      });
    });
  }, [initialUrl, nightId, open, revoked, url]);

  const effectiveUrl = revoked ? null : (url ?? initialUrl);

  async function copy() {
    if (effectiveUrl === null) return;
    try {
      await new BrowserShareService().copy(effectiveUrl);
      setMessage('Invite link copied.');
    } catch {
      setMessage('Copy is unavailable in this browser. Select the link manually.');
    }
  }

  async function share() {
    if (effectiveUrl === null) return;
    const result = await new BrowserShareService().share(
      `Join ${nightTitle} on Drink with Desire`,
      'Join our shared night on Drink with Desire.',
      effectiveUrl,
    );
    if (result === 'unavailable') await copy();
  }

  async function rotate() {
    setPending(true);
    setMessage(null);
    const result = await createInviteAction(nightId, true);
    setPending(false);
    if (result.ok) {
      setRevoked(false);
      setUrl(result.data.url);
      setMessage('A new link is ready. Older active links were revoked.');
    } else setMessage(result.error);
  }

  async function revoke() {
    setPending(true);
    setMessage(null);
    const result = await revokeInviteAction(nightId);
    setPending(false);
    if (result.ok) {
      setRevoked(true);
      setUrl(null);
      setMessage('Active invite links were revoked. Create a new link only when you are ready.');
    } else setMessage(result.error);
  }

  return (
    <Dialog
      open={open}
      title="Invite account users"
      description="This private link expires in 24 hours. People sign in and create their own plan."
      onClose={onClose}
    >
      {pending ? <div className="notice-box">Creating a secure link…</div> : null}
      {effectiveUrl === null ? null : (
        <div className="invite-url" tabIndex={0}>
          {effectiveUrl}
        </div>
      )}
      {message === null ? null : (
        <div className="notice-box" role="status">
          {message}
        </div>
      )}
      <div className="stack">
        <Button
          type="button"
          full
          disabled={effectiveUrl === null || pending}
          onClick={() => void share()}
        >
          <Share2 aria-hidden="true" size={20} /> Share
        </Button>
        <Button
          type="button"
          variant="secondary"
          full
          disabled={effectiveUrl === null || pending}
          onClick={() => void copy()}
        >
          <Copy aria-hidden="true" size={20} /> Copy link
        </Button>
        <Button type="button" variant="ghost" full disabled={pending} onClick={() => void rotate()}>
          <RefreshCw aria-hidden="true" size={18} /> Rotate link
        </Button>
        <Button
          type="button"
          variant="ghost"
          full
          disabled={pending || effectiveUrl === null}
          onClick={() => void revoke()}
        >
          <Unlink aria-hidden="true" size={18} /> Revoke links
        </Button>
      </div>
    </Dialog>
  );
}
