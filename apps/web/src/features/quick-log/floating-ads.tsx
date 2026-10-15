'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { createAdDismissal } from '@dwd/contracts';
import { TonightBanners } from '@/features/ads/tonight-banners';
import styles from './quick-log.module.css';

const dismissal = createAdDismissal();

export function QuickLogAds() {
  const hidden = useSyncExternalStore(dismissal.subscribe, dismissal.isHidden, () => false);
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dock.current) return;
    const shell = dock.current.closest('main');
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        shell?.style.setProperty(
          '--quick-ad-height',
          `${entry.target.getBoundingClientRect().height + 12}px`,
        );
    });
    observer.observe(dock.current);
    return () => {
      observer.disconnect();
      shell?.style.removeProperty('--quick-ad-height');
    };
  }, [hidden]);
  if (hidden) return null;
  return (
    <div ref={dock} className={styles['adDock']}>
      <TonightBanners compact />
      <button
        type="button"
        className={styles['adClose']}
        aria-label="Hide ads for 7 minutes"
        title="Hide ads for 7 minutes"
        onClick={dismissal.dismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
