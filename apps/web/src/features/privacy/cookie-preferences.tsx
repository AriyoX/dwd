'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './cookies.module.css';

type Choice = 'essential' | 'all';
type DemoEntry = 'drink' | 'chaser';
type PreviewLayout = 'tilted' | 'straight';
const preferenceCookie = 'dwd_cookie_choice_v1';
const layoutCookie = 'dwd_preview_layout_v1';
const demoCookie = 'dwd_preview_demo_v1';
const initialDemo: DemoEntry[] = ['drink', 'chaser', 'drink'];
const day = 86400;

function readCookie(name: string): string | null {
  try {
    const value = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
    return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAge: number) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {
    // Cookie restrictions must never prevent logging or changing preferences.
  }
}

function readChoice(): Choice | null {
  const value = readCookie(preferenceCookie);
  return value === 'all' || value === 'essential' ? value : null;
}

function clearOptionalCookies() {
  writeCookie(layoutCookie, '', 0);
  writeCookie(demoCookie, '', 0);
}

function readDemo(): DemoEntry[] {
  try {
    const value: unknown = JSON.parse(readCookie(demoCookie) ?? 'null');
    if (
      Array.isArray(value) &&
      value.length <= 100 &&
      value.every((entry: unknown) => entry === 'drink' || entry === 'chaser')
    )
      return value as DemoEntry[];
  } catch {
    // Ignore outdated or malformed demo data.
  }
  return initialDemo;
}

interface CookiePreferencesValue {
  optional: boolean;
  previewLayout: PreviewLayout;
  demo: DemoEntry[];
  updateDemo: (entries: DemoEntry[]) => void;
  openSettings: (trigger: HTMLButtonElement) => void;
}
const CookieContext = createContext<CookiePreferencesValue | null>(null);

export function CookiePreferences({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>('tilted');
  const [demo, setDemo] = useState(initialDemo);
  const prompt = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const currentChoice = useRef<Choice | null>(null);

  useEffect(() => {
    let active = true;
    function sync() {
      if (!active) return;
      const saved = readChoice();
      currentChoice.current = saved;
      setChoice(saved);
      setOpen(saved === null);
      if (saved === 'all') {
        setPreviewLayout(readCookie(layoutCookie) === 'straight' ? 'straight' : 'tilted');
        setDemo(readDemo());
      } else {
        clearOptionalCookies();
        setPreviewLayout('tilted');
      }
    }
    function onFocus() {
      if (readChoice() !== currentChoice.current) sync();
    }
    queueMicrotask(sync);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (open && trigger.current) {
      prompt.current?.focus();
      prompt.current?.scrollIntoView({ block: 'center' });
    }
  }, [open]);

  function choose(next: Choice) {
    writeCookie(preferenceCookie, next, 180 * day);
    currentChoice.current = next;
    setChoice(next);
    if (next === 'all') {
      const existing = readCookie(layoutCookie);
      const layout =
        existing === 'tilted' || existing === 'straight'
          ? existing
          : (crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) % 2 === 0
            ? 'tilted'
            : 'straight';
      writeCookie(layoutCookie, layout, 30 * day);
      writeCookie(demoCookie, JSON.stringify(demo), 30 * day);
      setPreviewLayout(layout);
    } else {
      clearOptionalCookies();
      setPreviewLayout('tilted');
    }
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
    trigger.current = null;
  }

  function updateDemo(entries: DemoEntry[]) {
    const limited = entries.slice(-100);
    setDemo(limited);
    if (readChoice() === 'all') writeCookie(demoCookie, JSON.stringify(limited), 30 * day);
  }

  return (
    <CookieContext.Provider
      value={{
        optional: choice === 'all',
        previewLayout,
        demo,
        updateDemo,
        openSettings: (button) => {
          trigger.current = button;
          setOpen(true);
          if (open) {
            prompt.current?.focus();
            prompt.current?.scrollIntoView({ block: 'center' });
          }
        },
      }}
    >
      {open && (
        <section
          className={styles['banner']}
          aria-label="Cookie preferences"
          tabIndex={-1}
          ref={prompt}
        >
          <div className={styles['copy']}>
            <h2>A few cookies?</h2>
            <p>
              Essential cookies keep DWD working. Allow optional cookies to remember your homepage
              demo and try small layout changes? Your drink logs work either way.{' '}
              <Link className="text-link" href="/privacy#browser-storage">
                Cookie details
              </Link>
            </p>
          </div>
          <div className={styles['actions']}>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => choose('essential')}
            >
              Essential only
            </button>
            <button className="button button-secondary" type="button" onClick={() => choose('all')}>
              Allow optional cookies
            </button>
            {choice && (
              <button
                className="button button-ghost"
                type="button"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus({ preventScroll: true });
                  trigger.current = null;
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      )}
      {children}
    </CookieContext.Provider>
  );
}

export function useCookiePreferences() {
  const context = useContext(CookieContext);
  if (!context) throw new Error('Cookie preferences require the root provider.');
  return context;
}

export function CookieSettingsButton() {
  const { openSettings } = useCookiePreferences();
  return (
    <button
      className={styles['settings']}
      type="button"
      onClick={(event) => openSettings(event.currentTarget)}
    >
      Cookie settings
    </button>
  );
}
