'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Megaphone, Moon } from 'lucide-react';
import { HOUSE_BANNERS, isPublicHttpsUrl, parseBannerAds, type BannerAd } from '@dwd/core';
import styles from './tonight-banners.module.css';

export function TonightBanners() {
  const [ads, setAds] = useState(HOUSE_BANNERS);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [visible, setVisible] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const placement = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const trackId = useId();

  useEffect(() => {
    const configuredFeed = process.env['NEXT_PUBLIC_DWD_ADS_URL']?.trim();
    const feedUrl = configuredFeed || '/tonight-ads.json';
    if (configuredFeed && !isPublicHttpsUrl(configuredFeed)) return;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let mounted = true;
    const replaceAds = (next: BannerAd[]) => {
      if (!mounted) return;
      setAds(
        configuredFeed
          ? next
          : next.map((ad) => {
              // The bundled feed's DWD artwork is also available on previews/local web.
              const image = ad.imageUrl ? new URL(ad.imageUrl) : null;
              return image?.origin === 'https://dwdug.vercel.app'
                ? { ...ad, imageUrl: image.pathname }
                : ad;
            }),
      );
      setActive(0);
      track.current?.scrollTo({ left: 0, behavior: 'instant' });
    };
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      clearTimeout(timeout);
      const request = new AbortController();
      controller = request;
      timeout = setTimeout(() => {
        replaceAds(HOUSE_BANNERS);
        request.abort();
      }, 6000);
      const timer = timeout;
      void fetch(feedUrl, { signal: request.signal, credentials: 'omit' })
        .then(async (response) => {
          if (!response.ok) return null;
          const value: unknown = await response.json();
          return parseBannerAds(value);
        })
        .then((next) => {
          if (!request.signal.aborted) replaceAds(next ?? HOUSE_BANNERS);
        })
        .catch(() => {
          if (!request.signal.aborted) replaceAds(HOUSE_BANNERS);
        })
        .finally(() => clearTimeout(timer));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      mounted = false;
      controller?.abort();
      clearTimeout(timeout);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const show = useCallback((index: number, animate = true) => {
    const card = track.current?.children.item(index);
    if (!(card instanceof HTMLElement) || !track.current) return;
    const first = track.current.firstElementChild;
    track.current.scrollTo({
      left: card.offsetLeft - (first instanceof HTMLElement ? first.offsetLeft : 0),
      behavior:
        !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
    });
    setActive(index);
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReduced(motion.matches);
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    updateMotion();
    updateVisibility();
    motion.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry?.isIntersecting ?? false),
    );
    if (placement.current) observer.observe(placement.current);
    return () => {
      motion.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
      observer.disconnect();
    };
  }, [ads.length]);

  useEffect(() => {
    if (ads.length < 2 || hovered || focused || touching || !visible || !inView || reduced) return;
    const timer = setTimeout(() => {
      const next = (active + 1) % ads.length;
      show(next, next !== 0);
    }, 5000);
    return () => clearTimeout(timer);
  }, [active, ads, hovered, focused, touching, visible, inView, reduced, show]);

  if (!ads.length) return null;
  return (
    <section
      ref={placement}
      className={styles['placement']}
      aria-labelledby={headingId}
      aria-roledescription="carousel"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
        setTouching(false);
      }}
      onPointerDown={() => setTouching(true)}
      onPointerUp={() => setTouching(false)}
      onPointerCancel={() => setTouching(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className={styles['heading']}>
        <h2 id={headingId}>Featured</h2>
        {ads.length > 1 ? (
          <div className={styles['arrows']}>
            <button
              type="button"
              aria-label="Previous banner"
              aria-controls={trackId}
              disabled={active === 0}
              onClick={() => show(active - 1)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next banner"
              aria-controls={trackId}
              disabled={active === ads.length - 1}
              onClick={() => show(active + 1)}
            >
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
      <div
        id={trackId}
        className={styles['track']}
        ref={track}
        tabIndex={0}
        aria-label="Featured banners"
        onScroll={() => {
          const container = track.current;
          if (!container) return;
          const cards = Array.from(container.children);
          const first = cards[0];
          const start = first instanceof HTMLElement ? first.offsetLeft : 0;
          let closest = 0;
          let distance = Infinity;
          cards.forEach((card, index) => {
            if (!(card instanceof HTMLElement)) return;
            const delta = Math.abs(card.offsetLeft - start - container.scrollLeft);
            if (delta < distance) {
              closest = index;
              distance = delta;
            }
          });
          setActive(closest);
        }}
      >
        {ads.map((ad, index) => (
          <BannerCard
            key={`${ad.id}:${ad.imageUrl ?? ''}`}
            ad={ad}
            index={index}
            total={ads.length}
          />
        ))}
      </div>
      {ads.length > 1 ? (
        <div className={styles['pagination']} role="group" aria-label="Choose a banner">
          {ads.map((ad, index) => (
            <button
              type="button"
              key={ad.id}
              aria-label={`Show banner ${index + 1} of ${ads.length}`}
              aria-pressed={active === index}
              aria-controls={trackId}
              onClick={() => show(index)}
            >
              <span />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BannerCard({ ad, index, total }: { ad: BannerAd; index: number; total: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = ad.url ?? (ad.route === '/join' ? '#join-night' : (ad.route ?? '/home'));
  const artwork = ad.imageUrl && !imageFailed;
  return (
    <Link
      className={`${styles['banner']} ${styles[ad.tone] ?? ''}`}
      href={href}
      {...(ad.sponsored ? { target: '_blank', rel: 'sponsored noopener noreferrer' } : {})}
      aria-label={`${ad.sponsored ? `Sponsored by ${ad.advertiser}. ` : ''}${ad.title}. ${ad.cta}. Banner ${index + 1} of ${total}${ad.sponsored ? '. Opens in a new tab' : ''}`}
    >
      {artwork ? (
        <>
          <Image
            className={styles['artwork']}
            src={ad.imageUrl ?? ''}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 600px) 90vw, 520px"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
          <span className={styles['shade']} aria-hidden="true" />
        </>
      ) : (
        <span className={styles['decoration']} aria-hidden="true">
          {ad.sponsored ? <Megaphone size={56} /> : <Moon size={56} />}
        </span>
      )}
      <span className={styles['advertiser']}>
        {ad.sponsored ? `Sponsored · ${ad.advertiser}` : ad.advertiser}
      </span>
      <strong className={styles['title']}>{ad.title}</strong>
      <span className={`${styles['cta']} ${artwork ? styles['imageCta'] : ''}`}>
        {ad.cta} <ArrowRight size={17} aria-hidden="true" />
      </span>
    </Link>
  );
}
