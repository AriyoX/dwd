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
import { readPhotoDrafts, savePhotoDrafts, type PhotoDraft } from './photo-drafts';
import { PhotoDialog } from './photo-dialog';
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
  verifying: 'Verifying',
  complete: 'Published',
  failed: 'Failed',
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
          'This browser cannot save upload recovery. Keep this panel open until your uploads finish.',
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
        return { ...rest, reservationId: ticket.id, state: 'complete' as const };
      }
      if (draft.reservationId === undefined) return { ...draft, reservationId: ticket.id };
      return draft;
    });
    if (nextDrafts.some((draft, index) => draft !== current.current[index])) commit(nextDrafts);
    return next;
  }
  useEffect(() => {
    void readPhotoDrafts()
      .then((items) => {
        current.current = items;
        setDrafts(items);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
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
    if (selected.length > MAX_BATCH) {
      setError('Choose up to 10 photos per batch.');
      return;
    }
    if (selected.length > (status?.remaining ?? 25)) {
      setError(`You can add ${status?.remaining ?? 25} more photos from this browser.`);
      return;
    }
    if (
      current.current.some((item) => item.state !== 'complete') &&
      !window.confirm(
        'Replace the remaining prepared photos? Already published photos stay in the shared album.',
      )
    )
      return;
    running.current = true;
    setBusy(true);
    try {
      await cancelPending();
    } catch (cause) {
      setError(photoErrorMessage(cause));
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
      await refreshStatus();
      await ensureTickets();
      const queue = current.current
        .filter(
          (item) =>
            (!ids || ids.includes(item.clientId)) &&
            item.state !== 'complete' &&
            item.blob &&
            !item.permanent,
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
  const needsChallenge =
    pending.some((item) => !item.reservationId) && status?.protection !== 'local-bypass';
  const canUpload =
    !busy && pending.length > 0 && (!needsChallenge || !!token) && status?.uploadsEnabled !== false;
  const completed = drafts.filter((item) => item.state === 'complete').length;
  async function cancelPending() {
    const ids = current.current
      .filter((item) => item.reservationId && item.state !== 'complete')
      .map((item) => item.reservationId)
      .filter((value): value is string => !!value);
    if (ids.length) await photoRequest('batches/cancel', { method: 'POST', body: { ids } });
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
    <PhotoDialog open={open} onClose={onClose} title="Upload Photos" busy={busy}>
      <div className={styles['panelBody']}>
        <p className={styles['notice']}>
          Your photos become visible and downloadable by anyone who can access this event gallery.
        </p>
        <p className={styles['muted']}>
          Up to 10 photos per batch · 25 per browser. Photos are optimized to 2048px, with location
          metadata removed.
        </p>
        {status && (
          <p className={styles['muted']}>
            {status.remaining} photos available from this browser
            {!status.uploadsEnabled ? ' · Uploads paused' : ''}
          </p>
        )}
        {!loaded && <p role="status">Restoring uploads…</p>}
        {error && (
          <p role="alert" className={styles['error']}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={styles['muted']}>
            {notice}
          </p>
        )}
        {status?.protection === 'unavailable' && (
          <p role="alert" className={styles['error']}>
            Upload verification is not configured. Please contact an organizer.
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          multiple
          hidden
          onChange={(event) => {
            void choose(event.target.files);
          }}
        />
        <button
          type="button"
          className={styles['primaryButton']}
          disabled={busy || !loaded || status?.uploadsEnabled === false || status?.remaining === 0}
          onClick={() => input.current?.click()}
        >
          <Camera size={18} /> {drafts.length ? 'Choose another batch' : 'Choose photos'}
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
                {item.state === 'complete' && <Check size={20} aria-label="Published" />}
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
          pending.some((item) => !item.reservationId) && (
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
                Refresh verification
              </button>
            </div>
          )}
        {pending.length > 0 && (
          <button
            type="button"
            className={styles['primaryButton']}
            disabled={!canUpload}
            onClick={() => {
              void upload();
            }}
          >
            {busy
              ? 'Uploading…'
              : `Upload ${pending.length} photo${pending.length === 1 ? '' : 's'}`}
          </button>
        )}
        {completed > 0 && (
          <p role="status">
            {completed} photo{completed === 1 ? '' : 's'} published in the shared gallery.
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
            Clear this batch
          </button>
        )}
      </div>
    </PhotoDialog>
  );
}
