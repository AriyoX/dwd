'use client';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TURNSTILE_ACTION } from './photo-contracts';

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function PhotoTurnstile({
  resetKey,
  onToken,
}: {
  resetKey: number;
  onToken: (token: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);
  const ready = useCallback(() => setLoaded(true), []);
  useEffect(() => {
    if ((!loaded && !window.turnstile) || !element.current || !window.turnstile) return;
    const api = window.turnstile;
    const widget = api.render(element.current, {
      sitekey: process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'] ?? '',
      action: TURNSTILE_ACTION,
      theme: 'dark',
      callback: (value) => {
        setFailed(false);
        callback.current(value);
      },
      'expired-callback': () => callback.current(''),
      'error-callback': () => {
        setFailed(true);
        callback.current('');
      },
    });
    return () => api.remove(widget);
  }, [loaded, resetKey]);
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={ready}
        onError={() => setFailed(true)}
      />
      <div ref={element} />
      {failed && (
        <p role="alert">
          Verification could not load. Check your connection and refresh verification.
        </p>
      )}
    </>
  );
}
