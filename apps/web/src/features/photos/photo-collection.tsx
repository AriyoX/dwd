import { Trash2 } from 'lucide-react';
import type { NightPhoto } from '@dwd/core';

export type VisiblePhoto = NightPhoto & { url: string };

export function PhotoCollection({
  photos,
  currentUserId,
  deleting = null,
  onView,
  onDelete,
}: {
  photos: VisiblePhoto[];
  currentUserId: string;
  deleting?: string | null;
  onView: (id: string) => void;
  onDelete: (photo: VisiblePhoto) => void;
}) {
  function photoCard(photo: VisiblePhoto, index: number) {
    return (
      <figure className="memory-photo" key={photo.id}>
        <button
          type="button"
          className="memory-preview"
          aria-label={`View photo by ${photo.uploaderName}`}
          onClick={() => onView(photo.id)}
        >
          {/* Short-lived signed URLs keep real night photos private. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={`Uploaded by ${photo.uploaderName}`}
            loading={index === 0 ? 'eager' : 'lazy'}
          />
        </button>
        <figcaption>
          <span>{photo.uploaderName}</span>
          <time dateTime={photo.createdAt}>
            {new Date(photo.createdAt).toLocaleDateString('en', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
          {photo.uploadedByUserId === currentUserId && (
            <button
              type="button"
              disabled={deleting !== null}
              onClick={() => onDelete(photo)}
              aria-label="Delete your photo"
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          )}
        </figcaption>
      </figure>
    );
  }
  return (
    <>
      <div className="memory-collage" data-count={Math.min(photos.length, 3)}>
        {photos.slice(0, 3).map(photoCard)}
      </div>
      {photos.length > 3 && (
        <details className="memory-more">
          <summary>See all {photos.length} photos</summary>
          <div className="memory-grid">
            {photos.slice(3).map((photo, index) => photoCard(photo, index + 3))}
          </div>
        </details>
      )}
    </>
  );
}
