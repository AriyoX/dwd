'use client';
import { useEffect, useRef, useState } from 'react';
import { TonightBanners } from '@/features/ads/tonight-banners';
import styles from './quick-log.module.css';

export function QuickLogAds() {
  const dock = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(180);
  useEffect(() => {
    if (!dock.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.target.getBoundingClientRect().height);
    });
    observer.observe(dock.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden="true" style={{ height: height + 24 }} />
      <div ref={dock} className={styles['adDock']}>
        <TonightBanners compact />
      </div>
    </>
  );
}
