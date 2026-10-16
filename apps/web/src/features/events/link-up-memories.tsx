'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Camera, Images, Scan, Upload } from 'lucide-react';
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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  const scrollToGallery = useRef(false);
  useEffect(() => {
    if (!galleryOpen || !scrollToGallery.current || uploadOpen) return;
    galleryRef.current?.scrollIntoView({ block: 'start' });
    galleryRef.current?.focus({ preventScroll: true });
    scrollToGallery.current = false;
  }, [galleryOpen, uploadOpen]);
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
            <button
              type="button"
              onClick={() => {
                scrollToGallery.current = true;
                setGalleryOpen(true);
                if (galleryRef.current) {
                  galleryRef.current.scrollIntoView({ block: 'start' });
                  galleryRef.current.focus({ preventScroll: true });
                  scrollToGallery.current = false;
                }
              }}
            >
              <Images size={18} aria-hidden="true" />
              <span>View photos</span>
            </button>
          </div>
          <p id="sharing-status" className={styles['availability']}>
            No sign-in needed. Photos are public.
          </p>
        </div>
        <div className={styles['albumPreview']}>
          <div className={styles['albumFrames']} aria-hidden="true">
            <div className={styles['backFrame']} />
            <div className={styles['middleFrame']} />
            <div className={styles['frontFrame']}>
              <Scan className={styles['viewfinder']} strokeWidth={0.7} />
              <Camera size={34} strokeWidth={1.1} />
              <span>The Link Up</span>
            </div>
          </div>
        </div>
      </section>
      {uploadState !== 'unopened' && (
        <PhotoUploader
          open={uploadOpen}
          onClose={() => {
            setUploadState('closed');
            if (galleryOpen) scrollToGallery.current = true;
          }}
          onPublished={() => {
            setGalleryOpen(true);
            setRevision((value) => value + 1);
          }}
        />
      )}
      {galleryOpen && (
        <div ref={galleryRef} tabIndex={-1} className={styles['galleryAnchor']}>
          <PhotoGallery revision={revision} onAddPhotos={() => setUploadState('open')} />
        </div>
      )}
    </>
  );
}
