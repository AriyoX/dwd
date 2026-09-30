'use client';

import { Camera, Plus, Users, Wine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PhotoCollection, type VisiblePhoto } from '@/features/photos/photo-collection';

// Practice controls deliberately use local state, never live bottles or photo uploads.
export function TourBottles() {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [pours, setPours] = useState(0);
  return (
    <>
      <button
        type="button"
        className="bottle-launcher"
        data-tour="shared-bottles"
        onClick={() => setOpen(true)}
      >
        <span className="bottle-launcher-icon">
          <Wine size={24} aria-hidden="true" />
        </span>
        <span>
          <strong>Shared bottles</strong>
          <span className="small">1 on the table</span>
        </span>
        <Plus size={21} aria-hidden="true" />
      </button>
      <Dialog open={open} title="Shared bottles" onClose={() => setOpen(false)}>
        <article className="bottle-card stack">
          <div className="bottle-card-heading">
            <span className="settings-feature-icon">
              <Wine size={35} aria-hidden="true" />
            </span>
            <div>
              <span className="bottle-access">
                <Users size={14} aria-hidden="true" /> Everyone can join
              </span>
              <h3>Friday rosé</h3>
              <p className="muted small">125 ml per glass · 12%</p>
            </div>
          </div>
          <div className="bottle-remaining" role="status">
            <strong>{750 - pours * 125} ml left</strong>
            <span className="muted small">
              {pours} {pours === 1 ? 'glass' : 'glasses'} added
            </span>
          </div>
          <progress
            className="tour-bottle-level"
            value={750 - pours * 125}
            max={750}
            aria-label="Wine left in the practice bottle"
          />
          <p className="small muted">
            {joined
              ? 'Your practice plan: 2 glasses. Each glass you add comes off the shared bottle.'
              : 'Join to keep your own count. Everyone’s pours come from the same bottle.'}
          </p>
          <Button
            type="button"
            disabled={pours >= 6}
            onClick={() => (joined ? setPours((count) => count + 1) : setJoined(true))}
          >
            {!joined ? 'Join bottle' : pours >= 6 ? 'Bottle empty' : 'Log glass'}
          </Button>
          {pours > 0 && (
            <Button type="button" variant="ghost" onClick={() => setPours((count) => count - 1)}>
              Undo last glass
            </Button>
          )}
        </article>
      </Dialog>
    </>
  );
}

export function TourPhotos() {
  const [photos, setPhotos] = useState<VisiblePhoto[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const photo = photos.find((item) => item.id === viewing);
  useEffect(() => {
    const created = urls.current;
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  return (
    <section className={`memories stack-lg${photos.length ? ' memories-filled' : ''}`}>
      <div className="row-between memories-header" data-tour="night-photos">
        <h2 className="section-title">
          <Camera size={20} aria-hidden="true" /> Photos &amp; memories
        </h2>
        <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
          <Plus size={18} aria-hidden="true" /> Add photos
        </Button>
        <input
          ref={input}
          type="file"
          className="visually-hidden"
          aria-label="Try adding a photo"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            setError(null);
            const chosen = [...(event.target.files ?? [])].slice(0, 12);
            const valid = chosen.filter(
              (file) =>
                ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
                file.size <= 10 * 1024 * 1024,
            );
            if (valid.length !== chosen.length)
              setError('Try a JPG, PNG or WebP photo under 10 MB.');
            const next = valid.map((file): VisiblePhoto => {
              const url = URL.createObjectURL(file);
              urls.current.add(url);
              return {
                id: crypto.randomUUID(),
                nightId: 'tour',
                uploadedByUserId: 'tour-you',
                uploaderName: 'You',
                objectPath: '',
                mimeType: file.type as VisiblePhoto['mimeType'],
                byteSize: file.size,
                width: null,
                height: null,
                createdAt: new Date().toISOString(),
                url,
              };
            });
            setPhotos((current) => [...current, ...next]);
            event.target.value = '';
          }}
        />
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {photos.length ? (
        <PhotoCollection
          photos={photos}
          currentUserId="tour-you"
          onView={setViewing}
          onDelete={(item) => {
            URL.revokeObjectURL(item.url);
            urls.current.delete(item.url);
            setPhotos((current) => current.filter((entry) => entry.id !== item.id));
          }}
        />
      ) : (
        <div className="memory-empty">
          <Camera size={28} aria-hidden="true" />
          <div>
            <strong>No photos yet</strong>
            <p className="muted small">
              Try a favourite photo. Nothing is uploaded during the tour.
            </p>
          </div>
        </div>
      )}
      <Dialog open={Boolean(photo)} title="Your practice photo" onClose={() => setViewing(null)}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="memory-full" src={photo.url} alt="Your practice photo" />
        )}
      </Dialog>
    </section>
  );
}
