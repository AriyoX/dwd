'use client';

import { Camera, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { deleteNightPhotoAction, getNightPhotosAction, registerNightPhotoAction } from './actions';
import { prepareImage, type PreparedImage } from './image-upload';
import { PhotoCollection, type VisiblePhoto } from './photo-collection';
import { MAX_PHOTOS_PER_PERSON_PER_NIGHT } from '@dwd/core';

interface UploadTask {
  id: string;
  file: File;
  state: 'queued' | 'preparing' | 'uploading' | 'saving' | 'failed';
  error?: string;
  objectPath?: string;
  uploaded?: PreparedImage;
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
  const uploadInFlight = useRef(false);
  const ownPhotos = photos.filter((photo) => photo.uploadedByUserId === currentUserId);
  const remaining = Math.max(
    0,
    MAX_PHOTOS_PER_PERSON_PER_NIGHT -
      ownPhotos.length -
      tasks.filter((task) => !ownPhotos.some((photo) => photo.id === task.id)).length,
  );

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
      const prepared = task.uploaded ?? (await prepareImage(task.file));
      const objectPath = `${nightId}/${currentUserId}/${task.id}${prepared.extension}`;
      const client = createBrowserSupabaseClient();
      if (!task.uploaded) {
        setTasks((items) =>
          items.map((item) =>
            item.id === task.id ? { ...item, state: 'uploading', objectPath } : item,
          ),
        );
        const { error: uploadError } = await client.storage
          .from('night-memories')
          .upload(objectPath, prepared.blob, { contentType: prepared.mimeType, upsert: false });
        if (uploadError && !uploadError.message.toLowerCase().includes('already exists'))
          throw uploadError;
      }
      // A metadata-save retry must not insert the same Storage object again:
      // the upload quota is already full when both files reached Storage.
      setTasks((items) =>
        items.map((item) =>
          item.id === task.id ? { ...item, state: 'saving', uploaded: prepared } : item,
        ),
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
      if (!result.ok) {
        if (result.permanent) {
          const { error: cleanupError } = await client.storage
            .from('night-memories')
            .remove([objectPath]);
          if (cleanupError)
            throw new Error(`${result.error} Remove this upload before trying another photo.`);
          setTasks((items) =>
            items.map((item) => {
              if (item.id !== task.id) return item;
              const cleaned = { ...item };
              delete cleaned.uploaded;
              delete cleaned.objectPath;
              return cleaned;
            }),
          );
        }
        throw new Error(result.error);
      }
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
    if (!files || uploadInFlight.current || loading) return;
    if (files.length > remaining) {
      setError(
        `You can save up to 2 photos per night. You have ${remaining} ${remaining === 1 ? 'slot' : 'slots'} left.`,
      );
      if (input.current) input.current.value = '';
      return;
    }
    uploadInFlight.current = true;
    const next = [...files].map((file) => ({
      id: crypto.randomUUID(),
      file,
      state: 'queued' as const,
    }));
    setTasks((current) => [...current, ...next]);
    try {
      for (const task of next) await upload(task);
    } finally {
      uploadInFlight.current = false;
      if (input.current) input.current.value = '';
    }
  }

  async function discard(task: UploadTask) {
    if (uploadInFlight.current) return;
    uploadInFlight.current = true;
    try {
      const client = createBrowserSupabaseClient();
      const { data, error: lookupError } = await client
        .from('night_photos')
        .select('id')
        .eq('id', task.id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (data) {
        const result = await deleteNightPhotoAction(task.id);
        if (!result.ok) throw new Error(result.error);
      } else if (task.objectPath) {
        const { error: removalError } = await client.storage
          .from('night-memories')
          .remove([task.objectPath]);
        if (removalError) throw removalError;
      }
      setTasks((items) => items.filter((item) => item.id !== task.id));
      await refresh();
    } catch {
      setError('The upload could not be removed. Retry when connected.');
    } finally {
      uploadInFlight.current = false;
    }
  }

  async function retry(task: UploadTask) {
    if (uploadInFlight.current) return;
    uploadInFlight.current = true;
    try {
      await upload(task);
    } finally {
      uploadInFlight.current = false;
    }
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
    <section
      className={`stack-lg memories${photos.length > 0 ? ' memories-filled' : ''}`}
      aria-labelledby="memories-title"
    >
      <div className="row-between memories-header">
        <div>
          <h2 id="memories-title" className="section-title">
            <Camera size={20} aria-hidden="true" /> Photos &amp; memories{' '}
            {photos.length > 0 && <span className="pill">{photos.length}</span>}
          </h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || remaining === 0 || tasks.some((task) => task.state !== 'failed')}
          onClick={() => input.current?.click()}
        >
          <Plus size={18} aria-hidden="true" /> Add photos
        </Button>
        <input
          ref={input}
          className="visually-hidden"
          type="file"
          aria-label="Add photos from your night"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={(event) => void choose(event.target.files)}
        />
      </div>
      <p className="muted small">
        Up to 2 photos per person per night · 5 MB each · {ownPhotos.length}/2 saved
      </p>
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
                <div className="row">
                  <Button type="button" variant="secondary" onClick={() => void retry(task)}>
                    <RefreshCw size={17} aria-hidden="true" /> Retry
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void discard(task)}>
                    Remove upload
                  </Button>
                </div>
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
        <p className="muted memory-loading" role="status">
          Loading photos…
        </p>
      ) : photos.length === 0 ? (
        <div className="memory-empty">
          <Camera size={28} aria-hidden="true" />
          <div>
            <strong>No photos yet</strong>
            <p className="muted small">
              Add a few favourites. Everyone from the night can see them.
            </p>
          </div>
        </div>
      ) : (
        <PhotoCollection
          photos={photos}
          currentUserId={currentUserId}
          deleting={deleting}
          onView={setViewingId}
          onDelete={(photo) => void remove(photo)}
        />
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
