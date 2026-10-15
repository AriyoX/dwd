'use client';
import { useEffect, useRef } from 'react';
import { TonightBanners } from '@/features/ads/tonight-banners';
import styles from './quick-log.module.css';

export function QuickLogAds() {
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dock.current) return;
    const shell = dock.current.closest('main');
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        shell?.style.setProperty(
          '--quick-ad-height',
          `${entry.target.getBoundingClientRect().height}px`,
        );
    });
    observer.observe(dock.current);
    return () => {
      observer.disconnect();
      shell?.style.removeProperty('--quick-ad-height');
    };
  }, []);
  return (
    <>
      <div ref={dock} className={styles['adDock']}>
        <TonightBanners compact />
      </div>
    </>
  );
}
