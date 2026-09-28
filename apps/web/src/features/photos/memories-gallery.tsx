'use client';

import { Camera, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NightPhoto } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { deleteNightPhotoAction, getNightPhotosAction, registerNightPhotoAction } from './actions';
import { prepareImage } from './image-upload';

type VisiblePhoto = NightPhoto & { url: string };
interface UploadTask {
  id: string;
  file: File;
  state: 'queued' | 'preparing' | 'uploading' | 'saving' | 'failed';
  error?: string;
}

export function MemoriesGallery({
  nightId,
  currentUserId,
}: {
  nightId: string;
  currentUserId: string;
}) {
  const [photos, setPhotos] = useState<VisiblePhoto[]>([]);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = photos.find((photo) => photo.id === viewingId);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getNightPhotosAction(nightId);
      if (result.ok) {
        setPhotos(result.photos);
        setError(null);
      } else setError(result.error);
    } catch {
      setError('Memories could not load. Retry when connected.');
    } finally {
      setLoading(false);
    }
  }, [nightId]);

  useEffect(() => {
    void refresh();
    const reconcile = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    // Soft-deleted rows no longer pass realtime SELECT policies. Reconcile
    // visible galleries and renew signed URLs, including after backgrounding.
    const timer = window.setInterval(reconcile, 30_000);
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [refresh]);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    const lifecycle = new AbortController();
    const channel = client
      .channel(`night-memories:${nightId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'night_photos', filter: `night_id=eq.${nightId}` },
        () => void refresh(),
      );

    // The SSR client restores its session asynchronously. Authenticate the
    // channel first so private photo changes are evaluated with participant RLS.
    void (async () => {
      const { data } = await client.auth.getSession();
      if (data.session?.access_token) {
        await client.realtime.setAuth(data.session.access_token);
      }
      if (!lifecycle.signal.aborted) channel.subscribe();
    })();

    return () => {
      lifecycle.abort();
      void client.removeChannel(channel);
    };
  }, [nightId, refresh]);

  async function upload(task: UploadTask) {
    setTasks((items) =>
      items.map((item) => {
        if (item.id !== task.id) return item;
        const retry = { ...item };
        delete retry.error;
        return { ...retry, state: 'preparing' };
      }),
    );
    try {
      const prepared = await prepareImage(task.file);
      const objectPath = `${nightId}/${currentUserId}/${task.id}${prepared.extension}`;
      setTasks((items) =>
        items.map((item) => (item.id === task.id ? { ...item, state: 'uploading' } : item)),
      );
      const client = createBrowserSupabaseClient();
      const { error: uploadError } = await client.storage
        .from('night-memories')
        .upload(objectPath, prepared.blob, { contentType: prepared.mimeType, upsert: false });
      if (uploadError && !uploadError.message.toLowerCase().includes('already exists'))
        throw uploadError;
      setTasks((items) =>
        items.map((item) => (item.id === task.id ? { ...item, state: 'saving' } : item)),
      );
      const result = await registerNightPhotoAction({
        id: task.id,
        nightId,
        objectPath,
        mimeType: prepared.mimeType,
        byteSize: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
      });
      if (!result.ok) throw new Error(result.error);
      setTasks((items) => items.filter((item) => item.id !== task.id));
      await refresh();
    } catch (cause) {
      setTasks((items) =>
        items.map((item) =>
          item.id === task.id
            ? {
                ...item,
                state: 'failed',
                error: cause instanceof Error ? cause.message : 'Upload failed. Retry.',
              }
            : item,
        ),
      );
    }
  }

  async function choose(files: FileList | null) {
    if (!files) return;
    const next = [...files].slice(0, 12).map((file) => ({
      id: crypto.randomUUID(),
      file,
      state: 'queued' as const,
    }));
    setTasks((current) => [...current, ...next]);
    for (const task of next) await upload(task);
    if (input.current) input.current.value = '';
  }

  async function remove(photo: VisiblePhoto) {
    setDeleting(photo.id);
    try {
      const result = await deleteNightPhotoAction(photo.id);
      if (!result.ok) setError(result.error);
      else {
        setPhotos((items) => items.filter((item) => item.id !== photo.id));
      }
    } catch {
      setError('Photo could not be deleted. Retry when connected.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="stack-lg memories" aria-labelledby="memories-title">
      <div className="row-between memories-header">
        <div>
          <h2 id="memories-title">Photos &amp; memories</h2>
          <p className="muted small">The night stays closed. Participants can still add photos.</p>
        </div>
        <Button type="button" onClick={() => input.current?.click()}>
          <Upload size={18} aria-hidden="true" /> Add photos
        </Button>
        <input
          ref={input}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={(event) => void choose(event.target.files)}
        />
      </div>
      {tasks.length > 0 ? (
        <div className="stack" aria-live="polite">
          {tasks.map((task) => (
            <div className="upload-task" key={task.id}>
              <div className="row-between">
                <span>{task.file.name}</span>
                <span className="muted small">
                  {
                    {
                      queued: 'Waiting',
                      preparing: 'Preparing',
                      uploading: 'Uploading',
                      saving: 'Saving',
                      failed: 'Failed',
                    }[task.state]
                  }
                </span>
              </div>
              {task.state !== 'failed' ? (
                <progress aria-label={`Upload ${task.file.name}`} />
              ) : null}
              {task.error ? <p className="error-box small">{task.error}</p> : null}
              {task.state === 'failed' ? (
                <Button type="button" variant="secondary" onClick={() => void upload(task)}>
                  <RefreshCw size={17} aria-hidden="true" /> Retry
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="stack">
          <p className="error-box" role="alert">
            {error}
          </p>
          <Button type="button" variant="secondary" onClick={() => void refresh()}>
            Reload photos
          </Button>
        </div>
      ) : null}
      {loading ? (
        <p className="muted">Loading memories…</p>
      ) : photos.length === 0 ? (
        <div className="empty-state">
          <Camera size={28} aria-hidden="true" />
          <strong>No photos yet</strong>
          <span className="muted small">Add the first memory from this night.</span>
        </div>
      ) : (
        <div className="memory-grid">
          {photos.map((photo) => (
            <figure className="memory-photo" key={photo.id}>
              <button
                type="button"
                className="memory-preview"
                aria-label={`View photo by ${photo.uploaderName}`}
                onClick={() => setViewingId(photo.id)}
              >
                {/* Signed, short-lived URLs authorize private Storage reads. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={`Uploaded by ${photo.uploaderName}`} loading="lazy" />
              </button>
              <figcaption>
                <span>{photo.uploaderName}</span>
                <time dateTime={photo.createdAt}>
                  {new Date(photo.createdAt).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
                {photo.uploadedByUserId === currentUserId ? (
                  <button
                    type="button"
                    disabled={deleting !== null}
                    onClick={() => void remove(photo)}
                    aria-label="Delete your photo"
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <Dialog
        open={viewing !== undefined}
        title={viewing ? `Photo by ${viewing.uploaderName}` : 'Photo'}
        onClose={() => setViewingId(null)}
      >
        {viewing ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="memory-full"
            src={viewing.url}
            alt={`Uploaded by ${viewing.uploaderName}`}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
