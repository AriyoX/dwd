'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize IndexedDB drafts, remote session state and revocable preview URLs. */
/* eslint-disable @next/next/no-img-element -- Local previews use revocable blob URLs. */
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, RotateCcw } from 'lucide-react';
import { MAX_BATCH, MAX_PARALLEL_UPLOADS } from './photo-contracts';
import type { SessionStatus, UploadTicket } from './photo-contracts';
import {
  directPhotoUpload,
  photoRequest,
  photoErrorMessage,
  PhotoApiError,
  withPhotoUploadSlot,
} from './photo-client';
import { prepareEventPhoto } from './prepare-event-photo';
import { PHOTO_INPUT_ACCEPT } from '../photos/decode-photo';
import { readPhotoDrafts, savePhotoDrafts, type PhotoDraft } from './photo-drafts';
import { PhotoDialog } from './photo-dialog';
import { PhotoConnectionNotice } from './photo-connection-notice';
import { PhotoTurnstile } from './photo-turnstile';
import styles from './photo-sharing.module.css';

function Preview({ blob, name }: { blob: Blob | undefined; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) return;
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url ? (
    <img src={url} alt={name} width={72} height={72} />
  ) : (
    <span className={styles['previewPlaceholder']}>
      <Camera size={22} />
    </span>
  );
}
const stateLabels = {
  preparing: 'Preparing',
  ready: 'Ready',
  uploading: 'Uploading',
  verifying: 'Checking',
  complete: 'Shared',
  failed: 'Needs attention',
};

export function PhotoUploader({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [drafts, setDrafts] = useState<PhotoDraft[]>([]);
  const current = useRef<PhotoDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [token, setToken] = useState('');
  const [verificationKey, setVerificationKey] = useState(0);
  const persistence = useRef(Promise.resolve());
  const input = useRef<HTMLInputElement>(null);

  function commit(next: PhotoDraft[]) {
    current.current = next;
    setDrafts(next);
    persistence.current = persistence.current
      .catch(() => undefined)
      .then(() => savePhotoDrafts(next))
      .catch(() => {
        setNotice(
          'Keep this page open until your photos finish. Your selection can’t be saved on this device.',
        );
      });
  }
  function patch(clientId: string, update: Partial<PhotoDraft>) {
    commit(
      current.current.map((item) => (item.clientId === clientId ? { ...item, ...update } : item)),
    );
  }
  async function refreshStatus() {
    const next = await photoRequest<SessionStatus>('session', { method: 'POST' });
    setStatus(next);
    // Recover publication after a lost completion response, even across reloads.
    const nextDrafts = current.current.map((draft) => {
      const ticket = next.recentUploads.find((item) => item.clientId === draft.clientId);
      if (!ticket) return draft;
      if (ticket.status === 'completed' && draft.state !== 'complete') {
        const { blob: _blob, ...rest } = draft;
        void _blob;
        return {
          ...rest,
          reservationId: ticket.id,
          state: 'complete' as const,
          error: '',
          permanent: false,
        };
      }
      if (['expired', 'rejected'].includes(ticket.status) && !draft.permanent)
        return {
          ...draft,
          reservationId: ticket.id,
          state: 'failed' as const,
          permanent: true,
          error:
            ticket.status === 'expired'
              ? 'This upload expired. Choose the photo again to share it.'
              : 'This photo couldn’t be shared. Please choose it again.',
        };
      if (draft.reservationId === undefined) return { ...draft, reservationId: ticket.id };
      return draft;
    });
    const recovered = nextDrafts.some(
      (draft, index) => draft.state === 'complete' && current.current[index]?.state !== 'complete',
    );
    if (nextDrafts.some((draft, index) => draft !== current.current[index])) commit(nextDrafts);
    if (recovered) onPublished();
    return next;
  }
  useEffect(() => {
    let mounted = true;
    void readPhotoDrafts()
      .then((items) => {
        if (!mounted) return;
        current.current = items;
        setDrafts(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!open || !loaded) return;
    void refreshStatus().catch((cause: unknown) => setError(photoErrorMessage(cause)));
    // Refresh when opened, without restarting active uploads on status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  async function choose(files: FileList | null) {
    if (!files?.length || running.current) return;
    setError('');
    const selected = Array.from(files);
    const batchLimit = Math.min(MAX_BATCH, status?.batchLimit ?? MAX_BATCH);
    if (selected.length > batchLimit) {
      setError('Choose up to ' + String(batchLimit) + ' photos at a time.');
      if (input.current) input.current.value = '';
      return;
    }
    if (selected.length > availableToChoose) {
      setError(
        'You can share ' +
          String(availableToChoose) +
          ' more photo' +
          (availableToChoose === 1 ? '' : 's') +
          ' for this event.',
      );
      if (input.current) input.current.value = '';
      return;
    }
    if (
      current.current.some((item) => item.state !== 'complete') &&
      !window.confirm('Replace your unshared photos? Photos already shared will stay in the album.')
    ) {
      if (input.current) input.current.value = '';
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      await cancelPending();
      const nextStatus = await refreshStatus();
      if (selected.length > nextStatus.remaining) {
        throw new Error(
          'There isn’t enough room in your photo allowance for this selection. Choose fewer photos.',
        );
      }
    } catch (cause) {
      setError(photoErrorMessage(cause));
      if (input.current) input.current.value = '';
      running.current = false;
      setBusy(false);
      return;
    }
    const next: PhotoDraft[] = selected.map((file) => ({
      clientId: crypto.randomUUID(),
      name: file.name,
      state: 'preparing',
    }));
    commit(next);
    setProgress({});
    setNotice('');
    try {
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        const draft = next[i];
        if (!file || !draft) continue;
        try {
          const result = await prepareEventPhoto(file);
          patch(draft.clientId, { ...result, size: result.blob.size, state: 'ready' });
        } catch (cause) {
          patch(draft.clientId, {
            state: 'failed',
            permanent: true,
            error: photoErrorMessage(cause),
          });
        }
      }
      await persistence.current;
    } finally {
      running.current = false;
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  async function ensureTickets() {
    const fresh = current.current.filter(
      (item) => !item.reservationId && item.blob && !item.permanent,
    );
    if (!fresh.length) return;
    const batchId = fresh[0]?.batchId ?? crypto.randomUUID();
    commit(
      current.current.map((item) =>
        fresh.some((f) => f.clientId === item.clientId) ? { ...item, batchId } : item,
      ),
    );
    await persistence.current;
    try {
      const result = await photoRequest<{ tickets: UploadTicket[] }>('batches', {
        method: 'POST',
        body: {
          batchId,
          token,
          files: fresh.map((item) => ({
            clientId: item.clientId,
            fingerprint: item.fingerprint,
            size: item.size,
            type: item.blob?.type,
          })),
        },
      });
      commit(
        current.current.map((item) => {
          const ticket = result.tickets.find((t) => t.clientId === item.clientId);
          return ticket ? { ...item, reservationId: ticket.id } : item;
        }),
      );
      await persistence.current;
    } finally {
      setToken('');
      setVerificationKey((key) => key + 1);
    }
  }
  async function uploadOne(clientId: string) {
    let item = current.current.find((draft) => draft.clientId === clientId);
    if (!item?.blob || !item.reservationId || item.state === 'complete') return;
    try {
      if (!item.staged) {
        patch(clientId, { state: 'uploading', error: '' });
        setProgress((values) => ({ ...values, [clientId]: 0 }));
        // Get each five-minute URL just before its worker starts uploading.
        const ticket = await photoRequest<{ url: string }>(`uploads/${item.reservationId}/url`, {
          method: 'POST',
        });
        await directPhotoUpload(ticket.url, item.blob, (percent) =>
          setProgress((values) => ({ ...values, [clientId]: percent })),
        );
        patch(clientId, { staged: true });
      }
      item = current.current.find((draft) => draft.clientId === clientId);
      if (!item?.reservationId) return;
      patch(clientId, { state: 'verifying', error: '' });
      await photoRequest(`uploads/${item.reservationId}/complete`, { method: 'POST' });
      const { blob: _blob, ...rest } = item;
      void _blob;
      commit(
        current.current.map((draft) =>
          draft.clientId === clientId ? { ...rest, state: 'complete' } : draft,
        ),
      );
      onPublished();
    } catch (cause) {
      const permanent =
        cause instanceof PhotoApiError &&
        ['invalid_image', 'reservation_expired', 'upload_not_found', 'renewal_limit'].includes(
          cause.code,
        );
      patch(clientId, { state: 'failed', permanent, error: photoErrorMessage(cause) });
    }
  }
  async function upload(ids?: string[]) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const nextStatus = await refreshStatus();
      if (nextStatus.uploadsEnabled) await ensureTickets();
      const queue = current.current
        .filter(
          (item) =>
            (!ids || ids.includes(item.clientId)) &&
            item.state !== 'complete' &&
            item.blob &&
            !item.permanent &&
            (nextStatus.uploadsEnabled || item.staged),
        )
        .map((item) => item.clientId);
      await Promise.all(
        Array.from({ length: MAX_PARALLEL_UPLOADS }, async () => {
          for (let clientId = queue.shift(); clientId; clientId = queue.shift()) {
            const next = clientId;
            await withPhotoUploadSlot(() => uploadOne(next));
          }
        }),
      );
      await persistence.current;
      await refreshStatus();
    } catch (cause) {
      setError(photoErrorMessage(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const pending = drafts.filter(
    (item) => item.state !== 'complete' && item.blob && !item.permanent,
  );
  const readyToShare =
    status?.uploadsEnabled === false ? pending.filter((item) => item.staged) : pending;
  const needsChallenge =
    readyToShare.some((item) => !item.reservationId) && status?.protection !== 'local-bypass';
  const canUpload = !busy && !!status && readyToShare.length > 0 && (!needsChallenge || !!token);
  const reservedHere = drafts.filter((item) =>
    status?.recentUploads.some(
      (ticket) =>
        ticket.clientId === item.clientId && ['pending', 'verifying'].includes(ticket.status),
    ),
  ).length;
  const availableToChoose = (status?.remaining ?? 0) + reservedHere;
  const completed = drafts.filter((item) => item.state === 'complete').length;
  async function cancelPending() {
    const ids = current.current
      .filter((item) => item.reservationId && item.state !== 'complete')
      .map((item) => item.reservationId)
      .filter((value): value is string => !!value);
    if (ids.length) {
      const result = await photoRequest<{ cancelled: number }>('batches/cancel', {
        method: 'POST',
        body: { ids },
      });
      if (result.cancelled < ids.length) {
        const next = await refreshStatus();
        if (
          next.recentUploads.some(
            (ticket) => ids.includes(ticket.id) && ticket.status === 'verifying',
          )
        )
          throw new Error('Some photos are still being checked. Please try again in a moment.');
      }
    }
  }
  async function clearBatch() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await cancelPending();
      commit([]);
      setError('');
      await refreshStatus();
    } catch (cause) {
      setError(photoErrorMessage(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <PhotoDialog open={open} onClose={onClose} title="Add photos" busy={busy}>
      <div className={styles['panelBody']}>
        <PhotoConnectionNotice />
        <p className={styles['notice']}>Photos are public. Anyone can view and download them.</p>
        <p className={styles['muted']}>
          Choose up to {Math.min(MAX_BATCH, status?.batchLimit ?? MAX_BATCH)} photos at a time.
        </p>
        {status && !status.uploadsEnabled && (
          <p role="status" className={styles['notice']}>
            New uploads are paused. Photos already sent can still finish.
          </p>
        )}
        {status && availableToChoose === 0 && (
          <p className={styles['notice']}>You’ve reached the photo limit for this event.</p>
        )}
        {!loaded && <p role="status">Restoring uploads…</p>}
        {error && (
          <p role="alert" className={styles['error']}>
            {error}
          </p>
        )}
        {!status && loaded && !error && (
          <p role="status" className={styles['muted']}>
            Connecting…
          </p>
        )}
        {!status && loaded && error && (
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={busy}
            onClick={() => {
              setError('');
              void refreshStatus().catch((cause: unknown) => setError(photoErrorMessage(cause)));
            }}
          >
            Reconnect
          </button>
        )}
        {notice && (
          <p role="status" className={styles['muted']}>
            {notice}
          </p>
        )}
        {status?.protection === 'unavailable' && (
          <p role="alert" className={styles['error']}>
            Photo sharing is unavailable right now. Please try again later.
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept={PHOTO_INPUT_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            void choose(event.target.files);
          }}
        />
        <button
          type="button"
          className={styles['primaryButton']}
          disabled={
            busy ||
            !loaded ||
            !status ||
            !status.uploadsEnabled ||
            availableToChoose === 0 ||
            status.protection === 'unavailable'
          }
          onClick={() => input.current?.click()}
        >
          <Camera size={18} aria-hidden="true" />{' '}
          {drafts.length ? 'Choose different photos' : 'Choose photos'}
        </button>
        {drafts.length > 0 && (
          <ul className={styles['uploadList']} aria-label="Selected photos">
            {drafts.map((item) => (
              <li key={item.clientId}>
                <Preview blob={item.blob} name={item.name} />
                <div className={styles['uploadInfo']}>
                  <span className={styles['fileName']}>{item.name}</span>
                  <span aria-live="polite">
                    {stateLabels[item.state]}
                    {item.state === 'uploading' ? ` · ${progress[item.clientId] ?? 0}%` : ''}
                  </span>
                  {item.state === 'uploading' && (
                    <progress
                      max={100}
                      value={progress[item.clientId] ?? 0}
                      aria-label={`Uploading ${item.name}`}
                    />
                  )}
                  {item.error && <p className={styles['error']}>{item.error}</p>}
                </div>
                {item.state === 'complete' && <Check size={20} aria-label="Shared" />}
                {item.state === 'failed' && !item.permanent && (
                  <button
                    type="button"
                    className={styles['iconButton']}
                    aria-label={`Retry ${item.name}`}
                    disabled={!canUpload}
                    onClick={() => {
                      void upload([item.clientId]);
                    }}
                  >
                    <RotateCcw size={20} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {open &&
          loaded &&
          status?.protection === 'turnstile' &&
          status.uploadsEnabled &&
          readyToShare.some((item) => !item.reservationId) && (
            <div className={styles['verification']}>
              <PhotoTurnstile resetKey={verificationKey} onToken={setToken} />
              <button
                type="button"
                className={styles['textButton']}
                disabled={busy}
                onClick={() => {
                  setToken('');
                  setVerificationKey((key) => key + 1);
                }}
              >
                Try verification again
              </button>
            </div>
          )}
        {readyToShare.length > 0 && (
          <button
            type="button"
            className={styles['primaryButton']}
            disabled={!canUpload}
            onClick={() => {
              void upload();
            }}
          >
            {busy
              ? drafts.some((item) => item.state === 'preparing')
                ? 'Preparing photos…'
                : 'Sharing…'
              : `${status?.uploadsEnabled === false ? 'Finish' : 'Share'} ${readyToShare.length} photo${readyToShare.length === 1 ? '' : 's'}`}
          </button>
        )}
        {completed > 0 && (
          <p role="status">
            {completed} photo{completed === 1 ? '' : 's'} shared.
          </p>
        )}
        {busy && (
          <p className={styles['muted']} role="status">
            Keep this panel open while your photos finish.
          </p>
        )}
        {!busy && drafts.length > 0 && (
          <button
            type="button"
            className={styles['textButton']}
            onClick={() => {
              void clearBatch();
            }}
          >
            Clear selection
          </button>
        )}
        {!busy && completed > 0 && pending.length === 0 && (
          <button type="button" className={styles['primaryButton']} onClick={onClose}>
            View photos
          </button>
        )}
      </div>
    </PhotoDialog>
  );
}
