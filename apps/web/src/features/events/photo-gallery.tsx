'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize remote gallery pages and renewed image URLs. */
/* eslint-disable @next/next/no-img-element -- R2 images already have bounded derivatives and expiring URLs. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  GalleryHorizontal,
  Grid2X2,
  Images,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { GalleryPage, GalleryPhoto } from './photo-contracts';
import { downloadPhoto, photoErrorMessage, photoRequest, PhotoApiError } from './photo-client';
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
  const [failed, setFailed] = useState(false);
  const renewing = useRef(false);
  useEffect(() => {
    setSource({ url: full ? photo.imageUrl : photo.thumbnailUrl, expiresAt: photo.expiresAt });
    setFailed(false);
  }, [photo, full]);
  const renew = useCallback(async () => {
    if (renewing.current) return;
    renewing.current = true;
    try {
      const next = await photoRequest<GalleryPhoto>(
        (admin ? 'admin/' : '') + 'photos/' + photo.id + '/view',
      );
      setSource({ url: full ? next.imageUrl : next.thumbnailUrl, expiresAt: next.expiresAt });
      setFailed(false);
    } catch (cause) {
      if (cause instanceof PhotoApiError && [401, 403, 404].includes(cause.status))
        onUnavailable(photo.id);
      else setFailed(true);
    } finally {
      renewing.current = false;
    }
  }, [photo.id, full, admin, onUnavailable]);
  useEffect(() => {
    if (!full) return;
    const resume = () => {
      if (document.visibilityState === 'visible') void renew();
    };
    const timer = window.setInterval(resume, 90_000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    void renew();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [full, renew]);
  if (failed)
    return (
      <span className={styles['imageUnavailable']}>
        <Images size={24} aria-hidden="true" />
        <span>Photo couldn’t load</span>
        {full && (
          <button type="button" className={styles['secondaryButton']} onClick={() => void renew()}>
            Try again
          </button>
        )}
      </span>
    );
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
        else setFailed(true);
      }}
    />
  );
}

type PhotoAction = 'hide' | 'show' | 'delete';
type Filter = 'all' | 'published' | 'hidden';
export function PhotoGallery({
  revision = 0,
  admin = false,
  onModerate,
  focusPhoto,
  disabled = false,
  onAddPhotos,
}: {
  revision?: number;
  admin?: boolean;
  focusPhoto?: GalleryPhoto | null;
  disabled?: boolean;
  onModerate?: (photo: GalleryPhoto, action: PhotoAction) => Promise<void>;
  onAddPhotos?: () => void;
}) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  const [layout, setLayout] = useState<'grid' | 'strip'>('grid');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<GalleryPhoto | null>(null);
  const [reporting, setReporting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const requestVersion = useRef(0);
  const acting = useRef(false);
  const galleryRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const lastRequest = useRef<{ position: string | null; page: number; select?: 'first' | 'last' }>({
    position: null,
    page: 0,
  });
  const busy = actionBusy || disabled;
  const prefix = admin ? 'admin/' : '';
  const unavailable = useCallback((id: string) => {
    setPhotos((items) => items.filter((item) => item.id !== id));
    setSelected((value) => (value?.id === id ? null : value));
  }, []);
  const load = useCallback(
    async (position: string | null = null, pageNumber = 0, select?: 'first' | 'last') => {
      lastRequest.current = { position, page: pageNumber, ...(select ? { select } : {}) };
      const version = ++requestVersion.current;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (position) params.set('cursor', position);
        if (admin && filter !== 'all') params.set('status', filter);
        const page = await photoRequest<GalleryPage>(prefix + 'gallery?' + params.toString());
        if (version !== requestVersion.current) return;
        setEnabled(page.galleryEnabled);
        // Keep only one page mounted: older albums must not accumulate hundreds of images.
        setPhotos(page.photos);
        setPageIndex(pageNumber);
        setPageCursors((values) => [...values.slice(0, pageNumber), position]);
        setCursor(page.nextCursor);
        if (select) setSelected((select === 'first' ? page.photos[0] : page.photos.at(-1)) ?? null);
        stripRef.current?.scrollTo({ left: 0, behavior: 'instant' });
        if (!admin && !page.galleryEnabled) setSelected(null);
      } catch (cause) {
        if (version !== requestVersion.current) return;
        setError(photoErrorMessage(cause));
        if (cause instanceof PhotoApiError && [401, 403].includes(cause.status)) {
          setPhotos([]);
          setSelected(null);
          setCursor(null);
        }
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [prefix, admin, filter],
  );
  useEffect(() => {
    setPhotos([]);
    setCursor(null);
    setPageIndex(0);
    setPageCursors([null]);
    void load();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate requests; this counter is not a DOM ref.
      requestVersion.current++;
    };
  }, [load, revision]);
  useEffect(() => {
    if (!focusPhoto || !admin) return;
    // Reported photos may be outside the current page or filter.
    setSelected(focusPhoto);
    setReporting(false);
    setNotice('');
  }, [focusPhoto, admin]);
  useEffect(() => {
    const resume = () => {
      // Preserve the current page and viewer when returning from Camera or a download.
      if (document.visibilityState === 'visible' && !acting.current && !selected && !loading)
        void load(pageCursors[pageIndex] ?? null, pageIndex);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [load, selected, loading, pageCursors, pageIndex]);
  const index = photos.findIndex((photo) => photo.id === selected?.id);
  const active = photos[index] ?? selected;
  const navigate = useCallback(
    (offset: number) => {
      if (busy || loading || index < 0) return;
      const next = photos[index + offset];
      if (next) {
        setSelected(next);
        setReporting(false);
        setNotice('');
      } else if (offset > 0 && cursor) {
        setReporting(false);
        setNotice('');
        void load(cursor, pageIndex + 1, 'first');
      } else if (offset < 0 && pageIndex > 0) {
        setReporting(false);
        setNotice('');
        void load(pageCursors[pageIndex - 1] ?? null, pageIndex - 1, 'last');
      }
    },
    [photos, index, busy, loading, cursor, pageIndex, pageCursors, load],
  );
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [active, navigate]);
  async function action(work: () => Promise<void>) {
    if (acting.current || disabled) return;
    acting.current = true;
    setActionBusy(true);
    setNotice('');
    try {
      await work();
    } catch (cause) {
      setNotice(photoErrorMessage(cause));
    } finally {
      acting.current = false;
      setActionBusy(false);
    }
  }
  function moderate(photo: GalleryPhoto, kind: PhotoAction) {
    if (!onModerate || busy) return;
    if (
      kind === 'delete' &&
      !window.confirm(
        'Permanently delete this photo? It will be removed from the album and cannot be restored.',
      )
    )
      return;
    void action(async () => {
      await onModerate(photo, kind);
      setSelected(null);
      setNotice(
        kind === 'delete'
          ? 'Photo deleted.'
          : kind === 'hide'
            ? 'Photo hidden.'
            : 'Photo is visible.',
      );
    });
  }
  async function report(reason: string) {
    if (!active) return;
    await photoRequest('photos/' + active.id + '/report', { method: 'POST', body: { reason } });
    setReporting(false);
    setNotice('Report sent to the organizers.');
  }
  return (
    <section
      ref={galleryRef}
      id={admin ? 'photos' : 'shared-gallery'}
      className={styles['gallery']}
      aria-labelledby={admin ? 'admin-gallery-title' : 'gallery-title'}
      aria-busy={loading}
    >
      <div className={styles['sectionHeader']}>
        <h2 id={admin ? 'admin-gallery-title' : 'gallery-title'}>
          {admin ? 'Photos' : 'Shared photos'}
        </h2>
        <div className={styles['buttonGroup']}>
          {!admin && onAddPhotos && (
            <button type="button" className={styles['primaryButton']} onClick={onAddPhotos}>
              Add photos
            </button>
          )}
          <button
            type="button"
            className={styles['iconButton']}
            aria-label="Refresh"
            title="Refresh photos"
            disabled={loading || busy}
            onClick={() => void load(pageCursors[pageIndex] ?? null, pageIndex)}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {!admin && (
        <div className={styles['galleryToolbar']}>
          <span className={styles['muted']}>
            {photos.length
              ? `Page ${pageIndex + 1} · ${photos.length} photos`
              : 'Newest photos first'}
          </span>
          <div className={styles['filters']} role="group" aria-label="Album view">
            <button
              type="button"
              aria-pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
            >
              <Grid2X2 size={16} aria-hidden="true" /> Grid
            </button>
            <button
              type="button"
              aria-pressed={layout === 'strip'}
              onClick={() => setLayout('strip')}
            >
              <GalleryHorizontal size={16} aria-hidden="true" /> Swipe
            </button>
          </div>
        </div>
      )}
      {admin && (
        <div className={styles['galleryToolbar']}>
          <div className={styles['filters']} role="group" aria-label="Filter photos">
            {(['all', 'published', 'hidden'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                disabled={busy}
                onClick={() => {
                  setFilter(value);
                  setNotice('');
                }}
              >
                {value === 'all' ? 'All photos' : value === 'published' ? 'Visible' : 'Hidden'}
              </button>
            ))}
          </div>
          <span className={styles['muted']}>
            Hide to remove from public view. Delete to remove permanently.
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className={styles['error']}>
          {error}{' '}
          <button
            type="button"
            className={styles['textButton']}
            disabled={loading}
            onClick={() =>
              void load(
                lastRequest.current.position,
                lastRequest.current.page,
                lastRequest.current.select,
              )
            }
          >
            Try again
          </button>
        </p>
      )}
      {notice && !active && (
        <p role="status" className={styles['inlineNotice']}>
          {notice}
        </p>
      )}
      {!enabled && !admin && (
        <p className={styles['empty']} role="status">
          The gallery is closed for now. Please check back later.
        </p>
      )}
      {(enabled || admin) && !loading && !error && photos.length === 0 && (
        <div className={styles['empty']}>
          <Images size={28} aria-hidden="true" />
          <p>
            {admin
              ? filter === 'hidden'
                ? 'No hidden photos.'
                : filter === 'published'
                  ? 'No visible photos.'
                  : 'No photos yet.'
              : 'No photos yet. Share the first one.'}
          </p>
        </div>
      )}
      {loading && photos.length === 0 && (
        <p role="status" className={styles['empty']}>
          Loading photos…
        </p>
      )}
      <div
        ref={stripRef}
        className={styles[!admin && layout === 'strip' ? 'photoStrip' : 'photoGrid']}
      >
        {photos.map((photo, photoIndex) => (
          <article key={photo.id} className={admin ? styles['photoCard'] : undefined}>
            <button
              type="button"
              className={styles['photoTile']}
              aria-label={
                'Open photo ' +
                String(pageIndex * 24 + photoIndex + 1) +
                (admin ? ', ' + (photo.status === 'hidden' ? 'hidden' : 'visible') : '')
              }
              disabled={busy}
              onClick={() => {
                setSelected(photo);
                setReporting(false);
                setNotice('');
              }}
            >
              <GalleryImage photo={photo} admin={admin} onUnavailable={unavailable} />
            </button>
            {admin && onModerate && (
              <div className={styles['photoCardBody']}>
                <div className={styles['photoCardMeta']}>
                  <span
                    className={photo.status === 'hidden' ? styles['badgeMuted'] : styles['badge']}
                  >
                    {photo.status === 'hidden' ? 'Hidden' : 'Visible'}
                  </span>
                  <time dateTime={photo.publishedAt}>
                    {new Date(photo.publishedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </div>
                <div className={styles['photoCardActions']}>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={busy}
                    aria-label={
                      (photo.status === 'hidden' ? 'Show photo ' : 'Hide photo ') +
                      String(pageIndex * 24 + photoIndex + 1)
                    }
                    onClick={() => moderate(photo, photo.status === 'hidden' ? 'show' : 'hide')}
                  >
                    {photo.status === 'hidden' ? 'Show' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    className={styles['deleteButton']}
                    disabled={busy}
                    aria-label={'Delete photo ' + String(pageIndex * 24 + photoIndex + 1)}
                    onClick={() => moderate(photo, 'delete')}
                  >
                    <Trash2 size={15} aria-hidden="true" /> Delete
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      {(cursor || pageIndex > 0) && (
        <nav className={styles['pagination']} aria-label="Photo pages">
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={pageIndex === 0 || loading || busy}
            onClick={() => {
              void load(pageCursors[pageIndex - 1] ?? null, pageIndex - 1);
              galleryRef.current?.scrollIntoView({ block: 'start' });
            }}
          >
            <ChevronLeft size={17} aria-hidden="true" /> Previous
          </button>
          <span role="status">{loading ? 'Loading…' : `Page ${pageIndex + 1}`}</span>
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={!cursor || loading || busy}
            onClick={() => {
              void load(cursor, pageIndex + 1);
              galleryRef.current?.scrollIntoView({ block: 'start' });
            }}
          >
            Next <ChevronRight size={17} aria-hidden="true" />
          </button>
          {pageIndex > 0 && (
            <button
              type="button"
              className={styles['textButton']}
              disabled={loading || busy}
              onClick={() => {
                void load();
                galleryRef.current?.scrollIntoView({ block: 'start' });
              }}
            >
              Back to latest
            </button>
          )}
        </nav>
      )}
      <PhotoDialog
        open={!!active}
        title="The Link Up"
        viewer
        busy={busy}
        onClose={() => {
          if (loading) {
            requestVersion.current++;
            setLoading(false);
          }
          setSelected(null);
        }}
      >
        {active && (
          <>
            <div
              className={styles['viewerImage']}
              onTouchStart={(event) => {
                const point = event.touches[0];
                touch.current =
                  event.touches.length === 1 && point
                    ? { x: point.clientX, y: point.clientY }
                    : null;
              }}
              onTouchCancel={() => {
                touch.current = null;
              }}
              onTouchEnd={(event) => {
                const start = touch.current;
                touch.current = null;
                const end = event.changedTouches[0];
                if (!start || !end || event.touches.length) return;
                const dx = end.clientX - start.x;
                const dy = end.clientY - start.y;
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
                  navigate(dx < 0 ? 1 : -1);
              }}
            >
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
                disabled={index < 0 || (index === 0 && pageIndex === 0) || busy || loading}
                onClick={() => navigate(-1)}
              >
                <ChevronLeft />
              </button>
              <span aria-live="polite">
                {loading
                  ? 'Loading…'
                  : index >= 0
                    ? `Photo ${pageIndex * 24 + index + 1}`
                    : 'Reported photo'}
              </span>
              <button
                type="button"
                className={styles['iconButton']}
                aria-label="Next photo"
                disabled={index < 0 || (index >= photos.length - 1 && !cursor) || busy || loading}
                onClick={() => navigate(1)}
              >
                <ChevronRight />
              </button>
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={busy}
                onClick={() => void action(() => downloadPhoto(active.id, admin))}
              >
                <Download size={17} aria-hidden="true" /> Download
              </button>
              {!admin && (
                <button
                  type="button"
                  className={styles['textButton']}
                  disabled={busy}
                  onClick={() => setReporting((value) => !value)}
                >
                  <Flag size={16} aria-hidden="true" /> Report photo
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className={styles['viewerNotice']}>
                {error}{' '}
                <button
                  type="button"
                  className={styles['textButton']}
                  disabled={loading}
                  onClick={() =>
                    void load(
                      lastRequest.current.position,
                      lastRequest.current.page,
                      lastRequest.current.select,
                    )
                  }
                >
                  Try again
                </button>
              </p>
            )}
            {reporting && (
              <form
                className={styles['reportForm']}
                onSubmit={(event) => {
                  event.preventDefault();
                  const reason = new FormData(event.currentTarget).get('reason');
                  if (typeof reason === 'string') void action(() => report(reason));
                }}
              >
                <label htmlFor="photo-report-reason">Why are you reporting this photo?</label>
                <select
                  id="photo-report-reason"
                  name="reason"
                  defaultValue="privacy"
                  disabled={busy}
                >
                  <option value="privacy">I’d like this photo removed</option>
                  <option value="inappropriate">Inappropriate content</option>
                  <option value="other">Something else</option>
                </select>
                <button type="submit" className={styles['primaryButton']} disabled={busy}>
                  Send report
                </button>
              </form>
            )}
            {admin && onModerate && (
              <div className={styles['viewerControls']}>
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  disabled={busy}
                  onClick={() => moderate(active, active.status === 'hidden' ? 'show' : 'hide')}
                >
                  {active.status === 'hidden' ? 'Show photo' : 'Hide photo'}
                </button>
                <button
                  type="button"
                  className={styles['dangerButton']}
                  disabled={busy}
                  onClick={() => moderate(active, 'delete')}
                >
                  <Trash2 size={16} aria-hidden="true" /> Delete photo
                </button>
              </div>
            )}
            {notice && (
              <p role="status" className={styles['viewerNotice']}>
                {notice}
              </p>
            )}
          </>
        )}
      </PhotoDialog>
    </section>
  );
}
