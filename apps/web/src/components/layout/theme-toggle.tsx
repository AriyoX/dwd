'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset['theme'] === 'dark');
    queueMicrotask(sync);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      try {
        if (localStorage.getItem('dwd-theme')) return;
      } catch {
        /* Use system preference. */
      }
      document.documentElement.dataset['theme'] = media.matches ? 'dark' : 'light';
      sync();
    };
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, []);
  return (
    <button
      type="button"
      className="theme-toggle button button-secondary"
      aria-label={dark ? 'Use light mode' : 'Use dark mode'}
      onClick={() => {
        const theme = dark ? 'light' : 'dark';
        document.documentElement.dataset['theme'] = theme;
        try {
          localStorage.setItem('dwd-theme', theme);
        } catch {
          /* Preference lasts for this page. */
        }
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      <span>{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
