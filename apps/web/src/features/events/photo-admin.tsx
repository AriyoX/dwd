'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Flag, HardDrive, Info, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import type { AdminSummary, CleanupResult, GalleryPhoto } from './photo-contracts';
import { PhotoApiError, photoErrorMessage, photoRequest } from './photo-client';
import { PhotoGallery } from './photo-gallery';
import styles from './photo-sharing.module.css';

function Help({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={styles['help']}>
      <summary>
        <Info size={15} aria-hidden="true" /> {title}
      </summary>
      <div>{children}</div>
    </details>
  );
}
function bytes(value: number) {
  if (!value) return '0 MB';
  const gb = value / 1024 ** 3;
  if (gb >= 1) return gb.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' GB';
  const mb = value / 1024 ** 2;
  return (mb < 0.1 ? '< 0.1' : mb.toFixed(1)) + ' MB';
}
function uploadIssue(code: string | null) {
  if (code === 'expired') return 'Upload expired';
  if (code === 'cancelled') return 'Selection cleared';
  if (code === 'invalid_image') return 'Photo couldn’t be read';
  if (code === 'verification_interrupted') return 'Photo check interrupted';
  return 'Upload interrupted';
}
const reportReasons: Record<string, string> = {
  privacy: 'Removal request',
  inappropriate: 'Inappropriate photo',
  other: 'Other concern',
};

export function PhotoAdmin() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [focusPhoto, setFocusPhoto] = useState<GalleryPhoto | null>(null);
  const working = useRef(false);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    try {
      const next = await photoRequest<AdminSummary>('admin/summary');
      if (request === version.current) {
        setSummary(next);
        setUpdatedAt(new Date());
      }
    } catch (cause) {
      if (
        request === version.current &&
        cause instanceof PhotoApiError &&
        [401, 403].includes(cause.status)
      ) {
        setSummary(null);
        setFocusPhoto(null);
      }
      throw cause;
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void refresh()
      .catch((cause: unknown) => {
        if (mounted) setError(photoErrorMessage(cause));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate requests; this counter is not a DOM ref.
      version.current++;
    };
  }, [refresh]);
  async function action(work: () => Promise<unknown>, message: string, refreshGallery = true) {
    if (working.current) throw new Error('Another change is still saving. Please try again.');
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      // An accepted mutation must not be reported as failed if only the refresh fails.
      setNotice(message);
      if (refreshGallery) setRevision((value) => value + 1);
      try {
        await refresh();
      } catch (cause) {
        setError('Saved, but the latest status couldn’t load. ' + photoErrorMessage(cause));
      }
    } catch (cause) {
      setError(photoErrorMessage(cause));
      throw cause;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function moderate(photo: Pick<GalleryPhoto, 'id'>, kind: 'hide' | 'show' | 'delete') {
    await action(
      () => photoRequest('admin/photos/' + photo.id + '/' + kind, { method: 'POST' }),
      kind === 'delete'
        ? 'Photo removed from the album. Its storage space is freed when file removal finishes.'
        : kind === 'hide'
          ? 'Photo hidden from guests.'
          : 'Photo is visible to guests.',
    );
  }
  function toggle(key: 'uploads_enabled' | 'gallery_enabled', value: boolean) {
    if (
      key === 'gallery_enabled' &&
      !value &&
      !window.confirm(
        'Close the public gallery? Guests won’t be able to browse or download photos. Existing photo links may work for up to two minutes.',
      )
    )
      return;
    void action(
      () => photoRequest('admin/settings', { method: 'PATCH', body: { [key]: value } }),
      key === 'uploads_enabled'
        ? value
          ? 'Photo uploads are open.'
          : 'New uploads are paused. Photos already sent may finish.'
        : value
          ? 'The public gallery is open.'
          : 'The public gallery is closed.',
      false,
    ).catch(() => undefined);
  }
  async function refreshAll() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await refresh();
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(photoErrorMessage(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function cleanup() {
    let result: CleanupResult | undefined;
    await action(async () => {
      result = await photoRequest<CleanupResult>('admin/cleanup', { method: 'POST' });
    }, 'Cleanup finished.');
    if (result)
      setNotice(
        'Released ' +
          String(result.expired) +
          ' expired upload' +
          (result.expired === 1 ? '' : 's') +
          ' and removed ' +
          String(result.removed) +
          ' stored file' +
          (result.removed === 1 ? '' : 's') +
          '.',
      );
  }
  const used = summary?.event.used_bytes ?? 0;
  const reserved = summary?.event.reserved_bytes ?? 0;
  const budget = summary?.event.storage_budget_bytes ?? 1;
  const percent = Math.min(100, ((used + reserved) / budget) * 100);
  return (
    <>
      <div className={styles['dashboardToolbar']}>
        <nav aria-label="Dashboard sections">
          <a href="#overview">Overview</a>
          <a href="#photos">Photos</a>
          <a href="#reports">
            Reports
            {summary?.counts['reports'] ? ' (' + String(summary.counts['reports']) + ')' : ''}
          </a>
          <a href="#activity">Activity</a>
        </nav>
        <div className={styles['refreshStatus']}>
          {updatedAt && (
            <span>
              Updated{' '}
              {updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={busy || loading}
            onClick={() => void refreshAll()}
          >
            <RefreshCw size={16} aria-hidden="true" /> {busy ? 'Working…' : 'Refresh dashboard'}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className={styles['errorBanner']}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles['successBanner']}>
          <CheckCircle2 size={18} aria-hidden="true" />
          {notice}
        </p>
      )}
      {loading && (
        <p role="status" className={styles['empty']}>
          Loading dashboard…
        </p>
      )}
      {!summary && !loading && (
        <button
          type="button"
          className={styles['primaryButton']}
          disabled={busy}
          onClick={() => void refreshAll()}
        >
          Try again
        </button>
      )}
      {summary && (
        <>
          <section id="overview" aria-label="Album overview" className={styles['stats']}>
            {[
              {
                key: 'published',
                title: 'Visible photos',
                help: 'Photos guests can see',
                text: 'Published photos appear in the public album while the gallery is open. If you close the gallery, these photos stay saved and reappear when you reopen it.',
              },
              {
                key: 'hidden',
                title: 'Hidden photos',
                help: 'Photos only organizers can see',
                text: 'Hidden photos stay saved and still use storage. Choose Show to return one to the public album, or Delete to remove it permanently. Previously issued photo links can work for up to two minutes after hiding.',
              },
              {
                key: 'guests',
                title: 'Contributors',
                help: 'How contributors are counted',
                text: 'Browsers that have successfully shared at least one photo. This is an estimate, not a count of people: one person using two browsers can count twice. It does not track event attendance.',
              },
              {
                key: 'pending',
                title: 'Uploads in progress',
                help: 'What is still uploading?',
                text: 'Photos with an upload slot that are waiting to be sent or checked. They are not in the album yet. Unfinished slots expire after about one hour and release their reserved space; an active photo check may finish first.',
              },
            ].map((stat) => (
              <div key={stat.key} className={styles['stat']}>
                <span>{stat.title}</span>
                <strong>{summary.counts[stat.key] ?? 0}</strong>
                <Help title={stat.help}>
                  <p>{stat.text}</p>
                </Help>
              </div>
            ))}
          </section>
          <div className={styles['dashboardColumns']}>
            <section className={styles['dashboardCard']} aria-labelledby="storage-heading">
              <div className={styles['cardHeading']}>
                <HardDrive size={19} aria-hidden="true" />
                <h2 id="storage-heading">Storage</h2>
              </div>
              <div className={styles['storageTotal']}>
                <strong>{bytes(used)}</strong>
                <span>of {bytes(budget)} saved</span>
              </div>
              <progress
                aria-label="Album storage including uploads in progress"
                max={budget}
                value={Math.min(budget, used + reserved)}
              />
              <dl className={styles['storageBreakdown']}>
                <div>
                  <dt>Saved photos</dt>
                  <dd>{bytes(used)}</dd>
                </div>
                <div>
                  <dt>Held for uploads</dt>
                  <dd>{bytes(reserved)}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{bytes(Math.max(0, budget - used - reserved))}</dd>
                </div>
              </dl>
              {percent >= 90 && (
                <p className={styles['warning']}>
                  Storage is nearly full. Delete unneeded photos to make room.
                </p>
              )}
              <Help title="Used, reserved and budget explained">
                <dl className={styles['helpDefinitions']}>
                  <div>
                    <dt>Used (saved photos)</dt>
                    <dd>
                      Space used by shared photos and their small preview images, including hidden
                      photos. Space for a deleted photo is released after its files are removed.
                    </dd>
                  </div>
                  <div>
                    <dt>Reserved (held for uploads)</dt>
                    <dd>
                      Space temporarily set aside for photos in progress, not confirmed files. Each
                      slot holds up to 2.125 MB, so other uploads cannot fill the album first. When
                      a photo finishes, its actual size replaces the hold. Clearing a selection or
                      letting its slot expire releases the hold.
                    </dd>
                  </div>
                  <div>
                    <dt>Budget (album limit)</dt>
                    <dd>
                      The maximum space allocated to this event: {bytes(budget)}. Saved photos plus
                      upload holds must fit within this limit. This is a storage allowance, not a
                      bill or a money balance.
                    </dd>
                  </div>
                </dl>
                <p>
                  These are the album’s tracked sizes, not a live reading of all temporary files in
                  storage. The bar includes saved photos and upload holds.
                </p>
              </Help>
            </section>
            <section className={styles['dashboardCard']} aria-labelledby="sharing-heading">
              <div className={styles['cardHeading']}>
                <Settings2 size={19} aria-hidden="true" />
                <h2 id="sharing-heading">Guest access</h2>
              </div>
              <div className={styles['settingRow']}>
                <div>
                  <h3>Photo uploads</h3>
                  <span
                    className={
                      summary.event.uploads_enabled ? styles['badge'] : styles['badgeMuted']
                    }
                  >
                    {summary.event.uploads_enabled ? 'Open' : 'Paused'}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  disabled={busy}
                  onClick={() => toggle('uploads_enabled', !summary.event.uploads_enabled)}
                >
                  {summary.event.uploads_enabled ? 'Pause uploads' : 'Resume uploads'}
                </button>
              </div>
              <div className={styles['settingRow']}>
                <div>
                  <h3>Public gallery</h3>
                  <span
                    className={
                      summary.event.gallery_enabled ? styles['badge'] : styles['badgeMuted']
                    }
                  >
                    {summary.event.gallery_enabled ? 'Open' : 'Closed'}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  disabled={busy}
                  onClick={() => toggle('gallery_enabled', !summary.event.gallery_enabled)}
                >
                  {summary.event.gallery_enabled ? 'Close gallery' : 'Open gallery'}
                </button>
              </div>
              <Help title="How these controls work">
                <p>
                  <strong>Pause uploads</strong> stops new uploads. Photos already sent can finish
                  being checked. It does not hide saved photos.
                </p>
                <p>
                  <strong>Close gallery</strong> stops guests browsing photos or getting new
                  download links. It does not stop uploads or delete photos. Links already issued
                  may work for up to two minutes.
                </p>
                <p>
                  Guests can share without an account. To protect the album, each browser can share
                  up to {summary.event.session_photo_limit} photos in total, with up to{' '}
                  {summary.event.batch_limit} in one selection. Deleting a photo does not reset that
                  browser’s allowance.
                </p>
                <p>
                  Photos are resized for sharing and camera location information is removed. Only
                  accounts granted access to this event can use this dashboard.
                </p>
              </Help>
            </section>
          </div>
          <PhotoGallery
            admin
            revision={revision}
            onModerate={moderate}
            focusPhoto={focusPhoto}
            disabled={busy}
          />
          <div className={styles['dashboardColumns']}>
            <section
              id="reports"
              className={styles['dashboardCard']}
              aria-labelledby="reports-heading"
            >
              <div className={styles['cardHeading']}>
                <Flag size={19} aria-hidden="true" />
                <h2 id="reports-heading">Photo reports</h2>
                <span className={styles['countBadge']}>
                  {summary.counts['reports'] ?? summary.reports.length}
                </span>
              </div>
              <Help title="Reviewing a report">
                <p>
                  A guest has flagged a photo or asked for it to be removed. View it first, then
                  hide or delete it if needed. Either action closes its reports.
                </p>
                <p>
                  <strong>Mark reviewed</strong> closes only that report and leaves the photo as it
                  is. Reporting alone does not automatically hide a photo.
                </p>
              </Help>
              {!summary.reports.length && (
                <p className={styles['quietState']}>
                  <CheckCircle2 size={20} aria-hidden="true" /> No reports to review.
                </p>
              )}
              {summary.reports.length > 0 && (
                <ul className={styles['reportList']}>
                  {summary.reports.map((report) => (
                    <li key={report.id}>
                      <div className={styles['reportInfo']}>
                        <strong>{reportReasons[report.reason] ?? 'Photo report'}</strong>
                        <time dateTime={report.created_at}>
                          {new Date(report.created_at).toLocaleString()}
                        </time>
                      </div>
                      <div className={styles['buttonGroup']}>
                        <button
                          type="button"
                          className={styles['secondaryButton']}
                          disabled={busy}
                          onClick={() => {
                            if (working.current) return;
                            working.current = true;
                            setBusy(true);
                            setError('');
                            void photoRequest<GalleryPhoto>(
                              'admin/photos/' + report.photo_id + '/view',
                            )
                              .then(setFocusPhoto)
                              .catch((cause: unknown) => setError(photoErrorMessage(cause)))
                              .finally(() => {
                                working.current = false;
                                setBusy(false);
                              });
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className={styles['secondaryButton']}
                          disabled={busy}
                          onClick={() =>
                            void moderate({ id: report.photo_id }, 'hide').catch(() => undefined)
                          }
                        >
                          Hide
                        </button>
                        <button
                          type="button"
                          className={styles['deleteButton']}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Permanently delete this reported photo? It cannot be restored.',
                              )
                            )
                              void moderate({ id: report.photo_id }, 'delete').catch(
                                () => undefined,
                              );
                          }}
                        >
                          <Trash2 size={15} aria-hidden="true" /> Delete
                        </button>
                        <button
                          type="button"
                          className={styles['textButton']}
                          disabled={busy}
                          onClick={() =>
                            void action(
                              () =>
                                photoRequest('admin/reports/' + report.id + '/review', {
                                  method: 'POST',
                                }),
                              'Report reviewed. The photo hasn’t changed.',
                              false,
                            ).catch(() => undefined)
                          }
                        >
                          Mark reviewed
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(summary.counts['reports'] ?? 0) > summary.reports.length && (
                <p className={styles['muted']}>
                  Showing the latest {summary.reports.length} reports. Review these to see more.
                </p>
              )}
            </section>
            <section
              id="activity"
              className={styles['dashboardCard']}
              aria-labelledby="activity-heading"
            >
              <div className={styles['cardHeading']}>
                <RefreshCw size={19} aria-hidden="true" />
                <h2 id="activity-heading">Upload activity</h2>
              </div>
              <p className={styles['activityCount']}>
                {summary.event.upload_error_count} processing failure
                {summary.event.upload_error_count === 1 ? '' : 's'} recorded
              </p>
              <Help title="Failures, retries and cleanup">
                <p>
                  The failure count records failed photo checks over the event’s lifetime. A retry
                  can succeed, so it is not a count of missing photos. Expired or cleared selections
                  appear in recent activity separately.
                </p>
                <p>
                  <strong>Run cleanup</strong> releases expired upload holds, removes temporary
                  files when safe, and retries file removal for deleted photos. Saved photos are
                  kept unless you explicitly delete them. Cleanup also runs during album activity
                  and on a daily schedule.
                </p>
              </Help>
              {!!summary.counts['deleting'] && (
                <p className={styles['warning']}>
                  {summary.counts['deleting']} photo
                  {summary.counts['deleting'] === 1 ? ' is' : 's are'} removed from the album and
                  waiting for file removal.
                </p>
              )}
              <details className={styles['activityDetails']}>
                <summary>Recent upload issues ({summary.errors.length})</summary>
                {!summary.errors.length && (
                  <p className={styles['quietState']}>No recent issues.</p>
                )}
                <ul className={styles['activityList']}>
                  {summary.errors.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{uploadIssue(item.error_code)}</strong>
                        <time dateTime={item.created_at}>
                          {new Date(item.created_at).toLocaleString()}
                        </time>
                      </div>
                      <span className={styles['badgeMuted']}>
                        {item.status === 'completed'
                          ? 'Recovered'
                          : item.status === 'pending' || item.status === 'verifying'
                            ? 'Can retry'
                            : 'Closed'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={busy}
                onClick={() => void cleanup().catch(() => undefined)}
              >
                Run cleanup
              </button>
            </section>
          </div>
        </>
      )}
    </>
  );
}
