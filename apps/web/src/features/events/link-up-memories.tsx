'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  return (
    <>
      <section className={styles['memories']} id="memories" aria-labelledby="memories-heading">
        <div className={styles['memoryCopy']}>
          <div className={styles['sectionLabel']}>
            <span className={styles['eyebrow']}>Our shared album</span>
          </div>
          <h2 id="memories-heading">
            Share the <em>Night.</em>
          </h2>
          <p className={styles['description']}>
            Got a moment worth remembering? Drop your photos and relive the night together.
          </p>
          <div className={styles['photoActions']}>
            <button type="button" onClick={() => setUploadOpen(true)}>
              <Upload size={18} aria-hidden="true" />
              <span>Upload Photos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGalleryOpen(true);
                window.setTimeout(
                  () =>
                    document.getElementById('shared-gallery')?.scrollIntoView({ block: 'start' }),
                  100,
                );
              }}
            >
              <Images size={18} aria-hidden="true" />
              <span>View Gallery</span>
            </button>
          </div>
          <p id="sharing-status" className={styles['availability']}>
            No account needed. Photos are shared publicly through this gallery.
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
          <p>A little space for a night to remember.</p>
          <span className={styles['previewLabel']}>Your memories belong here.</span>
        </div>
      </section>
      {uploadOpen && (
        <PhotoUploader
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onPublished={() => {
            setGalleryOpen(true);
            setRevision((value) => value + 1);
          }}
        />
      )}
      {galleryOpen && <PhotoGallery revision={revision} />}
    </>
  );
}
