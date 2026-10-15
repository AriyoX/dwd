import { Camera, Images, Scan, Upload } from 'lucide-react';
import styles from './the-link-up.module.css';

// Replace this isolated placeholder with upload and gallery entry points when ready.
// No file inputs, sample photos or success states are exposed before sharing is available.
export function LinkUpMemories() {
  return (
    <section className={styles['memories']} id="memories" aria-labelledby="memories-heading">
      <div className={styles['memoryCopy']}>
        <div className={styles['sectionLabel']}>
          <span className={styles['eyebrow']}>Our shared album</span>
          <span className={styles['comingSoon']}>Coming soon</span>
        </div>
        <h2 id="memories-heading">
          Share the <em>Night.</em>
        </h2>
        <p className={styles['description']}>
          Got a moment worth remembering? Drop your photos and relive the night together.
        </p>
        <div className={styles['photoActions']}>
          <button type="button" disabled aria-describedby="sharing-status">
            <Upload size={18} aria-hidden="true" />
            <span>Upload Photos</span>
            <span className={styles['actionStatus']}>Soon</span>
          </button>
          <button type="button" disabled aria-describedby="sharing-status">
            <Images size={18} aria-hidden="true" />
            <span>View Gallery</span>
            <span className={styles['actionStatus']}>Soon</span>
          </button>
        </div>
        <p id="sharing-status" className={styles['availability']}>
          Photo uploads and the shared gallery are coming soon.
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
  );
}
