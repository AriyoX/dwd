'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize remote gallery pages and renewed image URLs. */
/* eslint-disable @next/next/no-img-element -- R2 images already have bounded derivatives and expiring URLs. */
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Flag, RefreshCw } from 'lucide-react';
import type { GalleryPage, GalleryPhoto } from './photo-contracts';
import { downloadPhoto, photoErrorMessage, photoRequest } from './photo-client';
import { PhotoDialog } from './photo-dialog';
import styles from './photo-sharing.module.css';

function GalleryImage({
  photo,
  full = false,
  admin,
  onUnavailable,
}: {
  photo: GalleryPhoto;
  full?: boolean;
  admin: boolean;
  onUnavailable: (id: string) => void;
}) {
  const [source, setSource] = useState({
    url: full ? photo.imageUrl : photo.thumbnailUrl,
    expiresAt: photo.expiresAt,
  });
  useEffect(() => {
    setSource({ url: full ? photo.imageUrl : photo.thumbnailUrl, expiresAt: photo.expiresAt });
  }, [photo, full]);
  const renew = useCallback(async () => {
    try {
      const next = await photoRequest<GalleryPhoto>(
        `${admin ? 'admin/' : ''}photos/${photo.id}/view`,
      );
      setSource({ url: full ? next.imageUrl : next.thumbnailUrl, expiresAt: next.expiresAt });
    } catch {
      onUnavailable(photo.id);
    }
  }, [photo.id, full, admin, onUnavailable]);
  useEffect(() => {
    if (!full) return;
    const timer = window.setInterval(() => {
      void renew();
    }, 90_000);
    void renew();
    return () => window.clearInterval(timer);
  }, [full, renew]);
  return (
    <img
      src={source.url}
      alt={full ? 'A shared memory from The Link Up' : ''}
      loading={full ? 'eager' : 'lazy'}
      decoding="async"
      width={photo.width}
      height={photo.height}
      onError={() => {
        if (source.expiresAt <= Date.now() + 10_000) void renew();
        else onUnavailable(photo.id);
      }}
    />
  );
}

export function PhotoGallery({
  revision = 0,
  admin = false,
  onModerate,
  focusPhoto,
}: {
  revision?: number;
  admin?: boolean;
  focusPhoto?: GalleryPhoto | null;
  onModerate?: (photo: GalleryPhoto, action: 'hide' | 'show' | 'delete') => Promise<void>;
}) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const prefix = admin ? 'admin/' : '';
  const unavailable = useCallback((id: string) => {
    setPhotos((items) => items.filter((item) => item.id !== id));
    setSelected((value) => (value === id ? null : value));
  }, []);
  const load = useCallback(
    async (position: string | null = null) => {
      setLoading(true);
      setError('');
      try {
        const page = await photoRequest<GalleryPage>(
          `${prefix}gallery${position ? `?cursor=${encodeURIComponent(position)}` : ''}`,
        );
        setEnabled(page.galleryEnabled);
        setPhotos((items) =>
          position
            ? [
                ...items,
                ...page.photos.filter((photo) => !items.some((item) => item.id === photo.id)),
              ]
            : page.photos,
        );
        setCursor(page.nextCursor);
        if (!admin && !page.galleryEnabled) setSelected(null);
      } catch (cause) {
        setError(photoErrorMessage(cause));
      } finally {
        setLoading(false);
      }
    },
    [prefix, admin],
  );
  useEffect(() => {
    void load();
  }, [load, revision]);
  useEffect(() => {
    if (!focusPhoto || !admin) return;
    setPhotos((items) => [focusPhoto, ...items.filter((item) => item.id !== focusPhoto.id)]);
    setSelected(focusPhoto.id);
    setReporting(false);
    setNotice('');
  }, [focusPhoto, admin]);
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [load]);
  const index = photos.findIndex((photo) => photo.id === selected);
  const active = photos[index];
  const navigate = useCallback(
    (offset: number) => {
      const next = photos[index + offset];
      if (next) {
        setSelected(next.id);
        setReporting(false);
        setNotice('');
      }
    },
    [photos, index],
  );
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)
        return;
      if (event.key === 'ArrowLeft') navigate(-1);
      if (event.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [active, navigate]);
  async function action(work: () => Promise<void>) {
    setActionBusy(true);
    setNotice('');
    try {
      await work();
    } catch (cause) {
      setNotice(photoErrorMessage(cause));
    } finally {
      setActionBusy(false);
    }
  }
  async function report(reason: string) {
    if (!active) return;
    await photoRequest(`photos/${active.id}/report`, { method: 'POST', body: { reason } });
    setReporting(false);
    setNotice('Report sent to the organizers.');
  }
  return (
    <section
      id="shared-gallery"
      className={styles['gallery']}
      aria-labelledby={admin ? 'admin-gallery-title' : 'gallery-title'}
    >
      <div className={styles['sectionHeader']}>
        <h2 id={admin ? 'admin-gallery-title' : 'gallery-title'}>
          {admin ? 'All photos' : 'The shared album'}
        </h2>
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={loading}
          onClick={() => {
            void load();
          }}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className={styles['error']}>
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              void load();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {!enabled && !admin && (
        <p role="status">The organizers have temporarily closed the gallery.</p>
      )}
      {enabled && !loading && !error && photos.length === 0 && (
        <p className={styles['empty']}>The first memory is yours to share.</p>
      )}
      {loading && photos.length === 0 && <p role="status">Loading memories…</p>}
      <div className={styles['photoGrid']}>
        {photos.map((photo, photoIndex) => (
          <button
            type="button"
            key={photo.id}
            className={styles['photoTile']}
            aria-label={`Open photo ${photoIndex + 1}${admin ? `, ${photo.status ?? ''}` : ''}`}
            onClick={() => {
              setSelected(photo.id);
              setReporting(false);
              setNotice('');
            }}
          >
            <GalleryImage photo={photo} admin={admin} onUnavailable={unavailable} />
            {admin && photo.status !== 'published' && (
              <span className={styles['photoStatus']}>{photo.status}</span>
            )}
          </button>
        ))}
      </div>
      {cursor && (
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={loading}
          onClick={() => {
            void load(cursor);
          }}
        >
          {loading ? 'Loading…' : 'Load more photos'}
        </button>
      )}
      <PhotoDialog open={!!active} title="The Link Up" viewer onClose={() => setSelected(null)}>
        {active && (
          <>
            <div className={styles['viewerImage']}>
              <GalleryImage
                key={active.id}
                photo={active}
                full
                admin={admin}
                onUnavailable={unavailable}
              />
            </div>
            <div className={styles['viewerControls']}>
              <button
                type="button"
                className={styles['iconButton']}
                aria-label="Previous photo"
                disabled={index <= 0}
                onClick={() => navigate(-1)}
              >
                <ChevronLeft />
              </button>
              <span>
                {index + 1} / {photos.length}
              </span>
              <button
                type="button"
                className={styles['iconButton']}
                aria-label="Next photo"
                disabled={index >= photos.length - 1}
                onClick={() => navigate(1)}
              >
                <ChevronRight />
              </button>
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={actionBusy}
                onClick={() => {
                  void action(() => downloadPhoto(active.id, admin));
                }}
              >
                <Download size={18} /> Download
              </button>
              {!admin && (
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  onClick={() => setReporting((value) => !value)}
                >
                  <Flag size={16} /> Report Photo
                </button>
              )}
            </div>
            {reporting && (
              <form
                className={styles['reportForm']}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const reason = form.get('reason');
                  if (typeof reason === 'string') void action(() => report(reason));
                }}
              >
                <label htmlFor="photo-report-reason">Why report this photo?</label>
                <select id="photo-report-reason" name="reason">
                  <option value="privacy">Request removal / privacy</option>
                  <option value="inappropriate">Inappropriate content</option>
                  <option value="other">Other concern</option>
                </select>
                <button type="submit" className={styles['primaryButton']} disabled={actionBusy}>
                  Send report
                </button>
              </form>
            )}
            {admin && onModerate && (
              <div className={styles['viewerControls']}>
                {active.status !== 'deleting' && (
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={actionBusy}
                    onClick={() => {
                      void action(async () => {
                        await onModerate(active, active.status === 'hidden' ? 'show' : 'hide');
                        setSelected(null);
                      });
                    }}
                  >
                    {active.status === 'hidden' ? 'Show photo' : 'Hide photo'}
                  </button>
                )}
                <button
                  type="button"
                  className={styles['dangerButton']}
                  disabled={actionBusy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Permanently delete this photo and its thumbnail? This cannot be undone.',
                      )
                    )
                      void action(async () => {
                        await onModerate(active, 'delete');
                        setSelected(null);
                      });
                  }}
                >
                  Delete permanently
                </button>
              </div>
            )}
            {notice && (
              <p role="status" className={styles['viewerNotice']}>
                {notice}
              </p>
            )}
            <p className={styles['viewerNotice']}>Downloads are optimized event photos.</p>
          </>
        )}
      </PhotoDialog>
    </section>
  );
}
