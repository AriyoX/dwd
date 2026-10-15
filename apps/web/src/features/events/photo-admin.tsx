'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize remote event state. */
import { useCallback, useEffect, useState } from 'react';
import type { AdminSummary, GalleryPhoto } from './photo-contracts';
import { photoErrorMessage, photoRequest } from './photo-client';
import { PhotoGallery } from './photo-gallery';
import styles from './photo-sharing.module.css';

export function PhotoAdmin() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusPhoto, setFocusPhoto] = useState<GalleryPhoto | null>(null);
  const refresh = useCallback(async () => {
    const next = await photoRequest<AdminSummary>('admin/summary');
    setSummary(next);
  }, []);
  useEffect(() => {
    void refresh().catch((cause: unknown) => setError(photoErrorMessage(cause)));
  }, [refresh]);
  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await refresh();
      setRevision((value) => value + 1);
      setNotice(message);
    } catch (cause) {
      setError(photoErrorMessage(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  async function moderate(photo: GalleryPhoto, kind: 'hide' | 'show' | 'delete') {
    await action(
      () => photoRequest(`admin/photos/${photo.id}/${kind}`, { method: 'POST' }),
      kind === 'delete'
        ? 'Photo removed from the gallery. Object deletion will retry automatically if storage is unavailable.'
        : kind === 'hide'
          ? 'Photo hidden.'
          : 'Photo visible.',
    );
  }
  function toggle(key: 'uploads_enabled' | 'gallery_enabled', value: boolean) {
    if (
      key === 'gallery_enabled' &&
      !value &&
      !window.confirm(
        'Close the public gallery? Previously issued photo links can work for up to two minutes.',
      )
    )
      return;
    void action(
      () => photoRequest('admin/settings', { method: 'PATCH', body: { [key]: value } }),
      key === 'uploads_enabled'
        ? value
          ? 'Uploads resumed.'
          : 'New uploads paused. Already uploaded photos may finish verification.'
        : value
          ? 'Gallery opened.'
          : 'Gallery closed.',
    ).catch(() => undefined);
  }
  return (
    <>
      {error && (
        <p role="alert" className={styles['error']}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!summary && (
        <button
          type="button"
          className={styles['secondaryButton']}
          onClick={() => {
            void refresh().catch((cause: unknown) => setError(photoErrorMessage(cause)));
          }}
        >
          Load event status
        </button>
      )}
      {summary && (
        <>
          <div className={styles['stats']}>
            <div className={styles['stat']}>
              <strong>{summary.counts['published'] ?? 0}</strong>
              <span>Visible photos</span>
            </div>
            <div className={styles['stat']}>
              <strong>{summary.counts['hidden'] ?? 0}</strong>
              <span>Hidden photos</span>
            </div>
            <div className={styles['stat']}>
              <strong>{summary.counts['guests'] ?? 0}</strong>
              <span>Browsers with uploads</span>
            </div>
            <div className={styles['stat']}>
              <strong>{summary.counts['pending'] ?? 0}</strong>
              <span>Pending uploads</span>
            </div>
          </div>
          <div className={styles['storage']}>
            <label htmlFor="album-storage">
              Storage: {(summary.event.used_bytes / 1024 / 1024).toFixed(1)} MB used ·{' '}
              {(summary.event.reserved_bytes / 1024 / 1024).toFixed(1)} MB reserved ·{' '}
              {(summary.event.storage_budget_bytes / 1024 ** 3).toFixed(1)} GB budget
            </label>
            <progress
              id="album-storage"
              max={summary.event.storage_budget_bytes}
              value={summary.event.used_bytes + summary.event.reserved_bytes}
            />
            <span className={styles['muted']}>
              Logical usage includes optimized photos, thumbnails and pending reservations.
            </span>
          </div>
          <div className={styles['settings']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={busy}
              onClick={() => toggle('uploads_enabled', !summary.event.uploads_enabled)}
            >
              {summary.event.uploads_enabled ? 'Pause uploads' : 'Resume uploads'}
            </button>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={busy}
              onClick={() => toggle('gallery_enabled', !summary.event.gallery_enabled)}
            >
              {summary.event.gallery_enabled ? 'Close public gallery' : 'Open public gallery'}
            </button>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={busy}
              onClick={() => {
                void action(
                  () => photoRequest('admin/cleanup', { method: 'POST' }),
                  'Cleanup finished.',
                ).catch(() => undefined);
              }}
            >
              Run cleanup
            </button>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={busy}
              onClick={() => {
                void action(() => Promise.resolve(), 'Status refreshed.').catch(() => undefined);
              }}
            >
              Refresh status
            </button>
          </div>
          <section aria-labelledby="reports-heading">
            <h2 id="reports-heading">Photo reports ({summary.reports.length})</h2>
            {!summary.reports.length && <p className={styles['muted']}>No open reports.</p>}
            <ul className={styles['reportList']}>
              {summary.reports.map((report) => (
                <li key={report.id}>
                  <span>
                    {report.reason === 'privacy' ? 'Removal / privacy request' : report.reason} ·{' '}
                    {new Date(report.created_at).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void photoRequest<GalleryPhoto>(`admin/photos/${report.photo_id}/view`)
                        .then(setFocusPhoto)
                        .catch((cause: unknown) => setError(photoErrorMessage(cause)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    View photo
                  </button>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={busy}
                    onClick={() => {
                      void action(
                        () =>
                          photoRequest(`admin/photos/${report.photo_id}/hide`, { method: 'POST' }),
                        'Reported photo hidden and report reviewed.',
                      ).catch(() => undefined);
                    }}
                  >
                    Hide photo
                  </button>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={busy}
                    onClick={() => {
                      void action(
                        () => photoRequest(`admin/reports/${report.id}/review`, { method: 'POST' }),
                        'Report marked reviewed.',
                      ).catch(() => undefined);
                    }}
                  >
                    Mark reviewed
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <details>
            <summary>Upload errors ({summary.event.upload_error_count})</summary>
            <ul className={styles['errorList']}>
              {summary.errors.map((item) => (
                <li key={item.id}>
                  {item.error_code} · {new Date(item.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <PhotoGallery admin revision={revision} onModerate={moderate} focusPhoto={focusPhoto} />
    </>
  );
}

export function OrganizerSignIn() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form
      className={styles['signInForm']}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage('');
        try {
          await photoRequest('organizer-sign-in', {
            method: 'POST',
            body: { email: form.get('email') },
          });
          setMessage('Check your email and open the sign-in link in this browser.');
        } catch (cause) {
          setMessage(photoErrorMessage(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="organizer-email">Organizer email</label>
      <input
        id="organizer-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        autoCapitalize="none"
      />
      <button type="submit" className={styles['primaryButton']} disabled={busy}>
        {busy ? 'Sending…' : 'Email a sign-in link'}
      </button>
      {message && <p role="status">{message}</p>}
      <a href="/login?next=%2Fevents%2Fthe-link-up%2Fadmin">Sign in with an existing DWD account</a>
      <a href="/signup?next=%2Fevents%2Fthe-link-up%2Fadmin">Create and verify a DWD account</a>
    </form>
  );
}
