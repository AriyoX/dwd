'use client';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { Images, Upload } from 'lucide-react';
import styles from './the-link-up.module.css';

const PhotoUploader = dynamic(
  () => import('./photo-uploader').then((module) => module.PhotoUploader),
  { ssr: false },
);
const PhotoGallery = dynamic(
  () => import('./photo-gallery').then((module) => module.PhotoGallery),
  { ssr: false, loading: () => <p role="status">Loading memories…</p> },
);

export function LinkUpMemories() {
  const [uploadState, setUploadState] = useState<'unopened' | 'open' | 'closed'>('unopened');
  const uploadOpen = uploadState === 'open';
  const [revision, setRevision] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  function viewGallery() {
    galleryRef.current?.scrollIntoView({ block: 'start' });
    galleryRef.current?.focus({ preventScroll: true });
  }
  return (
    <>
      <section className={styles['memories']} id="memories" aria-labelledby="memories-heading">
        <div className={styles['memoryCopy']}>
          <h2 id="memories-heading">
            Our <em>memories.</em>
          </h2>
          <div className={styles['photoActions']}>
            <button type="button" onClick={() => setUploadState('open')}>
              <Upload size={18} aria-hidden="true" />
              <span>Add photos</span>
            </button>
            <button type="button" onClick={viewGallery}>
              <Images size={18} aria-hidden="true" />
              <span>View photos</span>
            </button>
          </div>
          <p id="sharing-status" className={styles['availability']}>
            No sign-in needed. Photos are public.
          </p>
        </div>
      </section>
      {uploadState !== 'unopened' && (
        <PhotoUploader
          open={uploadOpen}
          onClose={() => {
            setUploadState('closed');
          }}
          onPublished={() => {
            setRevision((value) => value + 1);
          }}
        />
      )}
      <div ref={galleryRef} tabIndex={-1} className={styles['galleryAnchor']}>
        <PhotoGallery revision={revision} onAddPhotos={() => setUploadState('open')} />
      </div>
    </>
  );
}
